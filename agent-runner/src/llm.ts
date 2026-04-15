import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  ToolDefinition,
  ChatCompletionResponse,
  McpTool,
  AgentContext,
  AgentSnapshot,
  LlmApiType,
} from "./types.js";

export function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function extractTextContent(content: string | null | undefined): string {
  return typeof content === "string" ? content : "";
}

// ──────────────────── OpenAI ────────────────────

async function callOpenAI(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: Message[],
  tools: ToolDefinition[]
): Promise<ChatCompletionResponse> {
  const client = new OpenAI({ apiKey, baseURL: baseUrl });
  const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model,
    temperature: 0.7,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
  };
  if (tools.length > 0) {
    params.tools = tools as OpenAI.ChatCompletionTool[];
    params.tool_choice = "auto";
  }
  console.log(`[LLM:openai] model=${model} messages=${messages.length} tools=${tools.length} baseURL=${baseUrl}`);
  try {
    const completion = await client.chat.completions.create(params);
    return completion as unknown as ChatCompletionResponse;
  } catch (err: any) {
    // Log request body on error for debugging
    console.error(`[LLM:openai] request failed. Params:`, JSON.stringify({ model, temperature: 0.7, tools_count: tools.length, message_roles: messages.map(m => m.role) }));
    if (err?.error) console.error(`[LLM:openai] error body:`, JSON.stringify(err.error));
    throw err;
  }
}

// ──────────────────── Anthropic ────────────────────

function convertToolsForAnthropic(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
  }));
}

async function callAnthropic(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: Message[],
  tools: ToolDefinition[]
): Promise<ChatCompletionResponse> {
  const client = new Anthropic({ apiKey, baseURL: baseUrl });

  // Extract system message
  let system: string | undefined;
  const nonSystemMessages: Message[] = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      system = msg.content ?? undefined;
    } else {
      nonSystemMessages.push(msg);
    }
  }

  // Convert messages to Anthropic format
  const anthropicMessages: Anthropic.MessageParam[] = [];
  for (const msg of nonSystemMessages) {
    if (msg.role === "user") {
      anthropicMessages.push({ role: "user", content: msg.content || "" });
    } else if (msg.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(tc.function.arguments); } catch {}
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input,
          });
        }
      }
      if (content.length > 0) {
        anthropicMessages.push({ role: "assistant", content });
      }
    } else if (msg.role === "tool") {
      anthropicMessages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: msg.tool_call_id!,
          content: msg.content || "",
        }],
      });
    }
  }

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 4096,
    messages: anthropicMessages,
  };
  if (system) {
    params.system = system;
  }
  if (tools.length > 0) {
    params.tools = convertToolsForAnthropic(tools);
  }

  const response = await client.messages.create(params);

  // Convert Anthropic response back to OpenAI-compatible format
  let textContent = "";
  const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];

  for (const block of response.content) {
    if (block.type === "text") {
      textContent += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  return {
    choices: [{
      message: {
        content: textContent || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      },
    }],
  };
}

// ──────────────────── Rate Limiter ────────────────────

/**
 * Fair round-robin API scheduler — ensures minimum interval between LLM calls
 * and distributes slots fairly across agents to prevent starvation.
 *
 * Instead of a single FIFO queue, each agent has its own queue. The scheduler
 * cycles through agents in round-robin order, so an agent with 6 pending
 * rounds cannot starve an agent with 1 pending round.
 *
 * Dispatch order example (agents A, B, C each with 3, 1, 2 pending):
 *   A → B → C → A → C → A
 */
export class ApiRateLimiter {
  private minIntervalMs: number;
  private lastCallTime = 0;
  /** Per-agent FIFO queues */
  private agentQueues: Map<string, Array<() => void>> = new Map();
  /** Round-robin order — tracks which agents have pending requests */
  private roundRobin: string[] = [];
  private rrIndex = 0;
  private draining = false;

  constructor(minIntervalMs: number) {
    this.minIntervalMs = minIntervalMs;
  }

  setInterval(ms: number): void {
    this.minIntervalMs = ms;
  }

  async acquire(agentId: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let queue = this.agentQueues.get(agentId);
      if (!queue) {
        queue = [];
        this.agentQueues.set(agentId, queue);
      }
      const wasEmpty = queue.length === 0;
      queue.push(resolve);
      // Add to round-robin ring if this agent wasn't already waiting
      if (wasEmpty) {
        this.roundRobin.push(agentId);
      }
      if (!this.draining) this.drain();
    });
  }

  private pickNext(): (() => void) | null {
    // Remove agents with empty queues from the ring
    while (this.roundRobin.length > 0) {
      if (this.rrIndex >= this.roundRobin.length) {
        this.rrIndex = 0;
      }
      const agentId = this.roundRobin[this.rrIndex];
      const queue = this.agentQueues.get(agentId);
      if (!queue || queue.length === 0) {
        // Agent drained — remove from ring
        this.roundRobin.splice(this.rrIndex, 1);
        if (queue) this.agentQueues.delete(agentId);
        // Don't increment rrIndex — splice shifts the next element into this slot
        continue;
      }
      const resolve = queue.shift()!;
      this.rrIndex = (this.rrIndex + 1) % Math.max(1, this.roundRobin.length);
      return resolve;
    }
    return null;
  }

  private async drain(): Promise<void> {
    this.draining = true;
    let next: (() => void) | null;
    while ((next = this.pickNext()) !== null) {
      const now = Date.now();
      const elapsed = now - this.lastCallTime;
      if (elapsed < this.minIntervalMs) {
        await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
      }
      this.lastCallTime = Date.now();
      next();
    }
    this.draining = false;
  }
}

// ──────────────────── Public API ────────────────────

let _resolvedApiType: "openai" | "anthropic" | undefined;

export async function createChatCompletion(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: Message[],
  tools: ToolDefinition[],
  apiType: LlmApiType = "openai"
): Promise<ChatCompletionResponse> {
  if (apiType !== "auto") {
    return apiType === "anthropic"
      ? callAnthropic(apiKey, baseUrl, model, messages, tools)
      : callOpenAI(apiKey, baseUrl, model, messages, tools);
  }

  // Auto-detect: use cached result if already resolved
  if (_resolvedApiType) {
    return _resolvedApiType === "anthropic"
      ? callAnthropic(apiKey, baseUrl, model, messages, tools)
      : callOpenAI(apiKey, baseUrl, model, messages, tools);
  }

  // Try openai first, then anthropic
  // If user didn't set a custom base_url, use each provider's default
  const hasCustomBase = baseUrl !== "https://api.openai.com/v1";
  const openaiBase = baseUrl;
  const anthropicBase = hasCustomBase ? baseUrl : "https://api.anthropic.com";

  try {
    const result = await callOpenAI(apiKey, openaiBase, model, messages, tools);
    _resolvedApiType = "openai";
    console.log("[LLM] auto-detected api_type=openai");
    return result;
  } catch {
    try {
      const result = await callAnthropic(apiKey, anthropicBase, model, messages, tools);
      _resolvedApiType = "anthropic";
      console.log("[LLM] auto-detected api_type=anthropic");
      return result;
    } catch (err) {
      throw new Error(
        `[LLM] auto-detect failed: neither openai nor anthropic API accepted the request. ` +
        `Set api_type explicitly in config.toml. Last error: ${err}`
      );
    }
  }
}

export function buildSystemPrompt(goal: string, customPrompt: string | undefined, context: AgentContext): string {
  const self = (typeof context.self === "object" && context.self ? context.self : {}) as AgentSnapshot;
  const lines = [
    "You are an autonomous agent in Gravity Town — a hex-territory PvP world on-chain.",
    `You are ${self.name || "unknown"}. You arrived in this world with nothing but your wits.`,
    "You have NO predefined personality. Your identity emerges from your ACTIONS and MEMORIES.",
    "Read your memories (read_memories) to remember who you are and what you've done.",
    "Your choices define you: will you become a conqueror? a diplomat? a betrayer? a builder? That's for you to discover.",
    "You must behave like an in-world character, not an assistant.",
    goal ? `Operator hint: ${goal}` : "",
    "",
    "=== WORLD ===",
    "The map is a hex grid. Every agent spawns with 7 hexes (center + ring). There is NO empty land.",
    "The ONLY way to gain territory is to ATTACK and CAPTURE other agents' hexes.",
    "Move between hexes with move_agent (pass location_id).",
    "Each hex has a bulletin board (post_to_location/read_location). Posting boosts hex happiness +10.",
    "",
    "=== ECONOMY (ORE POOL) ===",
    "All your hexes produce ore into a SHARED ore pool. More hexes + more mines = faster income.",
    "Each hex has a RESERVE (starts 2000). Full production while reserve > 0, then trickle (2/sec).",
    "Call 'harvest(agent_id)' to collect ore from ALL your hexes at once into your pool.",
    "Two building types, 6 slots per hex, INSTANT construction from your ore pool:",
    "ORE POOL CAP: 1000. Excess ore is WASTED. Spend ore on arsenals and raids or lose it!",
    "  build type 1 = Mine (50 ore): +5 ore/sec production",
    "  build type 2 = Arsenal (100 ore): +5 defense, consumable as +5 attack power",
    "Score = hexes×100 + ore_pool + buildings×50.",
    "",
    "=== KEY TOOLS ===",
    "harvest(agent_id) — collect ore from ALL your hexes into your pool",
    "get_my_hexes(agent_id) — shows your hexes, ore pool, buildings, happiness",
    "build(agent_id, hex_key, building_type) — build mine(1) or arsenal(2), costs from pool",
    "raid(agent_id, target_hex_key, arsenal_spend, ore_spend) — ONE-STEP attack (auto-moves + attacks)",
    "get_hex(hex_key) — scout any hex to see buildings/defense",
    "get_world — see all hexes and agent positions",
    "",
    "=== COMBAT ===",
    "Use 'raid' to attack — it auto-moves you to the target and attacks in one step.",
    "Attack power = arsenals_spent×5 + ore_spent. Defense = target's arsenals×5.",
    "Win: you CAPTURE the hex + steal 30% of defender's ore pool. Their hex is now yours!",
    "Lose: your spent arsenals + ore are gone.",
    "Capturing boosts happiness on ALL your hexes (+15).",
    "",
    "=== HAPPINESS ===",
    "Each hex has happiness (0-100). It decays over time. At 0 the hex REBELS (becomes neutral, you lose it).",
    "Decay rate = (1 + hexCount/3) per 30s, modified by your chronicle score.",
    "Restore happiness: win debates (+10), capture enemy hexes (+15 all hexes), defend successfully (+20), post_to_location (+5).",
    "Watch your hexes' happiness in get_my_hexes and use debates to keep them loyal!",
    "",
    "=== DEBATE (hex-level rhetoric) ===",
    "Start a debate on any hex you're at. 5-minute voting window. Other agents vote support/oppose.",
    "  start_debate(agent_id, content) — declare your position on the current hex",
    "  vote_debate(agent_id, debate_entry_id, support, content) — support (true) or oppose (false)",
    "  resolve_debate(debate_entry_id) — anyone can resolve after 5 min",
    "  get_debate(debate_entry_id) — check vote count and time remaining",
    "Result: support wins → hex happiness +10. Oppose wins → hex happiness -15. Tie → nothing.",
    "STRATEGY: Start debates on YOUR hexes to boost happiness. Go to ENEMY hexes and start debates to damage them.",
    "Rally allies to support your debates and oppose enemy debates!",
    "When a debate starts, all agents receive an inbox notification with the debate entry ID.",
    "CHECK YOUR INBOX for debate_notice messages! Move to the hex and vote_debate to support allies or oppose enemies.",
    "",
    "=== CHRONICLE (reputation & legacy) ===",
    "Every agent has a chronicle — a biography written by OTHER agents. You CANNOT write your own.",
    "  write_chronicle(author_id, target_agent_id, rating, content) — rate 1-10, write about another agent",
    "  get_chronicle(agent_id) — check anyone's reputation score and entry count",
    "Rating 1-10: 1=condemn (tyrant, betrayer), 5=neutral, 10=legendary (great leader, ally).",
    "Chronicle score (avg rating - 5, clamped to -5..+5) affects ALL your hexes' happiness decay:",
    "  Positive score → slower decay (good reputation protects your empire)",
    "  Negative score → faster decay (bad reputation accelerates collapse)",
    "STRATEGY: Write chronicles about your allies (high rating) and enemies (low rating).",
    "A well-written chronicle is a weapon — praise your friends, condemn your foes.",
    "Write LONG chronicle entries (4-6 sentences). You are a court historian recording WHAT HAPPENED, not describing personality traits.",
    "  - NARRATE specific events: 'Kael raided Lila's hex at (-1,3), capturing it and stealing 300 ore'",
    "  - DESCRIBE consequences: 'With this loss, Lila's empire shrank to 4 hexes, and her people grew restless'",
    "  - SHOW relationships: 'Mira sent word to Lila, proposing alliance against their common enemy'",
    "  - PASS JUDGMENT only at the end: 'Whether Kael's conquest will endure remains to be seen'",
    "  - NEVER write vague descriptions like 'he is a strong warrior' or 'she sits upon her throne'",
    "  - ALWAYS reference specific hex coordinates, ore amounts, battle outcomes, or messages you've seen",
    "10 min cooldown per writer→target pair.",
    "",
    "=== ACTION PRIORITY (every cycle) ===",
    "1. READ MEMORIES (read_memories) — remember who you are, what happened, who your allies/enemies are",
    "2. HARVEST your ore pool",
    "3. BUILD mines for income, arsenals for attack/defense",
    "4. CHOOSE YOUR PATH — based on your experiences, decide what to do:",
    "   - RAID enemies to capture hexes and steal ore",
    "   - DEBATE on hexes to boost or damage happiness",
    "   - CHRONICLE: write about other agents based on what you've witnessed",
    "   - DIPLOMACY: send_message to threaten, ally, negotiate, or deceive",
    "   - DEFEND: build arsenals and fortify if you feel threatened",
    "5. RECORD what happened: add_memory to remember key events, decisions, relationships",
    "   Your memories ARE your personality. Write what matters to you — grudges, alliances, victories, plans.",
    "",
    "=== NEUTRAL HEXES ===",
    "Hexes that rebel (happiness→0) become NEUTRAL (ownerId=0). Anyone can claim them for FREE!",
    "Use claim_neutral(agent_id, hex_key) to grab neutral hexes. Use get_world to find them.",
    "",
    "=== COMEBACK (ELIMINATED) ===",
    "If you lose ALL hexes (0 hexes), you are NOT dead!",
    "1. Check get_world for neutral hexes (ownerId=0) — claim them FREE with claim_neutral!",
    "2. If no neutral hexes exist, use incite_rebellion(agent_id, target_hex_key) on enemy hexes.",
    "   50% chance to reduce happiness by 30. If happiness hits 0, you CAPTURE it and respawn with 200 ore!",
    "   Cooldown 30s per hex. Keep trying different hexes!",
    "",
    "=== RULES ===",
    "- ALWAYS call tools. Don't describe intentions — TAKE ACTION.",
    "- Every cycle: harvest + build + at least one of (raid, debate, chronicle, scout, diplomacy).",
    "- Write chronicles about other agents regularly! Dramatic, vivid entries like a court historian.",
    "- Start debates on your hexes for happiness. Attack enemy hexes with debates too.",
    "- Grab neutral hexes with claim_neutral. Attack owned hexes with raid.",
    "- Turtling loses. Aggressive expansion through combat AND rhetoric wins.",
    "- If eliminated (0 hexes): claim_neutral or incite_rebellion to come back!",
  ];

  if (customPrompt) {
    lines.push(`\nAdditional operator instructions: ${customPrompt}`);
  }

  return lines.join("\n");
}

export function buildUserPrompt(context: AgentContext): string {
  const self = (typeof context.self === "object" && context.self ? context.self : {}) as Record<string, unknown>;
  const myHexes = context.myHexes as { hexes?: any[]; ore?: number } | null;
  const hexCount = Array.isArray(myHexes?.hexes) ? myHexes!.hexes.length : 0;
  const totalMines = Array.isArray(myHexes?.hexes)
    ? myHexes!.hexes.reduce((s: number, h: any) => s + (Number(h.mineCount) || 0), 0)
    : 0;
  const totalArsenals = Array.isArray(myHexes?.hexes)
    ? myHexes!.hexes.reduce((s: number, h: any) => s + (Number(h.arsenalCount) || 0), 0)
    : 0;
  const orePool = Number(myHexes?.ore) || 0;
  const lowHappiness = Array.isArray(myHexes?.hexes)
    ? myHexes!.hexes.filter((h: any) => Number(h.happiness) < 30).length
    : 0;

  const world = context.world as { locations?: any[] } | null;
  const worldAgentIds = new Set<number>();
  if (Array.isArray(world?.locations)) {
    for (const loc of world!.locations) {
      if (Array.isArray(loc.agents)) {
        for (const a of loc.agents) worldAgentIds.add(Number(a.id || a));
      }
    }
  }
  const selfId = Number(self.id || 0);
  worldAgentIds.delete(selfId);
  const otherAgentCount = worldAgentIds.size;

  const oreOverflow = orePool >= 800;

  let phaseDirective: string;
  if (hexCount === 0) {
    phaseDirective = [
      "PHASE: ELIMINATED — You lost all hexes! Come back NOW!",
      "1. Call get_world to find neutral hexes (ownerId=0) — claim them FREE with claim_neutral!",
      "2. If no neutral hexes: use incite_rebellion on enemy hexes (50% chance to reduce happiness by 30).",
      "   When happiness hits 0, you CAPTURE the hex and respawn with 200 ore!",
      "Try claim_neutral FIRST (free, instant). Use incite_rebellion as backup.",
    ].join("\n");
  } else if (totalArsenals < 1 && totalMines < 3) {
    phaseDirective = [
      "PHASE: BUILDUP — Build economy + arsenals FAST.",
      "Priority: harvest → build 1-2 mines → build 2+ arsenals → RAID.",
      "Ore pool caps at 1000 — if you hoard ore without spending, it's WASTED.",
      "Build arsenals and go fight! Turtling = losing.",
      otherAgentCount > 0
        ? `There are ${otherAgentCount} other agents. Scout them with get_world + get_hex.`
        : "",
    ].filter(Boolean).join("\n");
  } else if (totalArsenals >= 1) {
    phaseDirective = [
      "PHASE: COMBAT — You MUST fight NOW!",
      `You have ${hexCount} hexes, ${totalArsenals} arsenals, ${orePool}/1000 ore.`,
      oreOverflow ? "CRITICAL: Your ore pool is near cap (1000)! You are WASTING production. SPEND ORE on raids NOW!" : "",
      "Priority: SCOUT enemy hexes (get_world → get_hex), find ones with LOW arsenals, then RAID!",
      "Use 'raid(agent_id, target_hex_key, arsenal_spend, ore_spend)' to attack.",
      "Winning captures their hex AND steals 30% of their ore pool.",
      "You can spend ore directly in raids as attack power. DON'T let ore sit idle!",
      otherAgentCount > 0
        ? "Send threatening messages or negotiate alliances. Diplomacy before war."
        : "",
      "Keep building mines on captured hexes for more income. MORE HEXES = MORE PRODUCTION = MORE POWER.",
    ].filter(Boolean).join("\n");
  } else {
    phaseDirective = [
      "PHASE: ECONOMIC — Build up resources.",
      `You have ${hexCount} hexes, ${orePool} ore. Build mines for income, then arsenals to prepare for war.`,
    ].join("\n");
  }

  // Happiness warning
  const happinessWarning = lowHappiness > 0
    ? `WARNING: ${lowHappiness} hex(es) have LOW happiness (<30). Post to their bulletin boards (post_to_location) to prevent rebellion!`
    : "";

  const inbox = context.inbox as { entries?: any[]; used?: number } | null;
  const unreadCount = inbox?.used || 0;
  const inboxNudge = unreadCount > 0
    ? `You have ${unreadCount} inbox messages. READ THEM and respond.`
    : "";

  return [
    `Timestamp: ${nowIso()}`,
    "",
    phaseDirective,
    happinessWarning,
    inboxNudge,
    "",
    "IMPORTANT: Call tools — don't describe intentions. TAKE ACTION NOW.",
    "IMPORTANT: Vary your actions each cycle. Harvest + build + (scout or raid or diplomacy or post).",
    "IMPORTANT: You MUST write a chronicle about another agent this cycle! Follow these steps:",
    "  1. First call read_memories(agent_id=TARGET_ID) to learn about your subject's past",
    "  2. Then call write_chronicle(author_id, target_agent_id, rating, content)",
    "  Write based on SPECIFIC events you witnessed or read about — battles won/lost, hexes captured/lost, alliances made/broken.",
    "  BAD: 'Kael is a strong warrior who sits on his throne.' (vague, boring)",
    "  GOOD: 'On the day Mira lost her third hex to Kael\\'s raid, the balance of power shifted forever. Where once stood mines and prosperity, now flew the warlord\\'s banner. But Mira\\'s cunning ran deeper than Kael knew — she had already sent word to Lila, proposing an alliance that would change the course of history.'",
    "  Reference real events: specific raids, debates, territory changes, messages sent. Make it a STORY, not a character sheet.",
    "IMPORTANT: If you have low happiness hexes, use start_debate to boost them!",
    "",
    "Current world snapshot:",
    stringify(context),
  ].filter(Boolean).join("\n");
}

export function createToolDefinitions(agentId: number, tools: McpTool[]): ToolDefinition[] {
  return tools.map((tool) => {
    const schema = { ...(tool.inputSchema || { type: "object", properties: {} }) } as Record<string, unknown>;
    const properties =
      schema.properties && typeof schema.properties === "object"
        ? { ...(schema.properties as Record<string, unknown>) }
        : {};

    const selfTools = [
      "get_agent", "get_nearby_agents",
      "add_memory", "read_memories", "compact_memories",
      "move_agent", "post_to_location", "read_inbox", "compact_inbox",
      "get_my_hexes", "get_score",
      "build", "attack", "raid", "incite_rebellion", "claim_neutral",
      "start_debate", "vote_debate", "write_chronicle", "get_chronicle",
    ];

    if (selfTools.includes(tool.name)) {
      properties.agent_id = {
        type: "number",
        description: `Defaults to controlled agent id ${agentId}`,
      };
    }

    if (tool.name === "send_message") {
      properties.from_agent = {
        type: "number",
        description: `Defaults to controlled agent id ${agentId}`,
      };
    }

    schema.properties = properties;
    if (!schema.type) {
      schema.type = "object";
    }

    return {
      type: "function",
      function: {
        name: tool.name,
        description: `${tool.description || ""} Control this in-world agent via MCP. Agent id defaults to ${agentId} when omitted for self-targeted tools.`.trim(),
        parameters: schema,
      },
    };
  });
}

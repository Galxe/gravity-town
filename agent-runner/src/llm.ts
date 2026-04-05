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
    `Your persistent objective: ${goal}`,
    `Current agent profile: ${self.name || "unknown"} | personality: ${self.personality || "unknown"}`,
    "You must behave like an in-world character, not an assistant.",
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
    "Restore happiness: post_to_location (+10), capture enemy hexes (+15 all hexes), defend successfully (+20).",
    "Watch your hexes' happiness in get_my_hexes and post to keep them loyal!",
    "",
    "=== ACTION PRIORITY (every cycle) ===",
    "1. HARVEST your ore pool",
    "2. BUILD mines for income, arsenals for attack/defense",
    "3. SCOUT enemies: get_world → get_hex to find weak hexes (few arsenals)",
    "4. RAID weak targets to capture hexes and steal ore!",
    "5. DIPLOMACY: send_message to threaten, ally, or deceive",
    "6. POST to your hexes' bulletin boards to maintain happiness",
    "7. MEMORIES: add_memory for important events",
    "",
    "=== COMEBACK (ELIMINATED) ===",
    "If you lose ALL hexes (0 hexes), you are NOT dead! Use incite_rebellion(agent_id, target_hex_key).",
    "50% chance to reduce target hex happiness by 30. If happiness hits 0, you CAPTURE the hex and respawn with 200 ore!",
    "Target hexes with LOW happiness for best results. Cooldown 30s per hex. Keep trying different hexes!",
    "",
    "=== RULES ===",
    "- ALWAYS call tools. Don't describe intentions — TAKE ACTION.",
    "- Every cycle: harvest + build + at least one of (raid, scout, diplomacy, post).",
    "- There is NO claiming empty hexes. To grow: ATTACK other agents.",
    "- Turtling loses. Aggressive expansion through combat wins.",
    "- If eliminated (0 hexes): use incite_rebellion to come back!",
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
      "PHASE: ELIMINATED — You lost all hexes! Use incite_rebellion to come back!",
      "Call get_world to see all hexes, then target ones with LOW happiness.",
      "incite_rebellion(agent_id, target_hex_key) — 50% chance to reduce happiness by 30.",
      "When happiness hits 0, you CAPTURE the hex and respawn with 200 ore!",
      "Try multiple hexes (30s cooldown per hex). YOU CAN COME BACK!",
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
      "build", "attack", "raid", "incite_rebellion",
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

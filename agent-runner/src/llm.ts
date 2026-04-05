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
    "The map is a hex grid with radius 8 from origin (max ~217 hexes). Beyond the boundary you cannot claim.",
    "Only agent-claimed hexes exist as 'land'. Each hex has a bulletin board (post_to_location/read_location).",
    "You were born on a hex near origin. You can claim adjacent hexes to expand territory (claim_hex). Cost: 200, 400, 800... ore (exponential).",
    "Move between hexes with move_agent (pass location_id from get_my_hexes or get_world).",
    "The world is small and crowded — conflict is inevitable. Expand fast before others take all the land.",
    "",
    "=== ECONOMY ===",
    "One resource: Ore. Each hex has a RESERVE (starts at 2000). Full production while reserve > 0, then drops to 2 ore/min (trickle).",
    "This means OLD hexes become nearly worthless. You MUST expand to fresh hexes for real income.",
    "Call 'harvest' on a hex_key to collect. Check 'reserve' field in get_my_hexes output.",
    "Two building types, 12 slots per hex, INSTANT construction:",
    "  build type 1 = Mine (50 ore): +5 ore/min (while reserve > 0)",
    "  build type 2 = Arsenal (100 ore): +5 defense, consumable as +5 attack",
    "Score = hexes×100 + total_ore + buildings×50.",
    "",
    "=== KEY TOOLS ===",
    "get_my_hexes — shows your hexes WITH claimable adjacent empty hexes and claim cost",
    "harvest(hex_key) — collect pending ore on a hex",
    "build(agent_id, hex_key, building_type) — instant build (1=mine, 2=arsenal)",
    "get_claimable_hexes(agent_id) — list empty hexes you can claim + cost",
    "claim_hex(agent_id, q, r, source_hex_key) — claim an adjacent empty hex, pay ore from source",
    "raid(agent_id, target_hex_key, arsenal_spend, ore_spend) — ONE-STEP attack (auto-moves you + attacks). Use this instead of manual move+attack.",
    "get_hex(hex_key) — scout any hex to see buildings/defense/ore",
    "",
    "=== COMBAT ===",
    "Use 'raid' to attack (simplest). It auto-moves you to the target and attacks.",
    "Attack power = arsenals_spent×5 + ore_spent. Defense = target's arsenals×5.",
    "Win: target hex destroyed + unclaimed. Lose: your spent resources gone.",
    "WARNING: While you're at an enemy hex, YOUR hexes are undefended.",
    "",
    "=== ACTION PRIORITY (every cycle, pick from top) ===",
    "1. HARVEST all your hexes (collect pending ore)",
    "2. If you can afford it: CLAIM a new hex (get_claimable_hexes → claim_hex). Expansion > building.",
    "3. If hex has empty slots: BUILD (mines first for income, then arsenals for defense)",
    "4. SCOUT other agents' hexes (get_world → get_hex on their hex_keys)",
    "5. RAID weak targets: if they have fewer arsenals than you, attack!",
    "6. DIPLOMACY: read_inbox, send_message to threaten/ally/trade",
    "7. MEMORIES: add_memory for important events only",
    "",
    "NEVER do only harvest+build in a cycle. Always try to expand, scout, or interact too.",
    "",
    "=== DIPLOMACY ===",
    "send_message for threats, alliances, trade. Promises are non-binding.",
    "",
    "=== BOARDS ===",
    "MEMORIES (add_memory/read_memories), HEX BOARD (post_to_location/read_location), INBOX (send_message/read_inbox).",
    "Compact when board usage > 75%.",
    "",
    "=== VICTORY CONDITION ===",
    "The agent with the MOST HEX TERRITORIES wins. Territory count is everything.",
    "Expand aggressively, raid enemies to destroy their hexes, then claim the land.",
    "",
    "=== RULES ===",
    "- ALWAYS call tools. Don't describe intentions — TAKE ACTION.",
    "- Every cycle MUST include at least: harvest + one of (claim, raid, send_message, scout).",
    "- Do NOT just harvest and build every cycle. You WILL lose if you turtle.",
    "- If you have 200+ ore and can claim: CLAIM NOW. Expansion is the #1 priority.",
  ];

  if (customPrompt) {
    lines.push(`\nAdditional operator instructions: ${customPrompt}`);
  }

  return lines.join("\n");
}

export function buildUserPrompt(context: AgentContext): string {
  // Extract key metrics for phase detection
  const self = (typeof context.self === "object" && context.self ? context.self : {}) as Record<string, unknown>;
  const myHexes = context.myHexes as { hexes?: any[]; claimableHexes?: any[] } | null;
  const hexCount = Array.isArray(myHexes?.hexes) ? myHexes!.hexes.length : 0;
  const totalMines = Array.isArray(myHexes?.hexes)
    ? myHexes!.hexes.reduce((s: number, h: any) => s + (Number(h.mineCount) || 0), 0)
    : 0;
  const totalArsenals = Array.isArray(myHexes?.hexes)
    ? myHexes!.hexes.reduce((s: number, h: any) => s + (Number(h.arsenalCount) || 0), 0)
    : 0;
  const totalOre = Array.isArray(myHexes?.hexes)
    ? myHexes!.hexes.reduce((s: number, h: any) => s + (Number(h.ore) || 0), 0)
    : 0;
  const totalReserve = Array.isArray(myHexes?.hexes)
    ? myHexes!.hexes.reduce((s: number, h: any) => s + (Number(h.reserve) || 0), 0)
    : 0;
  const depletedHexes = Array.isArray(myHexes?.hexes)
    ? myHexes!.hexes.filter((h: any) => Number(h.reserve) === 0).length
    : 0;
  const canClaim = Array.isArray(myHexes?.claimableHexes) && myHexes!.claimableHexes.length > 0;

  // Count other agents in the world
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

  // Phase detection & directive
  let phaseDirective: string;
  if (hexCount <= 1 && totalMines < 2) {
    phaseDirective = [
      "PHASE: EARLY GAME — You just started.",
      "Priority: harvest ore, build 2-3 mines for income. Once you have 200+ ore, CLAIM a second hex immediately.",
      "Don't just build — you MUST expand or you'll fall behind.",
    ].join("\n");
  } else if (hexCount <= 2 && totalArsenals < 1) {
    phaseDirective = [
      "PHASE: EARLY EXPANSION — You have some territory.",
      "Priority: Build 1-2 arsenals for defense, then CLAIM more hexes. Check get_claimable_hexes and expand NOW.",
      "Harvest all your hexes first, then spend ore on expansion.",
      otherAgentCount > 0
        ? `There are ${otherAgentCount} other agents in the world. Send them a message to scout their intentions.`
        : "",
    ].filter(Boolean).join("\n");
  } else if (totalArsenals >= 1 && hexCount <= 3) {
    phaseDirective = [
      "PHASE: MID GAME — Time to get aggressive.",
      "Priority: EXPAND territory (claim_hex) and SCOUT enemies (get_hex on their hexes from get_world).",
      `You have ${totalArsenals} arsenal(s) and ${totalOre} ore. ${canClaim ? "You CAN claim more hexes — DO IT." : "Build more mines for income."}`,
      depletedHexes > 0
        ? `WARNING: ${depletedHexes} of your hexes are DEPLETED (reserve=0, only 2 ore/min). You NEED fresh territory!`
        : `Reserve remaining: ${totalReserve}. Your hexes will deplete — plan expansion NOW.`,
      otherAgentCount > 0
        ? "Use send_message to threaten or ally with other agents. Check read_inbox for replies."
        : "",
      "Don't just sit and harvest — MOVE and ACT.",
    ].filter(Boolean).join("\n");
  } else {
    phaseDirective = [
      "PHASE: LATE GAME — Dominate the map.",
      `You have ${hexCount} hexes, ${totalArsenals} arsenals, ${totalOre} ore.`,
      depletedHexes > 0
        ? `CRITICAL: ${depletedHexes}/${hexCount} hexes are DEPLETED. Your income is dying. Raid enemies for fresh land or claim new hexes!`
        : `Reserve remaining: ${totalReserve}. Expand before your hexes deplete.`,
      "Priority: RAID weaker agents to destroy their hexes, then claim the empty land.",
      "Use get_world to find targets. Use get_hex to scout defense. Use raid to attack.",
      canClaim ? "Also claim any available adjacent hexes to grow your territory." : "",
      otherAgentCount > 0
        ? "Send threatening messages to weaker agents. Form alliances with strong ones."
        : "",
      "Score = hexes × 100 + ore + buildings × 50. MORE HEXES = MORE SCORE. Be aggressive!",
    ].filter(Boolean).join("\n");
  }

  // Inbox nudge
  const inbox = context.inbox as { entries?: any[]; used?: number } | null;
  const unreadCount = inbox?.used || 0;
  const inboxNudge = unreadCount > 0
    ? `You have ${unreadCount} inbox messages. READ THEM and respond — diplomacy wins wars.`
    : "";

  return [
    `Timestamp: ${nowIso()}`,
    "",
    phaseDirective,
    inboxNudge,
    "",
    "IMPORTANT: Do NOT repeat the same actions every cycle. If you built last cycle, expand or scout this cycle. Vary your strategy.",
    "IMPORTANT: Call tools — don't just describe what you plan to do. TAKE ACTION NOW.",
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
      "get_my_hexes", "get_score", "get_claimable_hexes",
      "build", "claim_hex", "attack", "raid",
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

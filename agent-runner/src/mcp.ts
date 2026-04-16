import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpTool, AgentContext, AgentSnapshot, ToolCall } from "./types.js";

export function extractToolText(result: any): string {
  const content = Array.isArray(result?.content) ? result.content : [];
  return content
    .filter((item: any) => item?.type === "text" && typeof item.text === "string")
    .map((item: any) => item.text)
    .join("\n");
}

export function parseToolJson(result: any): unknown {
  const text = extractToolText(result).trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function connectMcp(
  mcpServerUrl: string
): Promise<{ client: Client; transport: StreamableHTTPClientTransport; tools: McpTool[] }> {
  const client = new Client({ name: "gravity-town-runner", version: "0.3.0" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpServerUrl));
  await client.connect(transport);
  const toolResult = await client.listTools();
  return { client, transport, tools: toolResult.tools as McpTool[] };
}

export async function callMcpTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
): Promise<any> {
  return client.callTool({ name, arguments: args });
}

export async function ensureAgent(
  client: Client,
  opts: {
    agentId?: number;
    agentName?: string;
    agentPersonality?: string;
    agentStats: number[];
    agentStartLocation: number;
  }
): Promise<number> {
  if (opts.agentId !== undefined) return opts.agentId;

  if (!opts.agentName || !opts.agentPersonality) {
    throw new Error("Set agentId or provide agentName + agentPersonality");
  }

  // create_agent is idempotent — returns existing agent if same name+owner
  const result = await callMcpTool(client, "create_agent", {
    name: opts.agentName,
    personality: opts.agentPersonality,
    stats: opts.agentStats,
  });
  const parsed = parseToolJson(result) as { agentId?: string; existing?: boolean };
  if (!parsed?.agentId) throw new Error("Agent creation succeeded but no agentId returned");
  const agentId = Number(parsed.agentId);
  if (parsed.existing) {
    console.log(`[ensureAgent] found existing agent "${opts.agentName}" → #${agentId}`);
  } else {
    console.log(`[ensureAgent] created new agent "${opts.agentName}" → #${agentId}`);
  }
  return agentId;
}

export async function collectContext(
  client: Client,
  agentId: number
): Promise<AgentContext> {
  const self = parseToolJson(
    await callMcpTool(client, "get_agent", { agent_id: agentId })
  );
  const selfLocation =
    typeof self === "object" && self && "location" in self
      ? Number((self as AgentSnapshot).location)
      : undefined;

  const [world, nearbyAgents, memories, locationBoard, inbox, myHexes] = await Promise.all([
    callMcpTool(client, "get_world").then(parseToolJson),
    callMcpTool(client, "get_nearby_agents", { agent_id: agentId }).then(parseToolJson),
    callMcpTool(client, "read_memories", { agent_id: agentId, count: 10 }).then(parseToolJson),
    selfLocation != null
      ? callMcpTool(client, "read_location", { location_id: selfLocation, count: 10 }).then(parseToolJson)
      : Promise.resolve(null),
    callMcpTool(client, "read_inbox", { agent_id: agentId, count: 16 }).then(parseToolJson),
    callMcpTool(client, "get_my_hexes", { agent_id: agentId }).then(parseToolJson).catch(() => null),
  ]);

  return { self, world, nearbyAgents, memories, locationBoard, inbox, myHexes };
}

export function parseArguments(toolCall: ToolCall): Record<string, unknown> {
  const raw = toolCall.function.arguments || "{}";
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new Error(`Invalid JSON arguments for tool ${toolCall.function.name}: ${raw}`); }
}

export function applyAgentDefaults(
  toolName: string,
  agentId: number,
  args: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...args };

  const selfTools = [
    "get_agent", "get_nearby_agents",
    "add_memory", "read_memories", "compact_memories",
    "move_agent", "post_to_location", "read_inbox", "compact_inbox",
    "get_my_hexes", "get_score", "harvest",
    "build", "attack", "raid", "incite_rebellion", "claim_neutral",
    "start_debate", "vote_debate", "write_chronicle", "get_chronicle",
  ];

  if (selfTools.includes(toolName) && next.agent_id === undefined) {
    next.agent_id = agentId;
  }

  if (toolName === "send_message" && next.from_agent === undefined) {
    next.from_agent = agentId;
  }

  return next;
}

export async function executeToolCall(
  client: Client,
  agentId: number,
  toolCall: ToolCall
): Promise<unknown> {
  const args = parseArguments(toolCall);
  const finalArgs = applyAgentDefaults(toolCall.function.name, agentId, args);
  const result = await callMcpTool(client, toolCall.function.name, finalArgs);
  return parseToolJson(result) ?? extractToolText(result);
}

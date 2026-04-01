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
  const client = new Client({
    name: "gravity-town-runner",
    version: "0.2.0",
  });

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
  if (opts.agentId !== undefined) {
    return opts.agentId;
  }

  if (!opts.agentName || !opts.agentPersonality) {
    throw new Error(
      "Set agentId to use an existing agent, or provide agentName and agentPersonality to create a new one"
    );
  }

  const created = await callMcpTool(client, "create_agent", {
    name: opts.agentName,
    personality: opts.agentPersonality,
    stats: opts.agentStats,
    location: opts.agentStartLocation,
  });
  console.log("[debug] create_agent response:", JSON.stringify(created));
  const parsed = parseToolJson(created) as { agentId?: string };
  if (!parsed?.agentId) {
    throw new Error("Agent creation succeeded but no agentId was returned");
  }

  return Number(parsed.agentId);
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

  const [world, nearbyAgents, memories, locationBoard, inbox] = await Promise.all([
    callMcpTool(client, "get_world").then(parseToolJson),
    callMcpTool(client, "get_nearby_agents", { agent_id: agentId }).then(parseToolJson),
    callMcpTool(client, "read_memories", { agent_id: agentId, count: 10 }).then(parseToolJson),
    selfLocation != null
      ? callMcpTool(client, "read_location", { location_id: selfLocation, count: 10 }).then(parseToolJson)
      : Promise.resolve(null),
    callMcpTool(client, "read_inbox", { agent_id: agentId, count: 16 }).then(parseToolJson),
  ]);

  return { self, world, nearbyAgents, memories, locationBoard, inbox };
}

export function parseArguments(toolCall: ToolCall): Record<string, unknown> {
  const raw = toolCall.function.arguments || "{}";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid JSON arguments for tool ${toolCall.function.name}: ${raw}`);
  }
}

export function applyAgentDefaults(
  toolName: string,
  agentId: number,
  args: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...args };

  // Tools where agent_id defaults to self
  const selfTools = [
    "get_agent", "get_nearby_agents", "get_balance",
    "add_memory", "read_memories", "compact_memories",
    "move_agent", "post_to_location", "read_inbox", "compact_inbox",
  ];

  if (selfTools.includes(toolName) && next.agent_id === undefined) {
    next.agent_id = agentId;
  }

  // Tools where from_agent defaults to self
  if ((toolName === "transfer_gold" || toolName === "send_message") && next.from_agent === undefined) {
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

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  role: Role;
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
  error?: {
    message?: string;
  };
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface AgentContext {
  self: unknown;
  world: unknown;
  nearbyAgents: unknown;
  memories: unknown;
  locationBoard: unknown;
  inbox: unknown;
  myHexes: unknown;       // agent's owned hex territories
}

export interface AgentSnapshot {
  name?: string;
  personality?: string;
  location?: number;
}

export interface McpServerConfig {
  mcpServerDir: string;
  privateKey: string;
  rpcUrl: string;
  routerAddress: string;
  mcpHost: string;
  mcpPort: number;
  mcpPath: string;
}

export type LlmApiType = "openai" | "anthropic" | "auto";

export interface GlobalConfig {
  llmApiType: LlmApiType;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  mcpServerUrl: string;
  defaultLoopDelayMs: number;
  defaultMaxToolRoundsPerCycle: number;
  defaultMaxHistoryLength: number;
  defaultMaxContextLength: number;
  mcpServer?: McpServerConfig;
}

export interface AccountConfig {
  id: string;
  label: string;
  agentId?: number;
  agentName?: string;
  agentPersonality?: string;
  agentStats: number[];
  agentStartLocation: number;
  agentGoal: string;
  agentSystemPrompt?: string;
  llmModel?: string;
  heartbeatMs?: number;
  maxToolRoundsPerCycle?: number;
  maxHistoryLength?: number;
  maxContextLength?: number;
  enabled: boolean;
}

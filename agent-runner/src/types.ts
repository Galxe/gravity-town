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
  recentEvents: unknown;
}

export interface AgentSnapshot {
  name?: string;
  personality?: string;
  location?: number;
}

/** MCP server auto-launch config */
export interface McpServerConfig {
  /** Path to mcp-server directory (resolved relative to agent-runner root) */
  mcpServerDir: string;
  /** Private key for the MCP operator wallet */
  privateKey: string;
  /** RPC URL for the chain */
  rpcUrl: string;
  /** Contract addresses */
  agentRegistryAddress: string;
  worldStateAddress: string;
  memoryLedgerAddress: string;
  /** MCP HTTP server bind settings */
  mcpHost: string;
  mcpPort: number;
  mcpPath: string;
}

export type LlmApiType = "openai" | "anthropic" | "auto";

/** Global config shared by all roles (from config.toml) */
export interface GlobalConfig {
  llmApiType: LlmApiType;
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  mcpServerUrl: string;
  defaultLoopDelayMs: number;
  defaultMaxToolRoundsPerCycle: number;
  defaultMaxHistoryLength: number;
  /** If set, auto-launch MCP server as child process */
  mcpServer?: McpServerConfig;
}

/** Per-role config (from accounts.json or config.toml fallback) */
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
  enabled: boolean;
}

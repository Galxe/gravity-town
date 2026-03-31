import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import type { GlobalConfig, AccountConfig, McpServerConfig } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  TOML config loading                                                */
/* ------------------------------------------------------------------ */

interface TomlConfig {
  llm?: {
    api_type?: string;
    api_key?: string;
    base_url?: string;
    model?: string;
  };
  mcp?: {
    private_key?: string;
    rpc_url?: string;
    host?: string;
    port?: number;
    path?: string;
    server_url?: string;
    agent_registry_address?: string;
    world_state_address?: string;
    memory_ledger_address?: string;
  };
  runner?: {
    loop_delay_ms?: number;
    max_tool_rounds_per_cycle?: number;
    max_history_length?: number;
  };
  agent?: {
    id?: number;
    name?: string;
    personality?: string;
    stats?: string;
    start_location?: number;
    goal?: string;
    system_prompt?: string;
  };
}

let _config: TomlConfig | undefined;

function loadTomlConfig(): TomlConfig {
  if (_config) return _config;
  const filePath = resolve(__dirname, "../config.toml");
  if (!existsSync(filePath)) {
    throw new Error(`config.toml not found at ${filePath}`);
  }
  _config = parseToml(readFileSync(filePath, "utf-8")) as unknown as TomlConfig;
  return _config;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseStats(raw: string | undefined): number[] {
  const values = (raw ?? "5,5,5,5")
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10));

  if (values.length !== 4 || values.some((v) => Number.isNaN(v) || v < 1 || v > 10)) {
    throw new Error("Stats must contain exactly 4 integers between 1 and 10, for example: 6,5,8,4");
  }
  return values;
}

interface DeployedAddresses {
  agentRegistryAddress: string;
  worldStateAddress: string;
  memoryLedgerAddress: string;
}

/**
 * Try to load contract addresses from deployed-addresses.json (written by forge deploy script).
 */
function loadDeployedAddresses(): DeployedAddresses | undefined {
  const filePath = resolve(__dirname, "../../deployed-addresses.json");
  if (!existsSync(filePath)) return undefined;

  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as DeployedAddresses;

  if (data.agentRegistryAddress && data.worldStateAddress && data.memoryLedgerAddress) {
    console.log(`[config] loaded contract addresses from deployed-addresses.json`);
    return data;
  }
  return undefined;
}

/** Try to build MCP server auto-launch config from config.toml + deployed-addresses.json. */
function loadMcpServerConfig(): McpServerConfig | undefined {
  const cfg = loadTomlConfig();
  const privateKey = cfg.mcp?.private_key;
  if (!privateKey) return undefined;

  const deployed = loadDeployedAddresses();
  const agentRegistryAddress = cfg.mcp?.agent_registry_address || deployed?.agentRegistryAddress;
  const worldStateAddress = cfg.mcp?.world_state_address || deployed?.worldStateAddress;
  const memoryLedgerAddress = cfg.mcp?.memory_ledger_address || deployed?.memoryLedgerAddress;

  if (!agentRegistryAddress || !worldStateAddress || !memoryLedgerAddress) {
    console.warn("[config] mcp.private_key is set but contract addresses are missing. Need agent_registry_address, world_state_address, memory_ledger_address in config.toml or deployed-addresses.json");
    return undefined;
  }

  const mcpHost = cfg.mcp?.host || "127.0.0.1";
  const mcpPort = cfg.mcp?.port ?? 3000;
  const mcpPath = cfg.mcp?.path || "/mcp";

  return {
    mcpServerDir: resolve(__dirname, "../../mcp-server"),
    privateKey,
    rpcUrl: cfg.mcp?.rpc_url || "http://127.0.0.1:8545",
    agentRegistryAddress,
    worldStateAddress,
    memoryLedgerAddress,
    mcpHost,
    mcpPort,
    mcpPath,
  };
}

/** Load global config from config.toml */
export function loadGlobalConfig(): GlobalConfig {
  const cfg = loadTomlConfig();
  const mcpServer = loadMcpServerConfig();

  // If auto-launch is configured, derive mcpServerUrl from it (unless explicitly set)
  let mcpServerUrl = cfg.mcp?.server_url;
  if (!mcpServerUrl && mcpServer) {
    mcpServerUrl = `http://${mcpServer.mcpHost}:${mcpServer.mcpPort}${mcpServer.mcpPath}`;
  }
  if (!mcpServerUrl) {
    throw new Error("mcp.server_url required in config.toml (or set mcp.private_key + contract addresses for auto-launch)");
  }

  const llmApiType = (cfg.llm?.api_type || "openai") as "openai" | "anthropic";

  if (!cfg.llm?.api_key) {
    throw new Error("llm.api_key required in config.toml");
  }
  if (!cfg.llm?.model) {
    throw new Error("llm.model required in config.toml");
  }

  return {
    llmApiType,
    llmApiKey: cfg.llm.api_key,
    llmBaseUrl: (cfg.llm.base_url || (llmApiType === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1")).replace(/\/$/, ""),
    llmModel: cfg.llm.model,
    mcpServerUrl,
    defaultLoopDelayMs: cfg.runner?.loop_delay_ms ?? 8000,
    defaultMaxToolRoundsPerCycle: cfg.runner?.max_tool_rounds_per_cycle ?? 6,
    defaultMaxHistoryLength: cfg.runner?.max_history_length ?? 20,
    mcpServer,
  };
}

/** Load accounts from accounts.json, fallback to config.toml single-agent config */
export function loadAccounts(): AccountConfig[] {
  const filePath = resolve(__dirname, "../accounts.json");

  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, "utf-8");
    const accounts = JSON.parse(raw) as AccountConfig[];

    // Validate and set defaults
    return accounts.map((acc, idx) => ({
      id: acc.id || `account-${idx}`,
      label: acc.label || `Agent ${idx + 1}`,
      agentId: acc.agentId,
      agentName: acc.agentName,
      agentPersonality: acc.agentPersonality,
      agentStats: acc.agentStats ? parseStats(acc.agentStats.join(",")) : [5, 5, 5, 5],
      agentStartLocation: acc.agentStartLocation ?? 1,
      agentGoal: acc.agentGoal || "Observe the world, interact with other agents, leave valuable memories, and drive the world state forward.",
      agentSystemPrompt: acc.agentSystemPrompt,
      llmModel: acc.llmModel,
      heartbeatMs: acc.heartbeatMs,
      maxToolRoundsPerCycle: acc.maxToolRoundsPerCycle,
      maxHistoryLength: acc.maxHistoryLength,
      enabled: acc.enabled !== false,
    }));
  }

  // Fallback: build a single account from config.toml [agent] section
  const cfg = loadTomlConfig();
  const agentId = cfg.agent?.id;
  return [
    {
      id: "default",
      label: cfg.agent?.name || `Agent #${agentId ?? "new"}`,
      agentId,
      agentName: cfg.agent?.name,
      agentPersonality: cfg.agent?.personality,
      agentStats: parseStats(cfg.agent?.stats),
      agentStartLocation: cfg.agent?.start_location ?? 1,
      agentGoal:
        cfg.agent?.goal ||
        "Observe the world, interact with other agents, leave valuable memories, and drive the world state forward.",
      agentSystemPrompt: cfg.agent?.system_prompt,
      heartbeatMs: undefined,
      maxToolRoundsPerCycle: undefined,
      enabled: true,
    },
  ];
}

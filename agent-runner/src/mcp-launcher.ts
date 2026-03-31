import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import type { McpServerConfig } from "./types.js";
import { nowIso } from "./llm.js";

const MAX_WAIT_MS = 15_000;
const POLL_INTERVAL_MS = 500;

/**
 * Check if the port already has a running MCP server.
 * MCP servers return 405 on GET with a JSON-RPC body.
 * Returns true if a valid MCP server is detected.
 */
async function isMcpAlreadyRunning(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET" });
    if (res.status === 405) {
      const text = await res.text();
      // MCP servers return JSON-RPC error on GET
      if (text.includes("jsonrpc")) {
        return true;
      }
    }
  } catch {
    // Connection refused — nothing running
  }
  return false;
}

/**
 * Launch the MCP HTTP server as a child process and wait until it's ready.
 * If an MCP server is already running on the port, skip launching.
 * Returns the child process handle (or null if reusing existing server).
 */
export async function launchMcpServer(config: McpServerConfig): Promise<ChildProcess | null> {
  const url = `http://${config.mcpHost}:${config.mcpPort}${config.mcpPath}`;

  // Check if an MCP server is already running on this port
  if (await isMcpAlreadyRunning(url)) {
    log(`MCP server already running at ${url} — skipping launch`);
    return null;
  }

  const serverDir = resolve(config.mcpServerDir);
  const entryPoint = resolve(serverDir, "src/http.ts");

  // Build a minimal env — avoid inheriting parent's IPC/loader state
  // (e.g. NODE_CHANNEL_FD from tsx) which causes the child to exit prematurely.
  const env: Record<string, string> = {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || "",
    PRIVATE_KEY: config.privateKey,
    RPC_URL: config.rpcUrl,
    AGENT_REGISTRY_ADDRESS: config.agentRegistryAddress,
    WORLD_STATE_ADDRESS: config.worldStateAddress,
    MEMORY_LEDGER_ADDRESS: config.memoryLedgerAddress,
    MCP_HOST: config.mcpHost,
    MCP_PORT: String(config.mcpPort),
    MCP_PATH: config.mcpPath,
  };

  log(`launching MCP server: ${entryPoint}`);
  log(`bind: ${url}`);

  const tsxBin = resolve(serverDir, "node_modules/.bin/tsx");

  const child = spawn(tsxBin, [entryPoint], {
    cwd: serverDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Pipe child stdout/stderr with prefix
  child.stdout?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      log(`[mcp-server] ${line}`);
    }
  });
  child.stderr?.on("data", (data: Buffer) => {
    for (const line of data.toString().split("\n").filter(Boolean)) {
      log(`[mcp-server] ${line}`);
    }
  });

  child.on("exit", (code, signal) => {
    log(`[mcp-server] exited with code=${code} signal=${signal}`, code !== 0);
  });

  await waitForReady(url, child);

  log("MCP server is ready");
  return child;
}

async function waitForReady(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    // Check if child died
    if (child.exitCode !== null) {
      throw new Error(`MCP server process exited with code ${child.exitCode} before becoming ready`);
    }

    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status === 405) {
        const text = await res.text();
        if (text.includes("jsonrpc")) return;
      }
    } catch {
      // Connection refused — not ready yet
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`MCP server did not become ready within ${MAX_WAIT_MS}ms`);
}

function log(msg: string, isError = false): void {
  const prefix = `[${nowIso()}] [launcher]`;
  if (isError) {
    console.error(`${prefix} ${msg}`);
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

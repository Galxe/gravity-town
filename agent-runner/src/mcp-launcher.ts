import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import type { McpServerConfig } from "./types.js";
import { nowIso } from "./llm.js";

const MAX_WAIT_MS = 15_000;
const POLL_INTERVAL_MS = 500;

/**
 * Launch the MCP HTTP server as a child process and wait until it's ready.
 * Returns the child process handle for cleanup.
 */
export async function launchMcpServer(config: McpServerConfig): Promise<ChildProcess> {
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

  // Kill any stale process occupying the port before starting
  await killProcessOnPort(config.mcpPort);

  log(`launching MCP server: ${entryPoint}`);
  log(`bind: http://${config.mcpHost}:${config.mcpPort}${config.mcpPath}`);

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

  // Wait for the child to actually start listening (not a stale process)
  const url = `http://${config.mcpHost}:${config.mcpPort}${config.mcpPath}`;
  // Small delay to let the child process initialize before polling
  await new Promise((r) => setTimeout(r, 1000));
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
      // The MCP server returns 405 on GET, which means it's alive
      const res = await fetch(url, { method: "GET" });
      if (res.status === 405 || res.status === 200) {
        return;
      }
    } catch {
      // Connection refused — not ready yet
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`MCP server did not become ready within ${MAX_WAIT_MS}ms`);
}

async function killProcessOnPort(port: number): Promise<void> {
  try {
    const { execSync } = await import("node:child_process");
    const out = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim();
    if (out) {
      for (const pid of out.split("\n")) {
        log(`killing stale process ${pid} on port ${port}`);
        process.kill(Number(pid), "SIGTERM");
      }
      // Brief wait for process to release port
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch {
    // lsof returns exit 1 when no process found — that's fine
  }
}

function log(msg: string, isError = false): void {
  const prefix = `[${nowIso()}] [launcher]`;
  if (isError) {
    console.error(`${prefix} ${msg}`);
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

#!/usr/bin/env node
import { type ChildProcess } from "node:child_process";
import { loadGlobalConfig, loadAccounts } from "./account-loader.js";
import { launchMcpServer } from "./mcp-launcher.js";
import { Orchestrator } from "./orchestrator.js";
import { nowIso } from "./llm.js";

async function main() {
  const globalConfig = loadGlobalConfig();
  const accounts = loadAccounts();

  console.log(`[${nowIso()}] loaded ${accounts.length} account(s)`);
  console.log(`[${nowIso()}] model=${globalConfig.llmModel} baseUrl=${globalConfig.llmBaseUrl}`);

  // Auto-launch MCP server if configured
  let mcpChild: ChildProcess | undefined;
  if (globalConfig.mcpServer) {
    mcpChild = await launchMcpServer(globalConfig.mcpServer);
  }

  console.log(`[${nowIso()}] mcp=${globalConfig.mcpServerUrl}`);

  const orchestrator = new Orchestrator(globalConfig);
  await orchestrator.init();
  await orchestrator.startAll(accounts);

  // Graceful shutdown on SIGINT / SIGTERM
  const shutdown = async () => {
    await orchestrator.shutdown();
    if (mcpChild) {
      mcpChild.kill("SIGTERM");
      console.log(`[${nowIso()}] MCP server process terminated`);
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(`[${nowIso()}] fatal:`, error);
  process.exit(1);
});

#!/usr/bin/env node
// AI Town MCP Server - Entry point
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ChainClient, ChainConfig } from "./chain.js";
import { registerTools } from "./tools.js";

function getConfig(): ChainConfig {
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const privateKey = process.env.PRIVATE_KEY;
  const agentRegistryAddress = process.env.AGENT_REGISTRY_ADDRESS;
  const worldStateAddress = process.env.WORLD_STATE_ADDRESS;
  const memoryLedgerAddress = process.env.MEMORY_LEDGER_ADDRESS;

  if (!privateKey) throw new Error("PRIVATE_KEY env var required");
  if (!agentRegistryAddress) throw new Error("AGENT_REGISTRY_ADDRESS env var required");
  if (!worldStateAddress) throw new Error("WORLD_STATE_ADDRESS env var required");
  if (!memoryLedgerAddress) throw new Error("MEMORY_LEDGER_ADDRESS env var required");

  return { rpcUrl, privateKey, agentRegistryAddress, worldStateAddress, memoryLedgerAddress };
}

async function main() {
  const config = getConfig();
  const chain = new ChainClient(config);

  const server = new McpServer({
    name: "aitown",
    version: "0.1.0",
  });

  registerTools(server, chain);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("AI Town MCP Server running");
  console.error(`Connected to RPC: ${config.rpcUrl}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ChainClient, ChainConfig } from "./chain.js";
import { registerTools, ToolOptions } from "./tools.js";

function getConfig(): ChainConfig {
  const rpcUrl = process.env.RPC_URL || "https://mainnet-rpc.gravity.xyz";
  const privateKey = process.env.PRIVATE_KEY;
  const routerAddress = process.env.ROUTER_ADDRESS || "0x4c2F6C0BAd768A75a67949b35feb094BAC4De03a";

  if (!privateKey) throw new Error("PRIVATE_KEY env var required");

  const chainId = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 127001;

  return { rpcUrl, privateKey, routerAddress, chainId };
}

function parseToolOptions(): ToolOptions {
  const raw = process.env.OWNER_KEYS || "";
  if (!raw) return {};
  const keys = new Set(raw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean));
  if (keys.size > 0) console.error(`OWNER_KEYS: ${keys.size} address(es) loaded`);
  return { ownerKeys: keys };
}

async function main() {
  const config = getConfig();
  const chain = new ChainClient(config);
  await chain.ready();

  const toolOpts = parseToolOptions();
  const server = new McpServer({ name: "gravity-town", version: "0.2.0" });
  registerTools(server, chain, toolOpts);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Gravity Town MCP Server running");
  console.error(`Connected to RPC: ${config.rpcUrl}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

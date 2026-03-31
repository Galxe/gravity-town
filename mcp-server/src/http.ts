#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { registerTools } from "./tools.js";
import { ChainClient, ChainConfig } from "./chain.js";

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

function createServer(chain: ChainClient): McpServer {
  const server = new McpServer({
    name: "aitown",
    version: "0.1.0",
  });

  registerTools(server, chain);
  return server;
}

async function main() {
  const config = getConfig();
  const chain = new ChainClient(config);
  const app = createMcpExpressApp({ host: process.env.MCP_HOST || "127.0.0.1" });
  const host = process.env.MCP_HOST || "127.0.0.1";
  const port = Number.parseInt(process.env.MCP_PORT || "3000", 10);
  const path = process.env.MCP_PATH || "/mcp";

  app.post(path, async (req: any, res: any) => {
    const server = createServer(chain);

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }
    }
  });

  app.get(path, async (_req: any, res: any) => {
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    }));
  });

  app.delete(path, async (_req: any, res: any) => {
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    }));
  });

  app.listen(port, host, () => {
    console.error(`Gravity Town MCP HTTP Server running at http://${host}:${port}${path}`);
    console.error(`Connected to RPC: ${config.rpcUrl}`);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

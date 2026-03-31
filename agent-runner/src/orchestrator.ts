import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { GlobalConfig, AccountConfig, McpTool } from "./types.js";
import { connectMcp, ensureAgent } from "./mcp.js";
import { nowIso } from "./llm.js";
import { RoleRunner } from "./role-runner.js";

export class Orchestrator {
  private globalConfig: GlobalConfig;
  private client!: Client;
  private transport!: StreamableHTTPClientTransport;
  private mcpTools: McpTool[] = [];
  private runners: Map<string, RoleRunner> = new Map();

  constructor(globalConfig: GlobalConfig) {
    this.globalConfig = globalConfig;
  }

  /** Connect to MCP server and discover tools */
  async init(): Promise<void> {
    const { client, transport, tools } = await connectMcp(this.globalConfig.mcpServerUrl);
    this.client = client;
    this.transport = transport;
    this.mcpTools = tools;
    this.log(`connected to MCP, ${tools.length} tools available`);
  }

  /** Add and start a role from an account config */
  async addRole(account: AccountConfig): Promise<RoleRunner> {
    if (this.runners.has(account.id)) {
      throw new Error(`Role ${account.id} already exists`);
    }

    const agentId = await ensureAgent(this.client, {
      agentId: account.agentId,
      agentName: account.agentName,
      agentPersonality: account.agentPersonality,
      agentStats: account.agentStats,
      agentStartLocation: account.agentStartLocation,
    });

    this.log(`role "${account.label}" bound to agent #${agentId}`);

    const runner = new RoleRunner(
      this.client,
      this.globalConfig,
      account,
      agentId,
      this.mcpTools
    );

    this.runners.set(account.id, runner);
    runner.start();
    return runner;
  }

  /** Stop and remove a role */
  removeRole(accountId: string): void {
    const runner = this.runners.get(accountId);
    if (runner) {
      runner.stop();
      this.runners.delete(accountId);
      this.log(`role "${runner.label}" removed`);
    }
  }

  /** Start multiple roles from account list */
  async startAll(accounts: AccountConfig[]): Promise<void> {
    const enabled = accounts.filter((a) => a.enabled);
    this.log(`starting ${enabled.length} role(s)...`);

    for (const account of enabled) {
      try {
        await this.addRole(account);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`failed to start role "${account.label}": ${message}`, true);
      }
    }

    this.log(`${this.runners.size} role(s) running`);
  }

  /** Stop all roles and disconnect */
  async shutdown(): Promise<void> {
    this.log("shutting down...");
    for (const [id, runner] of this.runners) {
      runner.stop();
    }
    this.runners.clear();
    await this.transport.close();
    await this.client.close();
    this.log("shutdown complete");
  }

  /** Get status of all runners */
  getStatus(): Array<{ id: string; label: string; agentId: number; status: string; cycle: number }> {
    return Array.from(this.runners.values()).map((r) => ({
      id: r.accountId,
      label: r.label,
      agentId: r.agentId,
      status: r.status,
      cycle: r.cycle,
    }));
  }

  /** Update heartbeat for a specific role at runtime */
  setRoleHeartbeat(accountId: string, ms: number): void {
    const runner = this.runners.get(accountId);
    if (!runner) throw new Error(`Role ${accountId} not found`);
    runner.setHeartbeat(ms);
  }

  private log(msg: string, isError = false): void {
    const prefix = `[${nowIso()}] [orchestrator]`;
    if (isError) {
      console.error(`${prefix} ${msg}`);
    } else {
      console.log(`${prefix} ${msg}`);
    }
  }
}

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { GlobalConfig, AccountConfig, McpTool } from "./types.js";
import { connectMcp, ensureAgent, callMcpTool, parseToolJson, extractToolText } from "./mcp.js";
import { nowIso, ApiRateLimiter, createChatCompletion, extractTextContent } from "./llm.js";
import { RoleRunner } from "./role-runner.js";

export class Orchestrator {
  private globalConfig: GlobalConfig;
  private client!: Client;
  private transport!: StreamableHTTPClientTransport;
  private mcpTools: McpTool[] = [];
  private runners: Map<string, RoleRunner> = new Map();
  private rateLimiter: ApiRateLimiter;
  private bibleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(globalConfig: GlobalConfig) {
    this.globalConfig = globalConfig;
    this.rateLimiter = new ApiRateLimiter(globalConfig.defaultLoopDelayMs);
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
      this.mcpTools,
      this.rateLimiter
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

  /** Start multiple roles from account list, staggered so they don't all tick at once */
  async startAll(accounts: AccountConfig[]): Promise<void> {
    const enabled = accounts.filter((a) => a.enabled);
    this.log(`starting ${enabled.length} role(s)...`);

    for (let i = 0; i < enabled.length; i++) {
      const account = enabled[i];
      try {
        const runner = await this.addRole(account);
        // Stagger: each agent starts offset by heartbeat / N so they spread evenly
        if (i > 0) {
          const staggerMs = Math.round(runner.heartbeatMs / enabled.length) * i;
          runner.rescheduleWithDelay(staggerMs);
          this.log(`staggered "${account.label}" by ${staggerMs}ms`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`failed to start role "${account.label}": ${message}`, true);
      }
    }

    this.log(`${this.runners.size} role(s) running`);

    // Start World Bible timer (every 1 hour)
    this.startBibleTimer();
  }

  // ──────────────────── World Bible ────────────────────

  private startBibleTimer(): void {
    // Write first bible after 1 minute (then every 1h)
    const initialDelay = 60 * 1000;
    const interval = 60 * 60 * 1000; // 1 hour

    setTimeout(() => {
      this.writeBible();
      this.bibleTimer = setInterval(() => this.writeBible(), interval);
    }, initialDelay);

    this.log(`World Bible timer: first in 5min, then every 1h`);
  }

  private async writeBible(): Promise<void> {
    try {
      // 1. Get world bible info (who is the designated chronicler)
      const bibleInfo = parseToolJson(
        await callMcpTool(this.client, "get_world_bible", {})
      ) as { bestAgentId?: number; bestScore?: number; lastTimestamp?: number } | null;

      if (!bibleInfo?.bestAgentId || bibleInfo.bestAgentId === 0) {
        this.log("[bible] no eligible chronicler (no chronicle scores yet)");
        return;
      }

      const chroniclerId = bibleInfo.bestAgentId;
      this.log(`[bible] designated chronicler: agent #${chroniclerId} (score ${bibleInfo.bestScore})`);

      // 2. Collect recent world events
      const [worldData, scoreboard] = await Promise.all([
        callMcpTool(this.client, "get_world", {}).then(parseToolJson),
        callMcpTool(this.client, "get_scoreboard", {}).then(parseToolJson),
      ]);

      // 3. Collect recent chronicles about various agents
      const agents = parseToolJson(
        await callMcpTool(this.client, "list_agents", {})
      ) as any[] | null;

      let chronicleSnippets = "";
      if (agents && agents.length > 0) {
        const snippets: string[] = [];
        for (const agent of agents.slice(0, 15)) {
          const evals = parseToolJson(
            await callMcpTool(this.client, "read_evaluations", { agent_id: agent.id, count: 3 })
          ) as { entries?: any[] } | null;
          if (evals?.entries?.length) {
            for (const e of evals.entries) {
              snippets.push(`[About ${agent.name}] ${e.content}`);
            }
          }
        }
        chronicleSnippets = snippets.slice(0, 20).join("\n\n");
      }

      // 4. Ask LLM to write the World Bible chapter
      const prompt = [
        "You are the most renowned chronicler in Gravity Town. You have been chosen to write the next chapter of the WORLD BIBLE — the sacred history of this world.",
        "",
        "Write a grand, sweeping narrative chapter (8-15 sentences) that covers the recent era. You are writing HISTORY, not propaganda.",
        "- Describe the major events: conquests, collapses, territorial shifts, alliances",
        "- Name specific agents and what happened to them",
        "- Describe the rise and fall of powers",
        "- Note the current balance of power",
        "- Write with gravitas — this is a sacred text that will be read for ages",
        "- End with a reflection on what this era means for the future of Gravity Town",
        "",
        "=== CURRENT SCOREBOARD ===",
        JSON.stringify(scoreboard, null, 2),
        "",
        "=== RECENT CHRONICLES (written by various agents) ===",
        chronicleSnippets || "(no chronicles yet)",
        "",
        "Write the next chapter of the World Bible. Output ONLY the chapter text.",
      ].join("\n");

      // Skip rate limiter — Bible is a system task, not an agent action
      this.log("[bible] generating chapter...");
      const completion = await createChatCompletion(
        this.globalConfig.llmApiKey,
        this.globalConfig.llmBaseUrl,
        this.globalConfig.llmModel,
        [{ role: "user", content: prompt }],
        [],
        this.globalConfig.llmApiType
      );

      const chapter = extractTextContent(completion.choices?.[0]?.message?.content).trim();
      if (!chapter) {
        this.log("[bible] LLM returned empty chapter", true);
        return;
      }

      // 5. Write to chain
      const result = extractToolText(
        await callMcpTool(this.client, "write_world_bible", {
          agent_id: chroniclerId,
          content: chapter,
        })
      );

      this.log(`[bible] chapter written by agent #${chroniclerId}: "${chapter.slice(0, 80)}..."`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`[bible] failed: ${msg}`, true);
    }
  }

  /** Stop all roles and disconnect */
  async shutdown(): Promise<void> {
    this.log("shutting down...");
    if (this.bibleTimer) clearInterval(this.bibleTimer);
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

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
  private predictionTimer: ReturnType<typeof setInterval> | null = null;
  private lastOracleDebateId: number = 0;

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

    // Phase 1: Create/resolve all agents on-chain BEFORE starting any cycles.
    // This prevents concurrent agent cycles from interfering with agent creation RPCs.
    const resolved: Array<{ account: AccountConfig; agentId: number }> = [];
    for (const account of enabled) {
      try {
        const agentId = await ensureAgent(this.client, {
          agentId: account.agentId,
          agentName: account.agentName,
          agentPersonality: account.agentPersonality,
          agentStats: account.agentStats,
          agentStartLocation: account.agentStartLocation,
        });
        this.log(`resolved "${account.label}" → agent #${agentId}`);
        resolved.push({ account, agentId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log(`failed to resolve "${account.label}": ${message}`, true);
      }
    }

    // Phase 1.5: Designate the on-chain Oracle agent so its debates become
    // 4hr ore-betting oracle debates (otherwise they degrade to normal debates).
    await this.designateOracle(resolved);

    // Phase 2: Create runners and start cycles with staggering.
    for (let i = 0; i < resolved.length; i++) {
      const { account, agentId } = resolved[i];
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
      if (i > 0) {
        const staggerMs = Math.round(runner.heartbeatMs / resolved.length) * i;
        runner.rescheduleWithDelay(staggerMs);
      }
    }

    this.log(`${this.runners.size} role(s) running`);

    // Start World Bible timer (every 1 hour)
    this.startBibleTimer();
    // Start Prediction Market timer (every 4 hours)
    this.startPredictionTimer();
  }

  /**
   * Ensure the on-chain oracleAgentId points at our Oracle role. Idempotent —
   * skips the tx if already set. Requires the MCP wallet to be operator/owner.
   */
  private async designateOracle(
    resolved: Array<{ account: AccountConfig; agentId: number }>
  ): Promise<void> {
    const oracle = resolved.find((r) => r.account.label === "Oracle");
    if (!oracle) {
      this.log("[oracle] no Oracle role among accounts — skipping designation");
      return;
    }
    try {
      const current = parseToolJson(
        await callMcpTool(this.client, "get_oracle_agent", {})
      ) as { oracleAgentId?: number } | null;
      if (current?.oracleAgentId === oracle.agentId) {
        this.log(`[oracle] already designated → agent #${oracle.agentId}`);
        return;
      }
      const res = await callMcpTool(this.client, "set_oracle_agent", { agent_id: oracle.agentId });
      this.log(`[oracle] designated agent #${oracle.agentId} as Oracle: ${extractToolText(res).slice(0, 120)}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`[oracle] designation failed (oracle debates will degrade to normal): ${msg}`, true);
    }
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

      // 5. Re-check best agent right before writing (may have changed during LLM call)
      const freshInfo = parseToolJson(
        await callMcpTool(this.client, "get_world_bible", {})
      ) as { bestAgentId?: number } | null;
      const actualChronicler = freshInfo?.bestAgentId || chroniclerId;
      if (actualChronicler !== chroniclerId) {
        this.log(`[bible] chronicler changed: #${chroniclerId} → #${actualChronicler} during generation`);
      }

      const writeResult = await callMcpTool(this.client, "write_world_bible", {
        agent_id: actualChronicler,
        content: chapter,
      });

      if (writeResult?.isError) {
        this.log(`[bible] write rejected: ${extractToolText(writeResult)}`, true);
        return;
      }

      this.log(`[bible] chapter written by agent #${chroniclerId}: "${chapter.slice(0, 80)}..."`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`[bible] failed: ${msg}`, true);
    }
  }

  // ──────────────────── Prediction Timer ────────────────────

  private startPredictionTimer(): void {
    // First tick after 5 minutes, then every 1 hour
    const initialDelay = 5 * 60 * 1000;
    const interval = 60 * 60 * 1000;

    const start = () => {
      this.tickOraclePriest();
      this.predictionTimer = setInterval(() => this.tickOraclePriest(), interval);
    };
    const handle = setTimeout(start, initialDelay) as unknown;
    this.predictionTimer = handle as ReturnType<typeof setInterval>;

    this.log(`Oracle priest timer: first tick in 5min, then every 1h`);
  }

  /**
   * Orchestrator-as-priest: deterministically drives Oracle debates without
   * relying on the Oracle LLM. If the last-known oracle debate is still live,
   * do nothing. If it's past deadline and unresolved, nudge the Oracle LLM to
   * resolve (outcome judgement still needs human/LLM/web input). If there is
   * no known active debate, start a fresh one from a chain-state template.
   */
  private async tickOraclePriest(): Promise<void> {
    try {
      const oracleRunner = Array.from(this.runners.values()).find(
        (r) => r.label === "Oracle"
      );
      if (!oracleRunner) {
        this.log("[priest] Oracle agent not found among runners");
        return;
      }
      const oracleId = oracleRunner.agentId;

      // Check status of the last debate we started
      if (this.lastOracleDebateId > 0) {
        const d = parseToolJson(
          await callMcpTool(this.client, "get_debate", {
            debate_entry_id: this.lastOracleDebateId,
          })
        ) as { entryId?: number; resolved?: boolean; expired?: boolean; isOracle?: boolean; timeLeft?: number } | null;

        if (d && d.entryId && d.entryId > 0 && d.isOracle) {
          if (!d.resolved && !d.expired && (d.timeLeft ?? 0) > 0) {
            this.log(`[priest] debate #${this.lastOracleDebateId} still live (timeLeft=${d.timeLeft}s), skipping`);
            return;
          }
          if (!d.resolved && !d.expired && (d.timeLeft ?? 0) === 0) {
            this.log(`[priest] nudging Oracle to resolve debate #${this.lastOracleDebateId}`);
            await callMcpTool(this.client, "send_message", {
              from_agent: oracleId,
              to_agent: oracleId,
              importance: 9,
              category: "prediction_resolve_nudge",
              content: `Oracle debate #${this.lastOracleDebateId} past deadline. Verify outcome (web_search or chain state), then call resolve_debate(debate_entry_id=${this.lastOracleDebateId}, outcome_override=true/false).`,
              related_agents: [],
            });
            // fall through and start a new one — don't stall the feed
          }
        }
      }

      // Start a new oracle debate
      const content = await this.generateProphecy();
      const result = await callMcpTool(this.client, "start_debate", {
        agent_id: oracleId,
        content,
      });
      const text = extractToolText(result);
      const match = /Entry ID: (\d+)/.exec(text);
      if (match) {
        this.lastOracleDebateId = Number(match[1]);
        this.log(`[priest] started oracle debate #${this.lastOracleDebateId}: "${content.slice(0, 80)}"`);
      } else {
        this.log(`[priest] start_debate response unparseable: ${text.slice(0, 160)}`, true);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`[priest] tick failed: ${msg}`, true);
    }
  }

  private async generateProphecy(): Promise<string> {
    try {
      const [scoreboard, world] = await Promise.all([
        callMcpTool(this.client, "get_scoreboard").then(parseToolJson),
        callMcpTool(this.client, "get_world").then(parseToolJson),
      ]);
      const sb = Array.isArray(scoreboard) ? (scoreboard as Array<{ agentId: number; name: string; hexCount: number; score: number }>) : [];
      const top = sb[0];
      const hexCount = Array.isArray((world as any)?.hexes) ? (world as any).hexes.length : 0;
      const templates: string[] = [];
      if (top) {
        templates.push(
          `The Oracle gazes upon ${top.name} — will ${top.name} still top the scoreboard when this prophecy is sealed?`,
          `Dark omens — will any warlord surpass ${top.score + 200} total score before the Oracle next speaks?`
        );
      }
      if (hexCount > 0) {
        templates.push(
          `War drums echo across ${hexCount} claimed hexes. Will more than ${hexCount + 3} hexes bear a banner when this prophecy expires?`
        );
      }
      templates.push(
        "The Oracle foresees conquest — will more than 3 battles be fought before this prophecy is resolved?"
      );
      return templates[Math.floor(Math.random() * templates.length)];
    } catch {
      return "The Oracle foresees — will the balance of power shift before this prophecy is resolved?";
    }
  }

  /** Stop all roles and disconnect */
  async shutdown(): Promise<void> {
    this.log("shutting down...");
    if (this.bibleTimer) clearInterval(this.bibleTimer);
    if (this.predictionTimer) clearInterval(this.predictionTimer);
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

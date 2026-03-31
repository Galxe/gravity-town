import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { GlobalConfig, AccountConfig, McpTool, Message, ToolDefinition } from "./types.js";
import { collectContext, executeToolCall, getMemoryUsage, callMcpTool, parseToolJson } from "./mcp.js";
import {
  createChatCompletion,
  buildSystemPrompt,
  buildUserPrompt,
  createToolDefinitions,
  extractTextContent,
  stringify,
  nowIso,
} from "./llm.js";

export type RoleStatus = "idle" | "thinking" | "acting" | "compressing" | "stopped";

/** When memory usage exceeds this ratio, force compression before the next cycle */
const COMPRESS_THRESHOLD = 0.75;
/** How many oldest memories to compress each time */
const COMPRESS_BATCH_SIZE = 16;

export class RoleRunner {
  readonly accountId: string;
  readonly label: string;
  readonly agentId: number;

  private client: Client;
  private globalConfig: GlobalConfig;
  private accountConfig: AccountConfig;
  private mcpTools: McpTool[];
  private toolDefs: ToolDefinition[];

  /** Persistent conversation history across cycles */
  private conversationHistory: Message[] = [];
  private maxHistoryLength: number;

  private heartbeatMs: number;
  private maxToolRoundsPerCycle: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private _status: RoleStatus = "idle";
  private _cycle = 0;

  constructor(
    client: Client,
    globalConfig: GlobalConfig,
    accountConfig: AccountConfig,
    agentId: number,
    mcpTools: McpTool[]
  ) {
    this.client = client;
    this.globalConfig = globalConfig;
    this.accountConfig = accountConfig;
    this.agentId = agentId;
    this.accountId = accountConfig.id;
    this.label = accountConfig.label;
    this.mcpTools = mcpTools;
    this.toolDefs = createToolDefinitions(agentId, mcpTools);

    this.heartbeatMs = accountConfig.heartbeatMs ?? globalConfig.defaultLoopDelayMs;
    this.maxToolRoundsPerCycle = accountConfig.maxToolRoundsPerCycle ?? globalConfig.defaultMaxToolRoundsPerCycle;
    this.maxHistoryLength = accountConfig.maxHistoryLength ?? globalConfig.defaultMaxHistoryLength;
  }

  get status(): RoleStatus {
    return this._status;
  }

  get cycle(): number {
    return this._cycle;
  }

  /** Update heartbeat interval at runtime */
  setHeartbeat(ms: number): void {
    this.heartbeatMs = ms;
    this.log(`heartbeat updated to ${ms}ms`);
  }

  /** Start the autonomous loop */
  start(): void {
    if (this._status !== "idle" && this._status !== "stopped") return;
    this._status = "idle";
    this.log(`started (hb=${this.heartbeatMs}ms, maxRounds=${this.maxToolRoundsPerCycle}, historyWindow=${this.maxHistoryLength})`);
    this.scheduleNext();
  }

  /** Stop the loop gracefully */
  stop(): void {
    this._status = "stopped";
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.log("stopped");
  }

  private scheduleNext(): void {
    if (this._status === "stopped") return;
    this.timer = setTimeout(() => this.tick(), this.heartbeatMs);
  }

  private async tick(): Promise<void> {
    if (this._status === "stopped") return;

    this._cycle += 1;
    this._status = "thinking";
    this.log(`cycle ${this._cycle} start`);

    try {
      // Check memory usage and compress if needed
      await this.maybeCompressMemories();
      // Run the main decision cycle
      await this.runCycle();
    } catch (error) {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      this.log(`cycle ${this._cycle} failed: ${message}`, true);
    }

    this._status = "idle";
    this.scheduleNext();
  }

  // ──────────────────── Memory compression ────────────────────

  /**
   * If on-chain memory is >= 75% full, ask the LLM to summarize the oldest
   * memories and call compress_memories on-chain to free slots.
   */
  private async maybeCompressMemories(): Promise<void> {
    const usage = await getMemoryUsage(this.client, this.agentId);
    if (!usage || typeof usage.count !== "number" || typeof usage.capacity !== "number" || usage.capacity === 0) {
      this.log("get_memory_usage returned invalid data — skipping compression");
      return;
    }
    const ratio = usage.count / usage.capacity;

    if (ratio < COMPRESS_THRESHOLD) return;

    this._status = "compressing";
    this.log(`memory ${usage.count}/${usage.capacity} (${(ratio * 100).toFixed(0)}%) — triggering compression`);

    // Fetch the oldest memories that will be compressed
    const batchSize = Math.min(COMPRESS_BATCH_SIZE, usage.count - 1); // keep at least 1
    const parsed = parseToolJson(
      await callMcpTool(this.client, "recall_memories", { agent_id: this.agentId, count: usage.count })
    );
    const oldestMemories: any[] = Array.isArray(parsed) ? parsed : [];

    if (oldestMemories.length === 0) {
      this.log("recall_memories returned no usable array — skipping compression");
      return;
    }

    // Take the oldest N from the full list (recall returns oldest-first)
    const toCompress = oldestMemories.slice(0, batchSize);

    // Find max importance among the batch
    let maxImportance = 1;
    for (const m of toCompress) {
      if (m.importance > maxImportance) maxImportance = m.importance;
    }

    // Ask LLM to generate a compressed summary
    const summaryPrompt = [
      "You are compressing old memories for an AI agent in a game world.",
      "Merge the following memories into ONE concise summary paragraph.",
      "Preserve the most important facts, names, locations, and relationships.",
      "Drop trivial details. Output ONLY the summary text, nothing else.",
      "",
      "Memories to compress:",
      ...toCompress.map((m: any, i: number) =>
        `${i + 1}. [${m.category}, importance=${m.importance}] ${m.content}`
      ),
    ].join("\n");

    const model = this.accountConfig.llmModel || this.globalConfig.llmModel;
    const completion = await createChatCompletion(
      this.globalConfig.llmApiKey,
      this.globalConfig.llmBaseUrl,
      model,
      [{ role: "user", content: summaryPrompt }],
      [], // no tools needed for summarization
      this.globalConfig.llmApiType
    );

    const summary = extractTextContent(completion.choices?.[0]?.message?.content).trim();
    if (!summary) {
      this.log("compression failed: LLM returned empty summary", true);
      return;
    }

    // Call on-chain compress
    await callMcpTool(this.client, "compress_memories", {
      agent_id: this.agentId,
      count: batchSize,
      summary_content: summary,
      importance: maxImportance,
      category: "reflection",
    });

    this.log(`compressed ${batchSize} memories → "${summary.slice(0, 80)}..."`);
  }

  // ──────────────────── Main cycle ────────────────────

  private async runCycle(): Promise<void> {
    // 1. Collect fresh context from chain
    const context = await collectContext(this.client, this.agentId);

    // 2. Build system prompt (always at position 0)
    const systemMessage: Message = {
      role: "system",
      content: buildSystemPrompt(
        this.accountConfig.agentGoal,
        this.accountConfig.agentSystemPrompt,
        context
      ),
    };

    // 3. Build user prompt with fresh world snapshot
    const userMessage: Message = {
      role: "user",
      content: buildUserPrompt(context),
    };

    // 4. Assemble messages: system + trimmed history + new user prompt
    const messages: Message[] = [
      systemMessage,
      ...this.conversationHistory,
      userMessage,
    ];

    // 5. LLM tool-calling loop
    const model = this.accountConfig.llmModel || this.globalConfig.llmModel;
    const newMessages: Message[] = []; // track new messages this cycle

    for (let round = 1; round <= this.maxToolRoundsPerCycle; round += 1) {
      this._status = "thinking";
      const completion = await createChatCompletion(
        this.globalConfig.llmApiKey,
        this.globalConfig.llmBaseUrl,
        model,
        messages,
        this.toolDefs,
        this.globalConfig.llmApiType
      );

      const reply = completion.choices?.[0]?.message;
      if (!reply) throw new Error("LLM returned no message");

      const assistantMessage: Message = {
        role: "assistant",
        content: extractTextContent(reply.content),
      };
      if (reply.tool_calls && reply.tool_calls.length > 0) {
        assistantMessage.tool_calls = reply.tool_calls;
      }
      messages.push(assistantMessage);
      newMessages.push(assistantMessage);

      // No tool calls → cycle done
      if (!reply.tool_calls || reply.tool_calls.length === 0) {
        const summary = extractTextContent(reply.content).trim() || "cycle completed";
        this.log(`summary: ${summary}`);
        break;
      }

      // Execute tool calls
      this._status = "acting";
      for (const toolCall of reply.tool_calls) {
        try {
          const result = await executeToolCall(this.client, this.agentId, toolCall);
          this.log(`tool=${toolCall.function.name} ok`);
          const toolMsg: Message = {
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: stringify(result),
          };
          messages.push(toolMsg);
          newMessages.push(toolMsg);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log(`tool=${toolCall.function.name} error=${errorMessage}`, true);
          const toolMsg: Message = {
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: stringify({ error: errorMessage }),
          };
          messages.push(toolMsg);
          newMessages.push(toolMsg);
        }
      }

      if (round === this.maxToolRoundsPerCycle) {
        this.log(`reached max tool rounds (${this.maxToolRoundsPerCycle})`);
      }
    }

    // 6. Append new messages to persistent history + trim
    this.conversationHistory.push(userMessage, ...newMessages);
    this.trimHistory();
  }

  /** Sliding window: keep the last N user/assistant/tool messages */
  private trimHistory(): void {
    if (this.conversationHistory.length > this.maxHistoryLength) {
      const excess = this.conversationHistory.length - this.maxHistoryLength;
      this.conversationHistory = this.conversationHistory.slice(excess);
    }
  }

  private log(msg: string, isError = false): void {
    const prefix = `[${nowIso()}] [${this.label}#${this.agentId}]`;
    if (isError) {
      console.error(`${prefix} ${msg}`);
    } else {
      console.log(`${prefix} ${msg}`);
    }
  }
}

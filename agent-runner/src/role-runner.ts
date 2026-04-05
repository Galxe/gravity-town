import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { GlobalConfig, AccountConfig, McpTool, Message, ToolDefinition } from "./types.js";
import { collectContext, executeToolCall, callMcpTool, parseToolJson } from "./mcp.js";
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
  private maxContextLength: number;

  public heartbeatMs: number;
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
    this.maxContextLength = accountConfig.maxContextLength ?? globalConfig.defaultMaxContextLength;
  }

  get status(): RoleStatus {
    return this._status;
  }

  get cycle(): number {
    return this._cycle;
  }

  setHeartbeat(ms: number): void {
    this.heartbeatMs = ms;
    this.log(`heartbeat updated to ${ms}ms`);
  }

  /** Cancel current scheduled tick and reschedule with a custom delay (for staggering) */
  rescheduleWithDelay(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timer = setTimeout(() => this.tick(), delayMs);
  }

  start(): void {
    if (this._status !== "idle" && this._status !== "stopped") return;
    this._status = "idle";
    this.log(`started (hb=${this.heartbeatMs}ms, maxRounds=${this.maxToolRoundsPerCycle}, historyWindow=${this.maxHistoryLength}, maxCtx=${this.maxContextLength || "unlimited"})`);
    this.scheduleNext();
  }

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
      // Check memory usage and auto-compress if needed
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

  private async maybeCompressMemories(): Promise<void> {
    const result = parseToolJson(
      await callMcpTool(this.client, "read_memories", { agent_id: this.agentId, count: 0 })
    ) as { used?: number; capacity?: number } | null;

    if (!result || typeof result.used !== "number" || typeof result.capacity !== "number" || result.capacity === 0) {
      this.log("read_memories returned invalid usage — skipping compression check");
      return;
    }

    const ratio = result.used / result.capacity;
    if (ratio < COMPRESS_THRESHOLD) return;

    this._status = "compressing";
    this.log(`memory ${result.used}/${result.capacity} (${(ratio * 100).toFixed(0)}%) — triggering compression`);

    // Fetch oldest memories for summarization
    const batchSize = Math.min(COMPRESS_BATCH_SIZE, result.used - 1);
    const fullRead = parseToolJson(
      await callMcpTool(this.client, "read_memories", { agent_id: this.agentId, count: result.used })
    ) as { entries?: any[] } | null;
    const entries: any[] = fullRead?.entries && Array.isArray(fullRead.entries) ? fullRead.entries : [];

    if (entries.length === 0) {
      this.log("read_memories returned no entries — skipping compression");
      return;
    }

    const toCompress = entries.slice(0, batchSize);
    let maxImportance = 1;
    for (const e of toCompress) {
      if (e.importance > maxImportance) maxImportance = e.importance;
    }

    const summaryPrompt = [
      "You are compressing old memories for an AI agent in a game world.",
      "Merge the following memories into ONE concise summary paragraph.",
      "Preserve the most important facts, names, locations, and relationships.",
      "Drop trivial details. Output ONLY the summary text, nothing else.",
      "",
      "Memories to compress:",
      ...toCompress.map((e: any, i: number) =>
        `${i + 1}. [${e.category}, importance=${e.importance}] ${e.content}`
      ),
    ].join("\n");

    const model = this.accountConfig.llmModel || this.globalConfig.llmModel;
    const completion = await createChatCompletion(
      this.globalConfig.llmApiKey,
      this.globalConfig.llmBaseUrl,
      model,
      [{ role: "user", content: summaryPrompt }],
      [],
      this.globalConfig.llmApiType
    );

    const summary = extractTextContent(completion.choices?.[0]?.message?.content).trim();
    if (!summary) {
      this.log("compression failed: LLM returned empty summary", true);
      return;
    }

    await callMcpTool(this.client, "compact_memories", {
      agent_id: this.agentId,
      count: batchSize,
      summary,
      importance: maxImportance,
      category: "summary",
    });

    this.log(`compressed ${batchSize} memories → "${summary.slice(0, 80)}..."`);
  }

  // ──────────────────── Main cycle ────────────────────

  private async runCycle(): Promise<void> {
    const context = await collectContext(this.client, this.agentId);

    const systemMessage: Message = {
      role: "system",
      content: buildSystemPrompt(
        this.accountConfig.agentGoal,
        this.accountConfig.agentSystemPrompt,
        context
      ),
    };

    const userMessage: Message = {
      role: "user",
      content: buildUserPrompt(context),
    };

    const messages: Message[] = [
      systemMessage,
      ...this.conversationHistory,
      userMessage,
    ];

    const model = this.accountConfig.llmModel || this.globalConfig.llmModel;
    const newMessages: Message[] = [];

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

      if (!reply.tool_calls || reply.tool_calls.length === 0) {
        const summary = extractTextContent(reply.content).trim() || "cycle completed";
        this.log(`summary: ${summary}`);
        break;
      }

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

    this.conversationHistory.push(userMessage, ...newMessages);
    this.trimHistory();
  }

  /** Estimate token count for a message (~4 chars per token). */
  private static estimateTokens(msg: Message): number {
    let chars = (msg.content || "").length + (msg.role?.length || 0);
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        chars += tc.function.name.length + tc.function.arguments.length;
      }
    }
    return Math.ceil(chars / 4);
  }

  private trimHistory(): void {
    // 1. Trim by message count
    if (this.conversationHistory.length > this.maxHistoryLength) {
      const excess = this.conversationHistory.length - this.maxHistoryLength;
      this.conversationHistory = this.conversationHistory.slice(excess);
    }

    // 2. Trim by estimated token count (if configured)
    if (this.maxContextLength > 0) {
      let totalTokens = 0;
      for (const msg of this.conversationHistory) {
        totalTokens += RoleRunner.estimateTokens(msg);
      }
      while (this.conversationHistory.length > 0 && totalTokens > this.maxContextLength) {
        const removed = this.conversationHistory.shift()!;
        totalTokens -= RoleRunner.estimateTokens(removed);
      }
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

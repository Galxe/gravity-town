import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  ToolDefinition,
  ChatCompletionResponse,
  McpTool,
  AgentContext,
  AgentSnapshot,
  LlmApiType,
} from "./types.js";

export function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function extractTextContent(content: string | null | undefined): string {
  return typeof content === "string" ? content : "";
}

// ──────────────────── OpenAI ────────────────────

async function callOpenAI(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: Message[],
  tools: ToolDefinition[]
): Promise<ChatCompletionResponse> {
  const client = new OpenAI({ apiKey, baseURL: baseUrl });
  const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model,
    temperature: 0.7,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
  };
  if (tools.length > 0) {
    params.tools = tools as OpenAI.ChatCompletionTool[];
    params.tool_choice = "auto";
  }
  console.log(`[LLM:openai] model=${model} messages=${messages.length} tools=${tools.length} baseURL=${baseUrl}`);
  try {
    const completion = await client.chat.completions.create(params);
    return completion as unknown as ChatCompletionResponse;
  } catch (err: any) {
    // Log request body on error for debugging
    console.error(`[LLM:openai] request failed. Params:`, JSON.stringify({ model, temperature: 0.7, tools_count: tools.length, message_roles: messages.map(m => m.role) }));
    if (err?.error) console.error(`[LLM:openai] error body:`, JSON.stringify(err.error));
    throw err;
  }
}

// ──────────────────── Anthropic ────────────────────

function convertToolsForAnthropic(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
  }));
}

async function callAnthropic(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: Message[],
  tools: ToolDefinition[]
): Promise<ChatCompletionResponse> {
  const client = new Anthropic({ apiKey, baseURL: baseUrl });

  // Extract system message
  let system: string | undefined;
  const nonSystemMessages: Message[] = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      system = msg.content ?? undefined;
    } else {
      nonSystemMessages.push(msg);
    }
  }

  // Convert messages to Anthropic format
  const anthropicMessages: Anthropic.MessageParam[] = [];
  for (const msg of nonSystemMessages) {
    if (msg.role === "user") {
      anthropicMessages.push({ role: "user", content: msg.content || "" });
    } else if (msg.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(tc.function.arguments); } catch {}
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input,
          });
        }
      }
      if (content.length > 0) {
        anthropicMessages.push({ role: "assistant", content });
      }
    } else if (msg.role === "tool") {
      anthropicMessages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: msg.tool_call_id!,
          content: msg.content || "",
        }],
      });
    }
  }

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 4096,
    messages: anthropicMessages,
  };
  if (system) {
    params.system = system;
  }
  if (tools.length > 0) {
    params.tools = convertToolsForAnthropic(tools);
  }

  const response = await client.messages.create(params);

  // Convert Anthropic response back to OpenAI-compatible format
  let textContent = "";
  const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];

  for (const block of response.content) {
    if (block.type === "text") {
      textContent += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  return {
    choices: [{
      message: {
        content: textContent || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      },
    }],
  };
}

// ──────────────────── Public API ────────────────────

export async function createChatCompletion(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: Message[],
  tools: ToolDefinition[],
  apiType: LlmApiType = "openai"
): Promise<ChatCompletionResponse> {
  if (apiType === "anthropic") {
    return callAnthropic(apiKey, baseUrl, model, messages, tools);
  }
  return callOpenAI(apiKey, baseUrl, model, messages, tools);
}

export function buildSystemPrompt(goal: string, customPrompt: string | undefined, context: AgentContext): string {
  const self = (typeof context.self === "object" && context.self ? context.self : {}) as AgentSnapshot;
  const lines = [
    "You are an autonomous agent living inside AI Town.",
    `Your persistent objective: ${goal}`,
    `Current agent profile: ${self.name || "unknown"} | personality: ${self.personality || "unknown"}`,
    "You must behave like an in-world character, not like an assistant talking to a user.",
    "Prefer concrete in-world actions: moving, interacting, remembering, gifting gold, and advancing the world tick when appropriate.",
    "Keep outputs short and action-oriented.",
    "When you use a tool that changes the world, make sure the arguments are realistic and internally consistent.",
    "Avoid repeating the same action with the same explanation unless the world state actually changed.",
    "If you have enough information, call tools instead of describing what you might do.",
    "When the cycle is complete, respond with a brief summary of what you decided or accomplished.",
  ];

  if (customPrompt) {
    lines.push(`Additional operator instructions: ${customPrompt}`);
  }

  return lines.join("\n");
}

export function buildUserPrompt(context: AgentContext): string {
  return [
    `Timestamp: ${nowIso()}`,
    "Current world snapshot:",
    stringify(context),
    "Decide what to do in this cycle. You may call tools multiple times before giving your final short summary.",
  ].join("\n\n");
}

export function createToolDefinitions(agentId: number, tools: McpTool[]): ToolDefinition[] {
  return tools.map((tool) => {
    const schema = { ...(tool.inputSchema || { type: "object", properties: {} }) } as Record<string, unknown>;
    const properties =
      schema.properties && typeof schema.properties === "object"
        ? { ...(schema.properties as Record<string, unknown>) }
        : {};

    const selfTools = [
      "get_agent", "get_nearby_agents", "get_balance", "recall_memories",
      "move_agent", "perform_action", "add_memory",
    ];

    if (selfTools.includes(tool.name)) {
      properties.agent_id = {
        type: "number",
        description: `Defaults to controlled agent id ${agentId}`,
      };
    }

    if (tool.name === "transfer_gold") {
      properties.from_agent = {
        type: "number",
        description: `Defaults to controlled agent id ${agentId}`,
      };
    }

    schema.properties = properties;
    if (!schema.type) {
      schema.type = "object";
    }

    return {
      type: "function",
      function: {
        name: tool.name,
        description: `${tool.description || ""} Control this in-world agent via MCP. Agent id defaults to ${agentId} when omitted for self-targeted tools.`.trim(),
        parameters: schema,
      },
    };
  });
}

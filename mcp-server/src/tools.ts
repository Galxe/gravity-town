// MCP Tool definitions for AI Town
import { z } from "zod";
import { ChainClient } from "./chain.js";

export function registerTools(server: any, chain: ChainClient) {
  // ============ Agent Management ============

  server.tool(
    "create_agent",
    "Create a new AI Agent in the town with a name, personality, stats, and starting location",
    {
      name: z.string().describe("Agent's name"),
      personality: z.string().describe("Personality description (e.g. 'hardworking blacksmith, quiet but kind')"),
      stats: z.array(z.number().min(1).max(10)).length(4).describe("Stats array: [strength, wisdom, charisma, luck], each 1-10"),
      location: z.number().describe("Starting location ID"),
      owner: z.string().optional().describe("Owner wallet address (defaults to operator)"),
    },
    async ({ name, personality, stats, location, owner }: any) => {
      const ownerAddr = owner || await chain.signer.getAddress();
      const result = await chain.createAgent(name, personality, stats, location, ownerAddr);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_agent",
    "Get the full state of an AI Agent including name, personality, stats, location, and gold balance",
    {
      agent_id: z.number().describe("Agent ID"),
    },
    async ({ agent_id }: any) => {
      const agent = await chain.getAgent(agent_id);
      return { content: [{ type: "text", text: JSON.stringify(agent, null, 2) }] };
    }
  );

  server.tool(
    "list_agents",
    "List all AI Agents in the town with their current states",
    {},
    async () => {
      const agents = await chain.listAgents();
      return { content: [{ type: "text", text: JSON.stringify(agents, null, 2) }] };
    }
  );

  // ============ World Interaction ============

  server.tool(
    "get_world",
    "Get the full world state: all locations, which agents are where, and the current tick",
    {},
    async () => {
      const world = await chain.getWorld();
      return { content: [{ type: "text", text: JSON.stringify(world, null, 2) }] };
    }
  );

  server.tool(
    "move_agent",
    "Move an Agent to a different location in the town",
    {
      agent_id: z.number().describe("Agent ID to move"),
      location_id: z.number().describe("Target location ID"),
    },
    async ({ agent_id, location_id }: any) => {
      const result = await chain.moveAgent(agent_id, location_id);
      return { content: [{ type: "text", text: `Moved agent ${agent_id} to location ${location_id}. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "perform_action",
    "Make an Agent perform an action at their current location and record the result",
    {
      agent_id: z.number().describe("Agent ID performing the action"),
      action: z.string().describe("Action to perform (e.g. 'mine', 'chat', 'trade')"),
      result: z.string().describe("Description of the action's outcome"),
    },
    async ({ agent_id, action, result }: any) => {
      const res = await chain.performAction(agent_id, action, result);
      return { content: [{ type: "text", text: `Action recorded. tx: ${res.txHash}` }] };
    }
  );

  server.tool(
    "get_nearby_agents",
    "Get all other Agents at the same location as the specified Agent",
    {
      agent_id: z.number().describe("Agent ID to check surroundings for"),
    },
    async ({ agent_id }: any) => {
      const nearby = await chain.getNearbyAgents(agent_id);
      return { content: [{ type: "text", text: JSON.stringify(nearby, null, 2) }] };
    }
  );

  server.tool(
    "get_recent_events",
    "Get recent events/actions that happened at a specific location",
    {
      location_id: z.number().describe("Location ID"),
      count: z.number().default(10).describe("Number of recent events to retrieve"),
    },
    async ({ location_id, count }: any) => {
      const events = await chain.getRecentEvents(location_id, count);
      return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
    }
  );

  // ============ Memory System ============

  server.tool(
    "add_memory",
    "Record a new memory for an Agent. Memories persist on-chain and influence future decisions",
    {
      agent_id: z.number().describe("Agent ID"),
      importance: z.number().min(1).max(10).describe("Importance level 1-10 (10 = life-changing event)"),
      category: z.enum(["social", "discovery", "trade", "event", "reflection"]).describe("Memory category"),
      content: z.string().describe("Memory content - a concise summary of what happened"),
      related_agents: z.array(z.number()).default([]).describe("IDs of other Agents involved in this memory"),
    },
    async ({ agent_id, importance, category, content, related_agents }: any) => {
      const result = await chain.addMemory(agent_id, importance, category, content, related_agents);
      return { content: [{ type: "text", text: `Memory recorded. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "recall_memories",
    "Retrieve an Agent's recent memories from the chain",
    {
      agent_id: z.number().describe("Agent ID"),
      count: z.number().default(10).describe("Number of recent memories to retrieve"),
      min_importance: z.number().min(1).max(10).optional().describe("If set, only return memories at or above this importance"),
      category: z.string().optional().describe("If set, filter by this category"),
    },
    async ({ agent_id, count, min_importance, category }: any) => {
      let memories;
      if (min_importance) {
        memories = await chain.getImportantMemories(agent_id, min_importance);
      } else if (category) {
        memories = await chain.getMemoriesByCategory(agent_id, category);
      } else {
        memories = await chain.recallMemories(agent_id, count);
      }
      return { content: [{ type: "text", text: JSON.stringify(memories, null, 2) }] };
    }
  );

  server.tool(
    "compress_memories",
    "Compress the N oldest memories of an Agent into a single summary, freeing storage slots. Use when memory is nearly full.",
    {
      agent_id: z.number().describe("Agent ID"),
      count: z.number().min(2).describe("Number of oldest memories to merge (>= 2)"),
      summary_content: z.string().describe("AI-generated compressed summary of the merged memories"),
      importance: z.number().min(1).max(10).describe("Importance level for the summary (usually the max of merged memories)"),
      category: z.enum(["social", "discovery", "trade", "event", "reflection"]).default("reflection").describe("Category for the summary"),
    },
    async ({ agent_id, count, summary_content, importance, category }: any) => {
      const result = await chain.compressMemories(agent_id, count, summary_content, importance, category);
      return { content: [{ type: "text", text: `Compressed ${count} memories into 1 summary. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "get_memory_usage",
    "Get how many memory slots an Agent has used vs total capacity. Use to decide when to compress.",
    {
      agent_id: z.number().describe("Agent ID"),
    },
    async ({ agent_id }: any) => {
      const usage = await chain.getMemoryUsage(agent_id);
      return { content: [{ type: "text", text: JSON.stringify(usage, null, 2) }] };
    }
  );

  server.tool(
    "get_shared_history",
    "Get shared memories between two Agents - events they both participated in",
    {
      agent_a: z.number().describe("First Agent ID"),
      agent_b: z.number().describe("Second Agent ID"),
    },
    async ({ agent_a, agent_b }: any) => {
      const shared = await chain.getSharedHistory(agent_a, agent_b);
      return { content: [{ type: "text", text: JSON.stringify(shared, null, 2) }] };
    }
  );

  // ============ Economy ============

  server.tool(
    "transfer_gold",
    "Transfer gold between two Agents",
    {
      from_agent: z.number().describe("Agent ID sending gold"),
      to_agent: z.number().describe("Agent ID receiving gold"),
      amount: z.number().min(1).describe("Amount of gold to transfer"),
    },
    async ({ from_agent, to_agent, amount }: any) => {
      const result = await chain.transferGold(from_agent, to_agent, amount);
      return { content: [{ type: "text", text: `Transferred ${amount} gold from Agent #${from_agent} to Agent #${to_agent}. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "get_balance",
    "Get the gold balance of an Agent",
    {
      agent_id: z.number().describe("Agent ID"),
    },
    async ({ agent_id }: any) => {
      const agent = await chain.getAgent(agent_id);
      return { content: [{ type: "text", text: `Agent #${agent_id} (${agent.name}) has ${agent.gold} gold` }] };
    }
  );

  // ============ World Management ============

  server.tool(
    "advance_tick",
    "Advance the world clock by one tick",
    {},
    async () => {
      const result = await chain.advanceTick();
      return { content: [{ type: "text", text: `World advanced to tick ${result.tick}. tx: ${result.txHash}` }] };
    }
  );
}

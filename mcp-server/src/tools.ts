// MCP Tool definitions — unified ledger architecture
import { z } from "zod";
import { ChainClient } from "./chain.js";

export function registerTools(server: any, chain: ChainClient) {
  // ============ Agent Lifecycle ============

  server.tool(
    "create_agent",
    "Create a new AI Agent in the town with a name, personality, stats, and starting location",
    {
      name: z.string().describe("Agent's name"),
      personality: z.string().describe("Personality description"),
      stats: z.array(z.number().min(1).max(10)).length(4).describe("Stats: [strength, wisdom, charisma, luck]"),
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
    "Get the full state of an AI Agent",
    { agent_id: z.number().describe("Agent ID") },
    async ({ agent_id }: any) => {
      const agent = await chain.getAgent(agent_id);
      return { content: [{ type: "text", text: JSON.stringify(agent, null, 2) }] };
    }
  );

  server.tool(
    "list_agents",
    "List all AI Agents in the town",
    {},
    async () => {
      const agents = await chain.listAgents();
      return { content: [{ type: "text", text: JSON.stringify(agents, null, 2) }] };
    }
  );

  // ============ World ============

  server.tool(
    "get_world",
    "Get full world state: locations (with hex coordinates), agent positions, current tick",
    {},
    async () => {
      const world = await chain.getWorld();
      return { content: [{ type: "text", text: JSON.stringify(world, null, 2) }] };
    }
  );

  server.tool(
    "move_agent",
    "Move an Agent to a different location",
    {
      agent_id: z.number().describe("Agent ID"),
      location_id: z.number().describe("Target location ID"),
    },
    async ({ agent_id, location_id }: any) => {
      const result = await chain.moveAgent(agent_id, location_id);
      return { content: [{ type: "text", text: `Moved agent ${agent_id} to location ${location_id}. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "get_nearby_agents",
    "Get all other Agents at the same location",
    { agent_id: z.number().describe("Agent ID") },
    async ({ agent_id }: any) => {
      const nearby = await chain.getNearbyAgents(agent_id);
      return { content: [{ type: "text", text: JSON.stringify(nearby, null, 2) }] };
    }
  );

  server.tool(
    "advance_tick",
    "Advance the world clock by one tick",
    {},
    async () => {
      const result = await chain.advanceTick();
      return { content: [{ type: "text", text: `World advanced to tick ${result.tick}. tx: ${result.txHash}` }] };
    }
  );

  // ============ Agent Ledger (memories) ============

  server.tool(
    "add_memory",
    "Record a memory to your personal ledger. Returns { used, capacity } so you know when to compact.",
    {
      agent_id: z.number().describe("Agent ID"),
      importance: z.number().min(1).max(10).describe("Importance 1-10"),
      category: z.string().describe("Category: social, discovery, trade, event, reflection"),
      content: z.string().describe("Memory content"),
      related_agents: z.array(z.number()).default([]).describe("IDs of related agents"),
    },
    async ({ agent_id, importance, category, content, related_agents }: any) => {
      const result = await chain.writeMemory(agent_id, importance, category, content, related_agents);
      return { content: [{ type: "text", text: `Memory recorded. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "read_memories",
    "Read recent entries from your personal memory ledger. Returns { entries, used, capacity }.",
    {
      agent_id: z.number().describe("Agent ID"),
      count: z.number().default(10).describe("Number of recent entries"),
    },
    async ({ agent_id, count }: any) => {
      const result = await chain.readMemories(agent_id, count);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "compact_memories",
    "Compress N oldest memories into one summary, freeing N-1 slots.",
    {
      agent_id: z.number().describe("Agent ID"),
      count: z.number().min(2).describe("Number of oldest entries to merge"),
      importance: z.number().min(1).max(10).describe("Importance for the summary"),
      category: z.string().default("summary").describe("Category for the summary"),
      summary: z.string().describe("AI-generated compressed summary"),
    },
    async ({ agent_id, count, importance, category, summary }: any) => {
      const result = await chain.compactMemories(agent_id, count, importance, category, summary);
      return { content: [{ type: "text", text: `Compacted ${count} memories into 1 summary. tx: ${result.txHash}` }] };
    }
  );

  // ============ Location Ledger (public board) ============

  server.tool(
    "post_to_location",
    "Post to the public board at your current location. All agents can read it. Returns { used, capacity }.",
    {
      agent_id: z.number().describe("Agent ID (must be at the location)"),
      importance: z.number().min(1).max(10).default(5).describe("Importance 1-10"),
      category: z.string().describe("Category: chat, action, trade, event, announcement"),
      content: z.string().describe("What you're posting"),
      related_agents: z.array(z.number()).default([]).describe("IDs of related agents"),
    },
    async ({ agent_id, importance, category, content, related_agents }: any) => {
      const result = await chain.writeToLocation(agent_id, importance, category, content, related_agents);
      return { content: [{ type: "text", text: `Posted to location board. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "read_location",
    "Read recent entries from a location's public board. Returns { entries, used, capacity }.",
    {
      location_id: z.number().describe("Location ID"),
      count: z.number().default(10).describe("Number of recent entries"),
    },
    async ({ location_id, count }: any) => {
      const result = await chain.readLocation(location_id, count);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "compact_location",
    "Compress N oldest entries on a location board into one summary.",
    {
      location_id: z.number().describe("Location ID"),
      agent_id: z.number().describe("Agent ID performing the compaction"),
      count: z.number().min(2).describe("Number of oldest entries to merge"),
      importance: z.number().min(1).max(10).describe("Importance for the summary"),
      category: z.string().default("summary").describe("Category for the summary"),
      summary: z.string().describe("AI-generated compressed summary"),
    },
    async ({ location_id, agent_id, count, importance, category, summary }: any) => {
      const result = await chain.compactLocation(location_id, agent_id, count, importance, category, summary);
      return { content: [{ type: "text", text: `Compacted ${count} location entries into 1. tx: ${result.txHash}` }] };
    }
  );

  // ============ Inbox Ledger (DMs) ============

  server.tool(
    "send_message",
    "Send a direct message to another agent's inbox. Cross-location OK. Returns { used, capacity } of recipient's inbox.",
    {
      from_agent: z.number().describe("Sender Agent ID"),
      to_agent: z.number().describe("Recipient Agent ID"),
      importance: z.number().min(1).max(10).default(5).describe("Importance 1-10"),
      category: z.string().default("chat").describe("Category: chat, trade, coordination"),
      content: z.string().describe("Message content"),
      related_agents: z.array(z.number()).default([]).describe("Other agents mentioned"),
    },
    async ({ from_agent, to_agent, importance, category, content, related_agents }: any) => {
      const result = await chain.sendMessage(from_agent, to_agent, importance, category, content, related_agents);
      return { content: [{ type: "text", text: `Message sent to Agent #${to_agent}. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "read_inbox",
    "Read recent messages in your inbox. Returns { entries, used, capacity }.",
    {
      agent_id: z.number().describe("Agent ID"),
      count: z.number().default(10).describe("Number of recent messages"),
      from_agent: z.number().optional().describe("Filter by sender"),
    },
    async ({ agent_id, count, from_agent }: any) => {
      if (from_agent !== undefined) {
        const entries = await chain.readInboxFrom(agent_id, from_agent);
        return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
      }
      const result = await chain.readInbox(agent_id, count);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "compact_inbox",
    "Compress N oldest inbox messages into one summary.",
    {
      agent_id: z.number().describe("Agent ID"),
      count: z.number().min(2).describe("Number of oldest entries to merge"),
      importance: z.number().min(1).max(10).describe("Importance for the summary"),
      category: z.string().default("summary").describe("Category for the summary"),
      summary: z.string().describe("AI-generated compressed summary"),
    },
    async ({ agent_id, count, importance, category, summary }: any) => {
      const result = await chain.compactInbox(agent_id, count, importance, category, summary);
      return { content: [{ type: "text", text: `Compacted ${count} inbox messages into 1. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "get_conversation",
    "Get the full two-way conversation between two agents, sorted by time.",
    {
      agent_a: z.number().describe("First Agent ID"),
      agent_b: z.number().describe("Second Agent ID"),
    },
    async ({ agent_a, agent_b }: any) => {
      const entries = await chain.getConversation(agent_a, agent_b);
      return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
    }
  );

  // ============ Economy ============

  server.tool(
    "transfer_gold",
    "Transfer gold between two Agents",
    {
      from_agent: z.number().describe("Sender Agent ID"),
      to_agent: z.number().describe("Recipient Agent ID"),
      amount: z.number().min(1).describe("Amount of gold"),
    },
    async ({ from_agent, to_agent, amount }: any) => {
      const result = await chain.transferGold(from_agent, to_agent, amount);
      return { content: [{ type: "text", text: `Transferred ${amount} gold from #${from_agent} to #${to_agent}. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "get_balance",
    "Get the gold balance of an Agent",
    { agent_id: z.number().describe("Agent ID") },
    async ({ agent_id }: any) => {
      const agent = await chain.getAgent(agent_id);
      return { content: [{ type: "text", text: `Agent #${agent_id} (${agent.name}) has ${agent.gold} gold` }] };
    }
  );
}

// MCP Tool definitions — hex territory economy
import { z } from "zod";
import { ChainClient } from "./chain.js";

export function registerTools(server: any, chain: ChainClient) {
  // ============ Agent ============

  server.tool(
    "create_agent",
    "Create a new agent. Auto-claims a hex near origin as home base with 200 starting ore.",
    {
      name: z.string().describe("Agent's name"),
      personality: z.string().describe("Personality description"),
      stats: z.array(z.number().min(1).max(10)).length(4).describe("Stats: [strength, wisdom, charisma, luck]"),
      owner: z.string().optional().describe("Owner wallet address (defaults to operator)"),
    },
    async ({ name, personality, stats, owner }: any) => {
      const ownerAddr = owner || await chain.signer.getAddress();
      const result = await chain.createAgent(name, personality, stats, ownerAddr);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_agent",
    "Get agent state: identity, location, hex count, score",
    { agent_id: z.number().describe("Agent ID") },
    async ({ agent_id }: any) => {
      const agent = await chain.getAgent(agent_id);
      return { content: [{ type: "text", text: JSON.stringify(agent, null, 2) }] };
    }
  );

  server.tool(
    "list_agents",
    "List all agents with their state",
    {},
    async () => {
      const agents = await chain.listAgents();
      return { content: [{ type: "text", text: JSON.stringify(agents, null, 2) }] };
    }
  );

  // ============ World / Movement ============

  server.tool(
    "get_world",
    "Get all claimed hexes as locations with agent positions",
    {},
    async () => {
      const world = await chain.getWorld();
      return { content: [{ type: "text", text: JSON.stringify(world, null, 2) }] };
    }
  );

  server.tool(
    "move_agent",
    "Move agent to a hex location (by location ID). Must know the location ID of the target hex.",
    {
      agent_id: z.number().describe("Agent ID"),
      location_id: z.number().describe("Target location ID (from get_hex or get_world)"),
    },
    async ({ agent_id, location_id }: any) => {
      const result = await chain.moveAgent(agent_id, location_id);
      return { content: [{ type: "text", text: `Moved. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "get_nearby_agents",
    "Get agents at the same hex/location as you",
    { agent_id: z.number().describe("Agent ID") },
    async ({ agent_id }: any) => {
      const nearby = await chain.getNearbyAgents(agent_id);
      return { content: [{ type: "text", text: JSON.stringify(nearby, null, 2) }] };
    }
  );

  // ============ Hex / Economy ============

  server.tool(
    "get_hex",
    "Get hex data: owner, buildings (mines/arsenals), ore, defense. Pass a hex_key (bytes32).",
    { hex_key: z.string().describe("Hex key (bytes32)") },
    async ({ hex_key }: any) => {
      const hex = await chain.getHex(hex_key);
      return { content: [{ type: "text", text: JSON.stringify(hex, null, 2) }] };
    }
  );

  server.tool(
    "get_my_hexes",
    "Get all hexes owned by an agent with their buildings and ore",
    { agent_id: z.number().describe("Agent ID") },
    async ({ agent_id }: any) => {
      const hexes = await chain.getMyHexes(agent_id);
      return { content: [{ type: "text", text: JSON.stringify(hexes, null, 2) }] };
    }
  );

  server.tool(
    "claim_hex",
    "Claim an empty hex adjacent to your territory. Cost escalates: 200, 400, 800... ore. Deducted from source hex.",
    {
      agent_id: z.number().describe("Agent ID"),
      q: z.number().describe("Target hex q coordinate"),
      r: z.number().describe("Target hex r coordinate"),
      source_hex_key: z.string().describe("Hex key to pay ore from"),
    },
    async ({ agent_id, q, r, source_hex_key }: any) => {
      const result = await chain.claimHex(agent_id, q, r, source_hex_key);
      return { content: [{ type: "text", text: `Claimed hex. key: ${result.hexKey}. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "harvest",
    "Harvest pending ore on a hex. Ore accumulates lazily based on time and mine count.",
    { hex_key: z.string().describe("Hex key") },
    async ({ hex_key }: any) => {
      const result = await chain.harvest(hex_key);
      return { content: [{ type: "text", text: `Harvested +${result.oreGained} ore. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "build",
    "Build on your hex. Instant, costs ore. Types: 1=Mine (+5 ore/min), 2=Arsenal (+5 defense, consumable for +5 attack). 12 slots per hex.",
    {
      agent_id: z.number().describe("Agent ID"),
      hex_key: z.string().describe("Hex key (must own)"),
      building_type: z.number().min(1).max(2).describe("1=Mine (50 ore), 2=Arsenal (100 ore)"),
    },
    async ({ agent_id, hex_key, building_type }: any) => {
      const result = await chain.build(agent_id, hex_key, building_type);
      return { content: [{ type: "text", text: `Built ${result.buildingType}. tx: ${result.txHash}` }] };
    }
  );

  // ============ Combat ============

  server.tool(
    "attack",
    "Attack a hex. Must be at target hex (move_agent first). Spend arsenals (destroyed from source hex) + ore as attack power. Win: target buildings destroyed, hex unclaimed. Lose: spent resources gone. Cooldown 60s per target.",
    {
      agent_id: z.number().describe("Attacking agent ID"),
      target_hex_key: z.string().describe("Hex key to attack"),
      source_hex_key: z.string().describe("Your hex key (arsenals consumed from here)"),
      arsenal_spend: z.number().min(0).describe("Number of arsenals to consume (each +5 attack)"),
      ore_spend: z.number().min(0).describe("Ore to invest as attack power"),
    },
    async ({ agent_id, target_hex_key, source_hex_key, arsenal_spend, ore_spend }: any) => {
      const r = await chain.attack(agent_id, target_hex_key, source_hex_key, arsenal_spend, ore_spend);
      const outcome = r.success
        ? `SUCCESS! Target hex destroyed. Attack ${r.attackPower} vs Defense ${r.defensePower}.`
        : `FAILED. Attack ${r.attackPower} vs Defense ${r.defensePower}. Resources lost.`;
      return { content: [{ type: "text", text: `${outcome} tx: ${r.txHash}` }] };
    }
  );

  server.tool(
    "raid",
    "ONE-STEP attack: auto-moves to target hex, picks your best source hex, and attacks. Much simpler than attack — use this instead. Win: target buildings destroyed + hex unclaimed. Lose: spent resources gone.",
    {
      agent_id: z.number().describe("Attacking agent ID"),
      target_hex_key: z.string().describe("Hex key to attack (from get_world or get_hex)"),
      arsenal_spend: z.number().min(1).describe("Arsenals to consume from your best hex (each +5 attack)"),
      ore_spend: z.number().min(0).describe("Ore to invest as extra attack power"),
    },
    async ({ agent_id, target_hex_key, arsenal_spend, ore_spend }: any) => {
      const r = await chain.raid(agent_id, target_hex_key, arsenal_spend, ore_spend);
      const outcome = r.success
        ? `RAID SUCCESS! Target hex destroyed. Attack ${r.attackPower} vs Defense ${r.defensePower}.`
        : `RAID FAILED. Attack ${r.attackPower} vs Defense ${r.defensePower}. Resources lost.`;
      return { content: [{ type: "text", text: `${outcome} tx: ${r.txHash}` }] };
    }
  );

  server.tool(
    "get_claimable_hexes",
    "List all empty hexes adjacent to your territory that you can claim. Returns coordinates + cost.",
    { agent_id: z.number().describe("Agent ID") },
    async ({ agent_id }: any) => {
      const result = await chain.getClaimableHexes(agent_id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ============ Scoring ============

  server.tool(
    "get_score",
    "Get agent score: hexes×100 + ore + buildings×50",
    { agent_id: z.number().describe("Agent ID") },
    async ({ agent_id }: any) => {
      const score = await chain.getScore(agent_id);
      return { content: [{ type: "text", text: `Score: ${score}` }] };
    }
  );

  server.tool(
    "get_scoreboard",
    "Global scoreboard ranked by score",
    {},
    async () => {
      const sb = await chain.getScoreboard();
      return { content: [{ type: "text", text: JSON.stringify(sb, null, 2) }] };
    }
  );

  // ============ Memories ============

  server.tool(
    "add_memory",
    "Record a memory to your personal ledger",
    {
      agent_id: z.number().describe("Agent ID"),
      importance: z.number().min(1).max(10).describe("Importance 1-10"),
      category: z.string().describe("Category"),
      content: z.string().describe("Memory content"),
      related_agents: z.array(z.number()).default([]).describe("Related agent IDs"),
    },
    async ({ agent_id, importance, category, content, related_agents }: any) => {
      const r = await chain.writeMemory(agent_id, importance, category, content, related_agents);
      return { content: [{ type: "text", text: `Memory recorded. tx: ${r.txHash}` }] };
    }
  );

  server.tool(
    "read_memories",
    "Read recent memories",
    { agent_id: z.number().describe("Agent ID"), count: z.number().default(10) },
    async ({ agent_id, count }: any) => {
      const r = await chain.readMemories(agent_id, count);
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    }
  );

  server.tool(
    "compact_memories",
    "Compress N oldest memories into one summary",
    {
      agent_id: z.number().describe("Agent ID"),
      count: z.number().min(2), importance: z.number().min(1).max(10),
      category: z.string().default("summary"), summary: z.string(),
    },
    async ({ agent_id, count, importance, category, summary }: any) => {
      const r = await chain.compactMemories(agent_id, count, importance, category, summary);
      return { content: [{ type: "text", text: `Compacted. tx: ${r.txHash}` }] };
    }
  );

  // ============ Location Board (hex bulletin) ============

  server.tool(
    "post_to_location",
    "Post to the bulletin board of your current hex. Visible to all.",
    {
      agent_id: z.number().describe("Agent ID"),
      importance: z.number().min(1).max(10).default(5),
      category: z.string(), content: z.string(),
      related_agents: z.array(z.number()).default([]),
    },
    async ({ agent_id, importance, category, content, related_agents }: any) => {
      const r = await chain.writeToLocation(agent_id, importance, category, content, related_agents);
      return { content: [{ type: "text", text: `Posted. tx: ${r.txHash}` }] };
    }
  );

  server.tool(
    "read_location",
    "Read bulletin board entries for a location/hex",
    { location_id: z.number(), count: z.number().default(10) },
    async ({ location_id, count }: any) => {
      const r = await chain.readLocation(location_id, count);
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    }
  );

  server.tool(
    "compact_location",
    "Compress oldest entries on a location board",
    {
      location_id: z.number(), agent_id: z.number(),
      count: z.number().min(2), importance: z.number().min(1).max(10),
      category: z.string().default("summary"), summary: z.string(),
    },
    async ({ location_id, agent_id, count, importance, category, summary }: any) => {
      const r = await chain.compactLocation(location_id, agent_id, count, importance, category, summary);
      return { content: [{ type: "text", text: `Compacted. tx: ${r.txHash}` }] };
    }
  );

  // ============ Inbox ============

  server.tool(
    "send_message",
    "Send a private message to another agent",
    {
      from_agent: z.number(), to_agent: z.number(),
      importance: z.number().min(1).max(10).default(5),
      category: z.string().default("chat"), content: z.string(),
      related_agents: z.array(z.number()).default([]),
    },
    async ({ from_agent, to_agent, importance, category, content, related_agents }: any) => {
      const r = await chain.sendMessage(from_agent, to_agent, importance, category, content, related_agents);
      return { content: [{ type: "text", text: `Sent to #${to_agent}. tx: ${r.txHash}` }] };
    }
  );

  server.tool(
    "read_inbox",
    "Read inbox messages",
    { agent_id: z.number(), count: z.number().default(10), from_agent: z.number().optional() },
    async ({ agent_id, count, from_agent }: any) => {
      if (from_agent !== undefined) {
        const entries = await chain.readInboxFrom(agent_id, from_agent);
        return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
      }
      const r = await chain.readInbox(agent_id, count);
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    }
  );

  server.tool(
    "compact_inbox",
    "Compress oldest inbox messages into summary",
    {
      agent_id: z.number(), count: z.number().min(2),
      importance: z.number().min(1).max(10),
      category: z.string().default("summary"), summary: z.string(),
    },
    async ({ agent_id, count, importance, category, summary }: any) => {
      const r = await chain.compactInbox(agent_id, count, importance, category, summary);
      return { content: [{ type: "text", text: `Compacted. tx: ${r.txHash}` }] };
    }
  );

  server.tool(
    "get_conversation",
    "Two-way conversation between agents",
    { agent_a: z.number(), agent_b: z.number() },
    async ({ agent_a, agent_b }: any) => {
      const entries = await chain.getConversation(agent_a, agent_b);
      return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
    }
  );
}

// MCP Tool definitions — hex territory economy
import { z } from "zod";
import { ChainClient } from "./chain.js";
import { searchWeb } from "./web.js";

export function registerTools(server: any, chain: ChainClient) {
  // ============ Agent ============

  server.tool(
    "create_agent",
    "Create a new agent (idempotent — returns existing agent if same name+owner). Auto-claims a 7-hex cluster with 200 starting ore.",
    {
      name: z.string().describe("Agent's name"),
      personality: z.string().describe("Personality description"),
      stats: z.array(z.number().min(1).max(10)).length(4).describe("Stats: [strength, wisdom, charisma, luck]"),
      owner: z.string().optional().describe("Owner wallet address (defaults to operator)"),
    },
    async ({ name, personality, stats, owner }: any) => {
      const ownerAddr = owner || await chain.signer.getAddress();
      // Check if agent already exists for this owner+name
      const existingId = await chain.findAgentByName(name, ownerAddr);
      if (existingId > 0) {
        const agent = await chain.getAgent(existingId);
        return { content: [{ type: "text", text: JSON.stringify({ agentId: String(existingId), existing: true, ...agent }, null, 2) }] };
      }
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

  server.tool(
    "get_my_agents",
    "List all agents owned by the current operator (or a given address)",
    {
      owner: z.string().optional().describe("Owner wallet address (defaults to operator)"),
    },
    async ({ owner }: any) => {
      const ownerAddr = owner || await chain.signer.getAddress();
      const agents = await chain.getAgentsByOwner(ownerAddr);
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
    "harvest",
    "Harvest all your hexes. Ore from all hexes flows into your ore pool.",
    { agent_id: z.number().describe("Agent ID") },
    async ({ agent_id }: any) => {
      const result = await chain.harvest(agent_id);
      return { content: [{ type: "text", text: `Harvested +${result.oreGained} ore. Pool: ${result.orePool}. tx: ${result.txHash}` }] };
    }
  );

  server.tool(
    "build",
    "Build on your hex. Instant, costs ore. Types: 1=Mine (+5 ore/sec), 2=Arsenal (+5 defense, consumable for +5 attack). 6 slots per hex.",
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
    "Attack a hex. Must be at target hex (move_agent first). Spend arsenals (destroyed from source hex) + ore as attack power. Win: capture hex + steal 30% of defender ore. Lose: spent resources gone. Cooldown 5s per target.",
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
    "ONE-STEP attack: auto-moves to target hex, picks your best source hex, and attacks. Much simpler than attack — use this instead. Win: capture hex + steal 30% of defender ore. Lose: spent resources gone.",
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

  // ============ Claim Neutral Hex ============

  server.tool(
    "claim_neutral",
    "Claim a neutral (rebelled) hex for free. No cost. Anyone can claim neutral hexes. Use get_world to find hexes with ownerId=0.",
    {
      agent_id: z.number().describe("Your agent ID"),
      hex_key: z.string().describe("Hex key of the neutral hex (from get_world)"),
    },
    async ({ agent_id, hex_key }: any) => {
      const r = await chain.claimNeutral(agent_id, hex_key);
      return { content: [{ type: "text", text: `Claimed neutral hex! tx: ${r.txHash}` }] };
    }
  );

  // ============ Comeback (incite rebellion) ============

  server.tool(
    "incite_rebellion",
    "COMEBACK MECHANIC: Only usable when you have 0 hexes (eliminated). 50% chance to reduce target hex happiness by 30. If happiness hits 0, you CAPTURE the hex and respawn with 200 ore! Cooldown 30s per hex.",
    {
      agent_id: z.number().describe("Your agent ID"),
      target_hex_key: z.string().describe("Hex key to incite rebellion on (from get_world)"),
    },
    async ({ agent_id, target_hex_key }: any) => {
      const r = await chain.inciteRebellion(agent_id, target_hex_key);
      if (r.captured) {
        return { content: [{ type: "text", text: `REBELLION SUCCESS! You captured the hex and respawned with 200 ore! tx: ${r.txHash}` }] };
      } else if (r.success) {
        return { content: [{ type: "text", text: `Incite succeeded — target hex happiness reduced by 30. Keep going! tx: ${r.txHash}` }] };
      } else {
        return { content: [{ type: "text", text: `Incite failed (50% chance). Try again after cooldown. tx: ${r.txHash}` }] };
      }
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
      // Boost happiness on the hex the agent is currently at
      try {
        const hexes = await chain.getMyHexes(agent_id);
        const agent = await chain.getAgent(agent_id);
        const currentHex = hexes.hexes.find((h: any) => h.locationId === agent.location);
        if (currentHex) {
          await chain.boostHappiness(agent_id, currentHex.hexKey);
        }
      } catch (_) { /* best-effort */ }
      return { content: [{ type: "text", text: `Posted (happiness +10). tx: ${r.txHash}` }] };
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

  // ============ Debate ============

  server.tool(
    "start_debate",
    "Start a debate on the hex you're at. Normal agents get a 1-hour debate. The Oracle agent automatically gets a 4-hour oracle debate where voters must bet ore. When resolved: support wins → happiness +10, oppose wins → happiness -15. If ore was bet, winners split losers' pool.",
    {
      agent_id: z.number().describe("Your agent ID"),
      content: z.string().describe("Your debate statement / prediction question"),
    },
    async ({ agent_id, content }: any) => {
      const r = await chain.startDebate(agent_id, content);
      const debate = await chain.getDebate(r.entryId);
      const typeLabel = debate.isOracle ? "Oracle debate (4hr, ore bets required)" : "Normal debate (1hr)";

      // Notify all other agents
      try {
        const allAgents = await chain.listAgents();
        const author = allAgents.find((a: any) => a.id === agent_id);
        const authorName = author?.name || `Agent #${agent_id}`;
        const category = debate.isOracle ? "prediction_notice" : "debate_notice";
        const betHint = debate.isOracle
          ? ` Bet ore with vote_debate(debate_entry_id=${r.entryId}, support=true/false, ore_amount=10-500).`
          : ` Vote with vote_debate(debate_entry_id=${r.entryId}, support=true/false).`;
        for (const agent of allAgents) {
          if (agent.id === agent_id) continue;
          await chain.sendMessage(
            agent_id, agent.id, 7, category,
            `${authorName} started a ${debate.isOracle ? "prediction" : "debate"} (entry #${r.entryId}): "${content.slice(0, 80)}".${betHint}`,
            [agent_id]
          );
        }
      } catch (_) { /* best-effort notification */ }

      return { content: [{ type: "text", text: `${typeLabel} started! Entry ID: ${r.entryId}. Deadline: ${r.deadline}. tx: ${r.txHash}` }] };
    }
  );

  server.tool(
    "vote_debate",
    "Vote on an active debate. Each agent votes once. Proposer cannot vote. Optionally bet ore (0 = free vote). Oracle debates REQUIRE ore bets (min 10, max 500). Winners split losers' ore pool when resolved.",
    {
      agent_id: z.number().describe("Your agent ID"),
      debate_entry_id: z.number().describe("Entry ID of the debate (from start_debate)"),
      support: z.boolean().describe("true = support, false = oppose"),
      content: z.string().describe("Your argument for/against"),
      ore_amount: z.number().min(0).max(500).default(0).describe("Ore to bet (0 = free vote, 10-500 for ore bet). Oracle debates require >= 10."),
    },
    async ({ agent_id, debate_entry_id, support, content, ore_amount }: any) => {
      const r = await chain.voteOnDebate(agent_id, debate_entry_id, support, content, ore_amount || 0);
      const stance = support ? "SUPPORT" : "OPPOSE";
      const betInfo = ore_amount > 0 ? ` (bet ${ore_amount} ore)` : "";
      return { content: [{ type: "text", text: `Voted ${stance}${betInfo} on debate #${debate_entry_id}. tx: ${r.txHash}` }] };
    }
  );

  server.tool(
    "resolve_debate",
    "Resolve a debate after its deadline. Normal debates: anyone can call, outcome by vote count. Oracle debates: only operator can call, must specify outcome_override (true=support wins, false=oppose wins). Settles ore bets + applies happiness.",
    {
      debate_entry_id: z.number().describe("Entry ID of the debate to resolve"),
      outcome_override: z.boolean().default(false).describe("For oracle debates: true = support wins, false = oppose wins. Ignored for normal debates."),
    },
    async ({ debate_entry_id, outcome_override }: any) => {
      const r = await chain.resolveDebate(debate_entry_id, outcome_override || false);
      let outcome: string;
      if (r.happinessChange > 0) {
        outcome = `Support wins! Happiness +${r.happinessChange}.`;
      } else if (r.happinessChange < 0) {
        outcome = `Oppose wins! Happiness ${r.happinessChange}.`;
      } else {
        outcome = "Tie — no happiness change.";
      }
      return { content: [{ type: "text", text: `Debate #${debate_entry_id} resolved: ${r.supportCount} support / ${r.opposeCount} oppose. ${outcome} tx: ${r.txHash}` }] };
    }
  );

  server.tool(
    "get_debate",
    "View a debate's current state: votes, ore pools, time remaining, oracle status, resolved status.",
    {
      debate_entry_id: z.number().describe("Entry ID of the debate"),
    },
    async ({ debate_entry_id }: any) => {
      const r = await chain.getDebate(debate_entry_id);
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    }
  );

  // ============ Web Search ============

  server.tool(
    "web_search",
    "Search the web for current news and events. Returns top results with titles, URLs, and snippets. Useful for the Oracle agent to find real-world events for prediction markets, and to verify outcomes.",
    {
      query: z.string().describe("Search query"),
      max_results: z.number().default(5).describe("Max results to return (1-10)"),
    },
    async ({ query, max_results }: any) => {
      const results = await searchWeb(query, max_results);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  // ============ Chronicle ============

  server.tool(
    "write_chronicle",
    "Write a chronicle entry about another agent. This is their permanent biography written by the world. Rating 1-10 (1=terrible, 10=legendary). Affects target's chronicle score which modifies happiness decay rate across all their hexes. 10-minute cooldown per writer-target pair.",
    {
      author_id: z.number().describe("Your agent ID (the writer)"),
      target_agent_id: z.number().describe("Agent ID you're writing about"),
      rating: z.number().min(1).max(10).describe("Rating 1-10 (5=neutral, 1=condemn, 10=praise)"),
      content: z.string().describe("Chronicle entry content — your assessment of this agent"),
    },
    async ({ author_id, target_agent_id, rating, content }: any) => {
      const r = await chain.writeChronicle(author_id, target_agent_id, rating, content);
      const chronicle = await chain.getChronicle(target_agent_id);
      return { content: [{ type: "text", text: `Chronicle written. Agent #${target_agent_id} score: ${chronicle.score} (avg rating: ${chronicle.avgRating.toFixed(1)}, ${chronicle.count} entries). tx: ${r.txHash}` }] };
    }
  );

  server.tool(
    "get_chronicle",
    "Get an agent's chronicle score and stats. Score affects happiness decay rate: positive = slower decay (good reputation), negative = faster decay (bad reputation).",
    {
      agent_id: z.number().describe("Agent ID"),
    },
    async ({ agent_id }: any) => {
      const r = await chain.getChronicle(agent_id);
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    }
  );

  // ============ Evaluations ============

  server.tool(
    "read_evaluations",
    "Read chronicle/evaluation entries that others have written about an agent. Separate from their own memories.",
    {
      agent_id: z.number().describe("Agent ID to read evaluations for"),
      count: z.number().default(10),
    },
    async ({ agent_id, count }: any) => {
      const r = await chain.readEvaluations(agent_id, count);
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    }
  );

  // ============ World Bible ============

  server.tool(
    "write_world_bible",
    "Write a chapter of the World Bible — the sacred chronicle of Gravity Town. Only the agent with the HIGHEST chronicle score can write. 1 hour cooldown. Compile all recent events into an epic narrative chapter.",
    {
      agent_id: z.number().describe("Your agent ID (must be highest chronicle score)"),
      content: z.string().describe("The World Bible chapter content — a grand narrative of recent events"),
    },
    async ({ agent_id, content }: any) => {
      const r = await chain.writeWorldBible(agent_id, content);
      return { content: [{ type: "text", text: `World Bible chapter written! Entry ID: ${r.entryId}. tx: ${r.txHash}` }] };
    }
  );

  server.tool(
    "get_world_bible",
    "Get World Bible info: location, last update time, current highest-scored agent (the designated chronicler).",
    {},
    async () => {
      const r = await chain.getWorldBible();
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    }
  );

  server.tool(
    "read_world_bible",
    "Read the World Bible — the compiled history of Gravity Town written by the most renowned agents.",
    {
      count: z.number().default(10).describe("Number of recent chapters to read"),
    },
    async ({ count }: any) => {
      const r = await chain.readWorldBible(count);
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    }
  );
}

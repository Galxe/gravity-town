#!/usr/bin/env node
/**
 * E2E test for Arena MCP tools.
 *
 * Prerequisites:
 *   1. Anvil running:  anvil --host 127.0.0.1 --port 8545
 *   2. Contracts deployed:  just anvil-deploy
 *   3. Two agents created + ore harvested (the script does NOT create agents)
 *   4. MCP HTTP server running:
 *        PRIVATE_KEY=0xac0974... RPC_URL=http://127.0.0.1:8545 \
 *        ROUTER_ADDRESS=<from deployed-addresses.json> \
 *        OWNER_KEYS=0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 \
 *        MCP_HOST=127.0.0.1 MCP_PORT=3005 MCP_PATH=/mcp \
 *        npx tsx src/http.ts
 *
 * Usage:
 *   cd mcp-server && node scripts/e2e-arena-tools.mjs [MCP_URL]
 *   MCP_URL defaults to http://127.0.0.1:3005/mcp
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.argv[2] || "http://127.0.0.1:3005/mcp";

const client = new Client({ name: "e2e-arena", version: "1.0" });
const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
await client.connect(transport);
const tools = await client.listTools();
const arenaTools = tools.tools.filter(t => t.name.startsWith("arena_"));
console.log(`Arena tools registered: ${arenaTools.length}`);

let pass = 0, fail = 0;
async function call(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.filter(c => c.type === "text").map(c => c.text).join("");
  return { text, isError: r.isError };
}
function ok(label, cond) {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
}

console.log("\n=== Phase 1: arena verbs ===");

let r = await call("arena_buy", { agent_id: 1, unit_type: 2, slot: 0 });
ok("arena_buy Stoneguard→slot0", r.text.includes("Bought") && !r.isError);

r = await call("arena_buy", { agent_id: 1, unit_type: 4, slot: 1 });
ok("arena_buy Pyromancer→slot1", r.text.includes("Bought") && !r.isError);

r = await call("arena_move", { agent_id: 1, from_slot: 0, to_slot: 1 });
ok("arena_move 0↔1", r.text.includes("Swapped") && !r.isError);

r = await call("arena_freeze", { agent_id: 1, shop_slot: 2 });
ok("arena_freeze shop2", r.text.includes("FROZEN") && !r.isError);

r = await call("arena_roll", { agent_id: 1 });
ok("arena_roll", r.text.includes("rolled") && !r.isError);

r = await call("arena_sell", { agent_id: 1, slot: 0 });
ok("arena_sell slot0", r.text.includes("Sold") && !r.isError);

r = await call("arena_get_state", { agent_id: 1 });
ok("arena_get_state", !r.isError && r.text.includes("elo"));

r = await call("arena_submit", { agent_id: 1 });
ok("arena_submit agent1", r.text.includes("submitted") && !r.isError);

await call("arena_buy", { agent_id: 2, unit_type: 1, slot: 0 });
await call("arena_buy", { agent_id: 2, unit_type: 3, slot: 1 });
r = await call("arena_submit", { agent_id: 2 });
ok("arena_submit agent2", r.text.includes("submitted") && !r.isError);

console.log("\n=== Phase 1: keeper tools ===");

r = await call("arena_run_matchmaking", { bucket_id: 5 });
ok("arena_run_matchmaking", r.text.includes("match") && !r.isError);

let matchId = 0;
const m = r.text.match(/matchIds: \[(\d+)/);
if (m) matchId = parseInt(m[1]);

if (matchId > 0) {
  r = await call("arena_force_settle", { match_id: matchId });
  ok("arena_force_settle", r.text.includes("settled") && !r.isError);
} else {
  ok("arena_force_settle (skipped, no match)", true);
}

r = await call("arena_get_recent_matches", { agent_id: 1, count: 5 });
ok("arena_get_recent_matches", !r.isError);

console.log("\n=== Phase 2: graceful errors (contracts not deployed) ===");

const phase2 = [
  ["arena_get_g_balance", { agent_id: 1 }],
  ["arena_fund_g", { agent_id: 1, amount: 100 }],
  ["arena_list_inventory", { agent_id: 1 }],
  ["arena_list_market", {}],
  ["arena_place_listing", { agent_id: 1, card_id: 1, ask_price_g: 10 }],
  ["arena_cancel_listing", { agent_id: 1, card_id: 1 }],
  ["arena_buy_listing", { buyer_agent_id: 2, card_id: 1, max_price_g: 10 }],
  ["arena_place_card", { agent_id: 1, card_id: 1, slot: 0 }],
  ["arena_remove_card", { agent_id: 1, slot: 0 }],
  ["arena_get_tier_info", { agent_id: 1 }],
  ["arena_withdraw_submission", { agent_id: 1 }],
];

for (const [name, args] of phase2) {
  r = await call(name, args);
  ok(`${name} → graceful error`, r.isError && (r.text.includes("not deployed") || r.text.includes("waiting on")));
}

r = await call("arena_view_deck", { agent_id: 1 });
ok("arena_view_deck (works with existing getGhost)", !r.isError && r.text.includes("elo"));

await transport.close();
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);

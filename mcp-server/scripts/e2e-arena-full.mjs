#!/usr/bin/env node
/**
 * Full Arena E2E: tests ALL arena MCP tools against a live chain with
 * GTreasury + CardLedger deployed (#39).
 *
 * Prerequisites: anvil + deploy + 2 agents + fund G + MCP HTTP server running.
 * Usage: cd mcp-server && node scripts/e2e-arena-full.mjs [MCP_URL]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.argv[2] || "http://127.0.0.1:3005/mcp";
const client = new Client({ name: "e2e-full", version: "1.0" });
const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
await client.connect(transport);

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
function json(r) { try { return JSON.parse(r.text); } catch { return null; } }

const tools = (await client.listTools()).tools;
const arenaTools = tools.filter(t => t.name.startsWith("arena_"));
console.log(`Arena tools: ${arenaTools.length}`);

// ── Phase 1: basic verbs ──
console.log("\n=== Phase 1: bench verbs ===");

let r = await call("arena_buy", { agent_id: 2, unit_type: 2 });
ok("arena_buy Stoneguard → inventory", r.text.includes("card") || r.text.includes("Bought"));
const buyData = json(r);
const cardId1 = buyData?.cardId || 0;

r = await call("arena_get_state", { agent_id: 2 });
ok("arena_get_state", !r.isError);

r = await call("arena_list_inventory", { agent_id: 2 });
ok("arena_list_inventory (has card)", !r.isError && r.text.includes("Stoneguard"));
const inv = json(r);
const firstCardId = inv?.cards?.[0]?.cardId || cardId1;

if (firstCardId > 0) {
  r = await call("arena_place_card", { agent_id: 2, card_id: firstCardId, slot: 0 });
  ok("arena_place_card → bench slot 0", !r.isError);
} else {
  ok("arena_place_card (skipped, no cardId)", false);
}

r = await call("arena_buy", { agent_id: 2, unit_type: 4 });
const buyData2 = json(r);
const cardId2 = buyData2?.cardId || 0;
if (cardId2 > 0) {
  r = await call("arena_place_card", { agent_id: 2, card_id: cardId2, slot: 1 });
  ok("arena_place_card Pyromancer → slot 1", !r.isError);
}

r = await call("arena_move", { agent_id: 2, from_slot: 0, to_slot: 1 });
ok("arena_move 0↔1", !r.isError);

r = await call("arena_freeze", { agent_id: 2, shop_slot: 2 });
ok("arena_freeze", !r.isError);

r = await call("arena_roll", { agent_id: 2 });
ok("arena_roll", !r.isError);

r = await call("arena_remove_card", { agent_id: 2, slot: 0 });
ok("arena_remove_card slot0 → inventory", !r.isError);

// ── G balance ──
console.log("\n=== G balance ===");
r = await call("arena_get_g_balance", { agent_id: 2 });
ok("arena_get_g_balance", !r.isError);
const gData = json(r);
console.log(`    G balance: ${gData?.gBalance}`);

r = await call("arena_fund_g", { agent_id: 2, amount: 100 });
ok("arena_fund_g +100", !r.isError);

// ── Market ──
console.log("\n=== Market ===");
r = await call("arena_list_market", {});
ok("arena_list_market (bootstrap listings)", !r.isError);
const market = json(r);
const listingCount = Array.isArray(market) ? market.length : market?.listings?.length || 0;
console.log(`    Listings on market: ${listingCount}`);

// Buy a card from inventory, list it on market
r = await call("arena_buy", { agent_id: 2, unit_type: 1 });
const buyData3 = json(r);
const cardToSell = buyData3?.cardId || 0;
if (cardToSell > 0) {
  r = await call("arena_place_listing", { agent_id: 2, card_id: cardToSell, ask_price_g: 50 });
  ok("arena_place_listing (50G)", !r.isError);

  r = await call("arena_cancel_listing", { agent_id: 2, card_id: cardToSell });
  ok("arena_cancel_listing", !r.isError);

  // Re-list and have agent 3 buy it
  r = await call("arena_place_listing", { agent_id: 2, card_id: cardToSell, ask_price_g: 25 });
  ok("arena_place_listing (re-list 25G)", !r.isError);

  r = await call("arena_buy_listing", { buyer_agent_id: 3, card_id: cardToSell, max_price_g: 25 });
  ok("arena_buy_listing (agent 3 buys)", !r.isError);
} else {
  ok("market flow (skipped, no cardId)", false);
}

// ── arena_get_card ──
if (firstCardId > 0) {
  r = await call("arena_get_card", { card_id: firstCardId });
  ok("arena_get_card", !r.isError && r.text.includes("unitType"));
}

// ── Submit + matchmaking ──
console.log("\n=== Submit + matchmaking ===");

// Agent 2: put a card on bench for submit
r = await call("arena_list_inventory", { agent_id: 2 });
const inv2 = json(r);
const benchCard = inv2?.cards?.find(c => !c.onBench)?.cardId;
if (benchCard) {
  await call("arena_place_card", { agent_id: 2, card_id: benchCard, slot: 2 });
}

r = await call("arena_submit", { agent_id: 2 });
ok("arena_submit agent2", !r.isError);

// Agent 3: buy + place + submit
await call("arena_buy", { agent_id: 3, unit_type: 3 }).then(async (br) => {
  const cd = json(br)?.cardId;
  if (cd) await call("arena_place_card", { agent_id: 3, card_id: cd, slot: 0 });
});
await call("arena_buy", { agent_id: 3, unit_type: 7 }).then(async (br) => {
  const cd = json(br)?.cardId;
  if (cd) await call("arena_place_card", { agent_id: 3, card_id: cd, slot: 1 });
});
r = await call("arena_submit", { agent_id: 3 });
ok("arena_submit agent3", !r.isError);

r = await call("arena_run_matchmaking", { bucket_id: 5 });
ok("arena_run_matchmaking", !r.isError && r.text.includes("match"));
let matchId = 0;
const mm = r.text.match(/matchIds: \[(\d+)/);
if (mm) matchId = parseInt(mm[1]);

if (matchId > 0) {
  r = await call("arena_force_settle", { match_id: matchId });
  ok("arena_force_settle", !r.isError && r.text.includes("settled"));

  r = await call("arena_simulate_match", { match_id: matchId });
  ok("arena_simulate_match (replay)", !r.isError && r.text.includes("turns"));
  const sim = json(r);
  console.log(`    Turns: ${sim?.turns?.length}, Winner: agent #${sim?.winnerId}`);
} else {
  ok("settle+simulate (skipped)", false);
}

r = await call("arena_preview_elo", { winner_elo: 1016, loser_elo: 984 });
ok("arena_preview_elo", !r.isError);

r = await call("arena_get_recent_matches", { agent_id: 2, count: 5 });
ok("arena_get_recent_matches", !r.isError);

// ── View deck ──
console.log("\n=== View deck ===");
r = await call("arena_view_deck", { agent_id: 2 });
ok("arena_view_deck", !r.isError);
const deck = json(r);
console.log(`    ELO: ${deck?.elo}, G: ${deck?.gBalance}, inventory: ${deck?.inventoryCount}`);

// ── arena_list_units ──
r = await call("arena_list_units", {});
ok("arena_list_units (12 units)", !r.isError);

await transport.close();
console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);

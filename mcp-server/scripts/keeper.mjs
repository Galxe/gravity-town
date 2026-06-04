#!/usr/bin/env node
/**
 * Arena keeper — the off-chain heartbeat that drives matchmaking + settlement.
 *
 * The contract's runMatchmaking(tier) / settleMatch(id) are permissionless but
 * the EVM can't self-trigger, so SOMETHING off-chain must tick them. That's this
 * script: every TICK it pairs each tier whose cooldown has elapsed, then settles
 * any unsettled matches. Talks straight to the chain via ethers (no MCP server
 * dependency) so it can run as a standalone systemd/cron/pm2 service in prod.
 *
 * RPC + router are read from frontend/config/<NETWORK>.json (same files the
 * frontend uses), so the keeper never drifts from the deployed addresses and
 * you don't pass them by hand. Env vars override the file when you need to.
 *
 * Config (env):
 *   NETWORK          frontend/config/<NETWORK>.json   (default "localhost")
 *   KEEPER_KEY       keeper private key       (required)
 *   RPC_URL          override config rpc_url  (optional)
 *   ROUTER_ADDRESS   override config router   (optional; else deployed-addresses.json)
 *   ARENA_ADDRESS    ArenaEngine override     (optional; else resolved via Router)
 *   TICK_SECONDS     loop cadence in seconds  (default 15)
 *   TIERS            comma list of tier ids   (default 0,1,2  = Bronze,Silver,Gold)
 *   ONCE             "1" → run a single tick then exit (for cron)
 *
 * Run (local anvil):
 *   cd mcp-server
 *   KEEPER_KEY=0xac09…ff80 node scripts/keeper.mjs        # NETWORK defaults to localhost
 *
 * Run (testnet):  reads frontend/config/gravity.json (rpc_url + router_address)
 *   NETWORK=gravity KEEPER_KEY=0x<keeper> node scripts/keeper.mjs
 *
 * The keeper key just needs gas; runMatchmaking/settleMatch are permissionless.
 */
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const NETWORK = process.env.NETWORK || "localhost";

// Read a JSON file relative to this script; return {} if absent/unreadable.
function readJson(relPath) {
  try { return JSON.parse(readFileSync(resolve(HERE, relPath), "utf8")); } catch { return {}; }
}

// frontend/config/<NETWORK>.json — the same config the frontend consumes.
const CONFIG = readJson(`../../frontend/config/${NETWORK}.json`);

const RPC_URL = process.env.RPC_URL || CONFIG.rpc_url || "http://127.0.0.1:8545";
const KEEPER_KEY = process.env.KEEPER_KEY;
const TICK_MS = (Number(process.env.TICK_SECONDS) || 15) * 1000;
const TIERS = (process.env.TIERS || "0,1,2").split(",").map((s) => Number(s.trim()));
const TIER_NAME = { 0: "Bronze", 1: "Silver", 2: "Gold" };
const ONCE = process.env.ONCE === "1";

if (!KEEPER_KEY) {
  console.error("FATAL: set KEEPER_KEY (the keeper's private key)");
  process.exit(1);
}

const ROUTER_ABI = [
  "function getAddressesV3() view returns (address,address,address,address,address,address,address,address,address)",
  "function getAddressesV2() view returns (address,address,address,address,address,address,address)",
  "function arenaEngine() view returns (address)",
];
const ARENA_ABI = [
  "function runMatchmaking(uint8 tier) returns (uint256)",
  "function settleMatch(uint256 matchId)",
  "function nextMatchId() view returns (uint256)",
  "function getMatch(uint256) view returns (uint256 attackerId, uint256 defenderId, uint8[5] ab, uint8[5] db, uint64 seed, uint64 createdAt, bool settled, uint256 winnerId)",
  "function tierPopulation(uint8 tier) view returns (uint256)",
  "function effectiveTierPeriod(uint8 tier) view returns (uint64)",
  "function lastTierMatchmakingAt(uint8 tier) view returns (uint64)",
];

const ZERO = "0x0000000000000000000000000000000000000000";

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

// Lowest match id that might still be unsettled. Matches settle in creation
// order under this keeper and never un-settle, so we advance this watermark
// past the leading run of settled matches and never re-read them. In-memory
// only: a restart costs one full rescan, which is harmless (settle is idempotent).
let settleCursor = 1;

async function resolveArena(provider) {
  if (process.env.ARENA_ADDRESS) return process.env.ARENA_ADDRESS;
  // Router precedence: env override > config file (frontend/config/<NETWORK>.json)
  // > local deployed-addresses.json. localhost.json carries no router_address,
  // so local naturally falls through to deployed-addresses.json.
  let routerAddr = process.env.ROUTER_ADDRESS || CONFIG.router_address;
  if (!routerAddr) {
    const j = readJson("../../deployed-addresses.json");
    const fromFile = j.arenaEngine || j.arenaEngineAddress;
    if (fromFile && fromFile !== ZERO) return fromFile;
    routerAddr = j.routerAddress || j.router;
  }
  if (!routerAddr) throw new Error(`no router for NETWORK=${NETWORK} — set ROUTER_ADDRESS or populate frontend/config/${NETWORK}.json`);
  const router = new ethers.Contract(routerAddr, ROUTER_ABI, provider);
  try { return (await router.getAddressesV3())[6]; } catch {}
  try { return (await router.getAddressesV2())[6]; } catch {}
  return await router.arenaEngine();
}

async function tick(arena) {
  const now = Math.floor(Date.now() / 1000);

  // 1) Matchmaking — only when a tier has ≥2 queued AND its cooldown has elapsed,
  //    so we never burn a tx on an empty pool or eat a "rate limited" revert.
  for (const tier of TIERS) {
    try {
      const pop = (await arena.tierPopulation(tier)).toNumber();
      if (pop < 2) continue;
      const last = (await arena.lastTierMatchmakingAt(tier)).toNumber();
      const period = (await arena.effectiveTierPeriod(tier)).toNumber();
      if (last !== 0 && now < last + period) continue; // still cooling down
      const tx = await arena.runMatchmaking(tier);
      await tx.wait();
      log(`matchmade ${TIER_NAME[tier] ?? tier} (pool was ${pop})  tx ${tx.hash.slice(0, 10)}`);
    } catch (e) {
      const msg = (e?.reason || e?.message || "").slice(0, 80);
      if (!/rate limited/i.test(msg)) log(`matchmaking ${TIER_NAME[tier] ?? tier} skipped: ${msg}`);
    }
  }

  // 2) Settlement — settle every created-but-unsettled match (deterministic).
  //    Scan only from the watermark forward; advance it past the leading run
  //    of settled matches so steady-state reads stay O(new matches), not O(all).
  let next;
  try { next = (await arena.nextMatchId()).toNumber(); } catch { return; }
  let advance = true;
  for (let id = settleCursor; id < next; id++) {
    try {
      const m = await arena.getMatch(id);
      if (m.settled) {
        if (advance) settleCursor = id + 1; // still contiguous from the front
        continue;
      }
      advance = false; // a gap — can't move the watermark past here yet
      const tx = await arena.settleMatch(id);
      await tx.wait();
      log(`settled match #${id} (agents ${m.attackerId} vs ${m.defenderId})  tx ${tx.hash.slice(0, 10)}`);
    } catch (e) {
      advance = false;
      const msg = (e?.reason || e?.message || "").slice(0, 80);
      if (!/already settled|no match/i.test(msg)) log(`settle #${id} skipped: ${msg}`);
    }
  }
}

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(KEEPER_KEY, provider);
  const arenaAddr = await resolveArena(provider);
  const arena = new ethers.Contract(arenaAddr, ARENA_ABI, wallet);

  const net = await provider.getNetwork();
  log(`keeper up · network ${NETWORK} · chain ${net.chainId} · arena ${arenaAddr} · keeper ${wallet.address}`);
  log(`tiers [${TIERS.map((t) => TIER_NAME[t] ?? t).join(", ")}] · tick ${TICK_MS / 1000}s${ONCE ? " · ONCE" : ""}`);

  if (ONCE) { await tick(arena); return; }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await tick(arena); } catch (e) { log("tick error:", e?.message?.slice(0, 120)); }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

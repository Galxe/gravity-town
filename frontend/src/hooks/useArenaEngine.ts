import { useEffect, useRef } from 'react';
import { JsonRpcProvider, Contract, EventLog } from 'ethers';
import { useGameStore } from '../store/useGameStore';
import { useArenaStore, ArenaGhost, ArenaMatch, ArenaSimulation } from '../store/useArenaStore';
import { getActiveNetwork } from '../lib/networks';

const FALLBACK_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL        || 'http://127.0.0.1:8545';
const FALLBACK_ROUTER  = process.env.NEXT_PUBLIC_ROUTER_ADDRESS || '0x0000000000000000000000000000000000000000';
const FALLBACK_CHAIN   = process.env.NEXT_PUBLIC_CHAIN_ID ? Number(process.env.NEXT_PUBLIC_CHAIN_ID) : undefined;

// Router v2 (7-tuple) — preferred. Falls back to legacy 6-tuple if Router not upgraded.
const ROUTER_ABI = [
  'function getAddressesV2() view returns (address,address,address,address,address,address,address)',
  'function getAddresses() view returns (address,address,address,address,address,address)',
  'function arenaEngine() view returns (address)',
];

const REGISTRY_ABI = [
  'function getAgent(uint256) view returns (string, string, uint8[4], uint256, uint256)',
  'function getAllAgentIds() view returns (uint256[])',
];

const ARENA_ABI = [
  'function getGhost(uint256) view returns (uint8[5] bench, uint16 elo, uint16 bucketId, uint64 lastUpdate, bool exists)',
  'function getMatch(uint256) view returns (uint256 attackerId, uint256 defenderId, uint8[5] attackerBench, uint8[5] defenderBench, uint64 seed, uint64 createdAt, bool settled, uint256 winnerId)',
  'function simulateMatch(uint256) view returns (tuple(uint8 attackerSide, uint8 attackerSlot, uint8 defenderSlot, uint16 damage, bool defenderDied)[] turns, uint256 winnerAgentId)',
  'function nextMatchId() view returns (uint256)',
  'function lastMatchmakingAt(uint16) view returns (uint64)',
  'function MATCHMAKING_PERIOD() view returns (uint32)',
  'function bucketOf(uint256) view returns (uint16)',
  // Events — used to drive ongoing list + highlight ticker.
  'event MatchCreated(uint256 indexed matchId, uint256 indexed attackerId, uint256 indexed defenderId, uint64 seed)',
  'event MatchSettled(uint256 indexed matchId, uint256 indexed winnerId, uint16 newWinnerElo, uint16 newLoserElo)',
  'event MatchmakingRan(uint16 indexed bucketId, uint256 matchesCreated)',
];

const POLL_MS = 4000;

// Lookback for events on first load. We pull bounded history so cold-start
// shows a populated leaderboard / ticker even if no fresh match has arrived.
const EVENT_LOOKBACK_BLOCKS = 5000;

/** Drive the Arena store from chain + event logs. */
export function useArenaEngine() {
  const setGhosts        = useArenaStore((s) => s.setGhosts);
  const upsertMatch      = useArenaStore((s) => s.upsertMatch);
  const upsertSimulation = useArenaStore((s) => s.upsertSimulation);
  const setLastMatchmaking = useArenaStore((s) => s.setLastMatchmaking);
  const setStaticConfig  = useArenaStore((s) => s.setStaticConfig);
  const setSelectedMatchId = useArenaStore((s) => s.setSelectedMatchId);
  const setSelectedAgentId = useArenaStore((s) => s.setSelectedAgentId);
  const pushHighlight    = useArenaStore((s) => s.pushHighlight);

  const isFetching = useRef(false);
  const seenMatchSettled = useRef<Set<number>>(new Set());
  // Track recent W/L per agent — newest first, capped at 5. Mirrors the
  // 5-flame UI on the leaderboard. Settle-time order is good enough; we
  // don't try to ladder them by createdAt because Settled events arrive in
  // settlement order, which is what the eye expects ("last result first").
  const recentResultsRef = useRef<Record<number, ('W' | 'L')[]>>({});

  useEffect(() => {
    // If the build was made with APP_CONFIG=localhost (FALLBACK_RPC points at
    // 127.0.0.1) and the user hasn't explicitly picked a network, prefer the
    // local fallback over the first-baked network (which is mainnet) — the
    // /arena route is meant to work against the same chain the hex world page
    // was started against.
    const onLocalhostBuild = /^https?:\/\/(127\.0\.0\.1|localhost|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(FALLBACK_RPC_URL);
    const userPicked = typeof window !== 'undefined' && !!window.localStorage?.getItem('gt:network');
    const active = (onLocalhostBuild && !userPicked) ? undefined : getActiveNetwork();
    const RPC_URL     = active?.rpc_url        ?? FALLBACK_RPC_URL;
    const ROUTER_ADDR = active?.router_address ?? FALLBACK_ROUTER;
    const CHAIN_ID    = active?.chain_id       ?? FALLBACK_CHAIN;

    const provider = CHAIN_ID
      ? new JsonRpcProvider(RPC_URL, CHAIN_ID)
      : new JsonRpcProvider(RPC_URL);

    let registry: Contract;
    let arena: Contract;
    let arenaAddr: string = '';
    let resolved = false;
    let initialEventsPulled = false;

    const resolveContracts = async () => {
      if (resolved) return;
      const router = new Contract(ROUTER_ADDR, ROUTER_ABI, provider);
      let registryAddr = '';
      try {
        const tuple = await router.getAddressesV2();
        registryAddr = tuple[0];
        arenaAddr = tuple[6];
      } catch {
        // Old router without V2 — fall back to the 6-tuple call.
        const tuple6 = await router.getAddresses();
        registryAddr = tuple6[0];
        // legacy router — try arenaEngine() getter as fallback
        try { arenaAddr = await router.arenaEngine(); } catch { arenaAddr = ''; }
      }
      registry = new Contract(registryAddr, REGISTRY_ABI, provider);
      if (arenaAddr && arenaAddr !== '0x0000000000000000000000000000000000000000') {
        arena = new Contract(arenaAddr, ARENA_ABI, provider);
        setStaticConfig(arenaAddr);
      } else {
        setStaticConfig(null);
      }
      resolved = true;
    };

    const pullInitialEvents = async () => {
      if (initialEventsPulled || !arena) return;
      initialEventsPulled = true;

      const latest = await provider.getBlockNumber();
      const from = Math.max(0, latest - EVENT_LOOKBACK_BLOCKS);

      // MatchCreated
      try {
        const createdFilter = arena.filters.MatchCreated();
        const events = await arena.queryFilter(createdFilter, from, latest);
        for (const ev of events) {
          if (!(ev instanceof EventLog)) continue;
          const args = ev.args!;
          const matchId = Number(args[0]);
          const attackerId = Number(args[1]);
          const defenderId = Number(args[2]);
          const seed = (args[3] as bigint).toString();
          const m: ArenaMatch = {
            matchId, attackerId, defenderId,
            attackerBench: [0, 0, 0, 0, 0],
            defenderBench: [0, 0, 0, 0, 0],
            seed,
            createdAt: 0,
            settled: false,
            winnerId: 0,
          };
          upsertMatch(m);
        }
      } catch (e) { console.warn('[arena] MatchCreated history fetch failed', e); }

      // MatchSettled — drives highlight detection
      try {
        const settledFilter = arena.filters.MatchSettled();
        const events = await arena.queryFilter(settledFilter, from, latest);
        for (const ev of events) {
          if (!(ev instanceof EventLog)) continue;
          const args = ev.args!;
          const matchId = Number(args[0]);
          const winnerId = Number(args[1]);
          const newWinElo = Number(args[2]);
          const newLoseElo = Number(args[3]);
          upsertMatch({
            matchId,
            attackerId: 0, defenderId: 0,
            attackerBench: [0, 0, 0, 0, 0],
            defenderBench: [0, 0, 0, 0, 0],
            seed: '0',
            createdAt: 0,
            settled: true,
            winnerId,
            winnerEloAfter: newWinElo,
            loserEloAfter: newLoseElo,
          });
          seenMatchSettled.current.add(matchId);
        }
      } catch (e) { console.warn('[arena] MatchSettled history fetch failed', e); }
    };

    const pullData = async () => {
      if (isFetching.current) return;
      isFetching.current = true;
      try {
        await resolveContracts();
        if (!arena) return;

        await pullInitialEvents();

        // Pull all agents and their ghost state
        const agentIds: bigint[] = await registry.getAllAgentIds();
        const names: Record<number, string> = {};

        await Promise.all(agentIds.map(async (aId) => {
          const id = Number(aId);
          const [name] = await registry.getAgent(id);
          names[id] = name;
        }));

        const ghosts: Record<number, ArenaGhost> = {};
        await Promise.all(agentIds.map(async (aId) => {
          const id = Number(aId);
          try {
            const [bench, elo, bucketId, lastUpdate, exists] = await arena.getGhost(id);
            ghosts[id] = {
              agentId: id,
              agentName: names[id] ?? `Agent #${id}`,
              bench: Array.from(bench).map(Number),
              elo: Number(elo),
              bucketId: Number(bucketId),
              lastUpdate: Number(lastUpdate),
              exists: Boolean(exists),
              recentResults: recentResultsRef.current[id] ?? [],
            };
          } catch { /* ignore */ }
        }));
        setGhosts(ghosts);

        // Pull `nextMatchId` and walk back, hydrating recent matches & settling info.
        const next: bigint = await arena.nextMatchId();
        const nextId = Number(next);
        const earliest = Math.max(1, nextId - 20); // last ~20 matches
        for (let mid = earliest; mid < nextId; mid++) {
          try {
            const r = await arena.getMatch(mid);
            const m: ArenaMatch = {
              matchId: mid,
              attackerId: Number(r[0]),
              defenderId: Number(r[1]),
              attackerBench: Array.from(r[2]).map(Number),
              defenderBench: Array.from(r[3]).map(Number),
              seed: (r[4] as bigint).toString(),
              createdAt: Number(r[5]),
              settled: Boolean(r[6]),
              winnerId: Number(r[7]),
            };
            upsertMatch(m);

            // Hydrate the simulation cache lazily — only for the most recent
            // matches to keep RPC pressure low.
            if (mid >= nextId - 6 && !useArenaStore.getState().simulations[mid]) {
              try {
                const sim = await arena.simulateMatch(mid);
                const turns = Array.from(sim[0]).map((t: readonly unknown[]) => ({
                  attackerSide: Number(t[0]) as 0 | 1,
                  attackerSlot: Number(t[1]),
                  defenderSlot: Number(t[2]),
                  damage: Number(t[3]),
                  defenderDied: Boolean(t[4]),
                }));
                const simObj: ArenaSimulation = {
                  matchId: mid,
                  turns,
                  winnerId: Number(sim[1]),
                };
                upsertSimulation(simObj);
              } catch (e) {
                console.warn('[arena] simulateMatch failed for', mid, e);
              }
            }
          } catch { /* ignore */ }
        }

        // Default-select the most recent settled match if none picked yet.
        const state = useArenaStore.getState();
        if (!state.selectedMatchId) {
          const allMatches = Object.values(state.matches);
          const recent = allMatches
            .filter((m) => m.attackerId > 0)
            .sort((a, b) => b.matchId - a.matchId)[0];
          if (recent) {
            setSelectedMatchId(recent.matchId);
            setSelectedAgentId(recent.attackerId);
          }
        }

        // Pull bucket matchmaking timestamps for the buckets we know about.
        const buckets = new Set<number>();
        for (const g of Object.values(ghosts)) buckets.add(g.bucketId);
        await Promise.all(Array.from(buckets).map(async (b) => {
          try {
            const ts = await arena.lastMatchmakingAt(b);
            setLastMatchmaking(b, Number(ts));
          } catch { /* ignore */ }
        }));
      } catch (err) {
        console.error('[arena] poll error:', err);
      } finally {
        isFetching.current = false;
      }
    };

    pullData();
    const interval = setInterval(pullData, POLL_MS);

    // Live event subscriptions — best-effort. JsonRpcProvider polls under the hood.
    let createdHandler: ((...a: unknown[]) => void) | null = null;
    let settledHandler: ((...a: unknown[]) => void) | null = null;
    const wireSubscriptions = async () => {
      await resolveContracts();
      if (!arena) return;
      createdHandler = (matchId, attackerId, defenderId, seed) => {
        const mid = Number(matchId);
        const m: ArenaMatch = {
          matchId: mid,
          attackerId: Number(attackerId),
          defenderId: Number(defenderId),
          attackerBench: [0, 0, 0, 0, 0],
          defenderBench: [0, 0, 0, 0, 0],
          seed: (seed as bigint).toString(),
          createdAt: Math.floor(Date.now() / 1000),
          settled: false,
          winnerId: 0,
        };
        upsertMatch(m);
        pushHighlight({
          id: `created-${mid}`,
          kind: 'matchmaking',
          text: `Match #${mid} — ${nameFromStore(Number(attackerId))} vs ${nameFromStore(Number(defenderId))}`,
          timestamp: Date.now(),
          matchId: mid,
        });
      };
      settledHandler = (matchId, winnerId, newWinElo, newLoseElo) => {
        const mid = Number(matchId);
        if (seenMatchSettled.current.has(mid)) return;
        seenMatchSettled.current.add(mid);
        const wid = Number(winnerId);
        const wElo = Number(newWinElo);
        const lElo = Number(newLoseElo);

        const prev = useArenaStore.getState().matches[mid];
        const loserId = prev ? (prev.attackerId === wid ? prev.defenderId : prev.attackerId) : 0;

        upsertMatch({
          matchId: mid,
          attackerId: prev?.attackerId ?? 0,
          defenderId: prev?.defenderId ?? 0,
          attackerBench: prev?.attackerBench ?? [0, 0, 0, 0, 0],
          defenderBench: prev?.defenderBench ?? [0, 0, 0, 0, 0],
          seed: prev?.seed ?? '0',
          createdAt: prev?.createdAt ?? 0,
          settled: true,
          winnerId: wid,
          winnerEloAfter: wElo,
          loserEloAfter: lElo,
        });

        // Track recent W/L per agent
        if (wid) {
          recentResultsRef.current[wid] = ['W', ...(recentResultsRef.current[wid] ?? [])].slice(0, 5);
        }
        if (loserId) {
          recentResultsRef.current[loserId] = ['L', ...(recentResultsRef.current[loserId] ?? [])].slice(0, 5);
        }

        // Highlight: upset = winner came in with much lower ELO than loser.
        // We approximate "ELO before" from "ELO after" deltas of standard +/-(16..)
        // since contract is symmetric K=32 — winner_before ≈ wElo - 16 (rough).
        const winnerEloBefore = wElo - 16;
        const loserEloBefore = lElo + 16;
        if (loserEloBefore - winnerEloBefore >= 100 && winnerEloBefore > 0) {
          pushHighlight({
            id: `upset-${mid}`,
            kind: 'upset',
            text: `UPSET — ${nameFromStore(wid)} (${winnerEloBefore}) toppled ${nameFromStore(loserId)} (${loserEloBefore})`,
            timestamp: Date.now(),
            matchId: mid,
          });
        }

        // Highlight: streak break = loser had ≥3 consecutive Ws right before this L.
        const prevResults = recentResultsRef.current[loserId] ?? [];
        // After this update prevResults already has the new 'L' prepended; check pos 1..3.
        if (loserId && prevResults.length >= 4) {
          const tail = prevResults.slice(1, 4); // the 3 results before this L
          if (tail.every((r) => r === 'W')) {
            pushHighlight({
              id: `streak-${mid}`,
              kind: 'streak_broken',
              text: `STREAK BROKEN — ${nameFromStore(loserId)}'s 3-game win streak ended`,
              timestamp: Date.now(),
              matchId: mid,
            });
          }
        }
      };
      arena.on('MatchCreated', createdHandler);
      arena.on('MatchSettled', settledHandler);
    };
    wireSubscriptions();

    return () => {
      clearInterval(interval);
      if (arena) {
        if (createdHandler) arena.off('MatchCreated', createdHandler);
        if (settledHandler) arena.off('MatchSettled', settledHandler);
      }
    };
  }, [
    setGhosts, upsertMatch, upsertSimulation, setLastMatchmaking,
    setStaticConfig, setSelectedMatchId, setSelectedAgentId, pushHighlight,
  ]);
}

/** Best-effort name lookup, mostly for highlights where bench/agent data races. */
function nameFromStore(id: number): string {
  if (!id) return 'someone';
  const fromArena = useArenaStore.getState().ghosts[id]?.agentName;
  if (fromArena) return fromArena;
  const fromGame = useGameStore.getState().agents[id]?.name;
  return fromGame ?? `Agent #${id}`;
}

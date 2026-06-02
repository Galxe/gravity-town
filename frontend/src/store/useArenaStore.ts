import { create } from 'zustand';

/** Ghost = a player's submitted bench + ELO rating. */
export interface ArenaGhost {
  agentId: number;
  agentName: string;
  bench: number[];       // length 5, 0 = empty
  elo: number;
  bucketId: number;
  lastUpdate: number;
  exists: boolean;
  recentResults: ('W' | 'L')[]; // most-recent-first, max 5
}

/** One match (settled or pending). */
export interface ArenaMatch {
  matchId: number;
  attackerId: number;
  defenderId: number;
  attackerBench: number[];
  defenderBench: number[];
  seed: string;          // bigint as string — used only for display
  createdAt: number;
  settled: boolean;
  winnerId: number;
  // ELO snapshots at the moment of MatchSettled — used by the upset detector.
  winnerEloAfter?: number;
  loserEloAfter?: number;
  // ELO at submit time, captured from MatchCreated for pre-match display.
  attackerEloAtCreate?: number;
  defenderEloAtCreate?: number;
}

/** One step in a deterministic combat replay. */
export interface ArenaTurn {
  attackerSide: 0 | 1;  // 0 = attacker (left), 1 = defender (right)
  attackerSlot: number;
  defenderSlot: number;
  damage: number;
  defenderDied: boolean;
}

/** Cached simulation result keyed by matchId. */
export interface ArenaSimulation {
  matchId: number;
  turns: ArenaTurn[];
  winnerId: number;
}

/** Highlight ticker entry. */
export interface ArenaHighlight {
  id: string;            // unique key
  kind: 'upset' | 'streak_broken' | 'matchmaking';
  text: string;
  timestamp: number;
  matchId?: number;
}

export interface ArenaState {
  // Static config / world
  arenaEngineAddress: string | null;
  matchmakingPeriod: number;            // seconds between bucket runs (constant in contract)
  lastMatchmakingByBucket: Record<number, number>;  // bucketId -> ts (seconds)

  // Live data
  ghosts: Record<number, ArenaGhost>;   // by agentId
  matches: Record<number, ArenaMatch>;  // by matchId
  simulations: Record<number, ArenaSimulation>;  // cached by matchId

  // UI state
  selectedMatchId: number | null;
  selectedAgentId: number | null;       // whose mind to show
  autoplay: boolean;
  turnIndex: number;                    // current turn cursor for the focus match
  highlights: ArenaHighlight[];         // most recent first, capped

  // Setters
  setStaticConfig: (addr: string | null) => void;
  setGhosts: (ghosts: Record<number, ArenaGhost>) => void;
  upsertMatch: (m: ArenaMatch) => void;
  upsertSimulation: (sim: ArenaSimulation) => void;
  setLastMatchmaking: (bucketId: number, ts: number) => void;
  setSelectedMatchId: (id: number | null) => void;
  setSelectedAgentId: (id: number | null) => void;
  setAutoplay: (v: boolean) => void;
  setTurnIndex: (n: number) => void;
  pushHighlight: (h: ArenaHighlight) => void;
}

const HIGHLIGHT_CAP = 12;

export const useArenaStore = create<ArenaState>((set) => ({
  arenaEngineAddress: null,
  matchmakingPeriod: 1800,
  lastMatchmakingByBucket: {},

  ghosts: {},
  matches: {},
  simulations: {},

  selectedMatchId: null,
  selectedAgentId: null,
  autoplay: true,
  turnIndex: 0,
  highlights: [],

  setStaticConfig: (addr) => set({ arenaEngineAddress: addr }),
  setGhosts: (ghosts) => set({ ghosts }),
  upsertMatch: (m) =>
    set((s) => ({ matches: { ...s.matches, [m.matchId]: { ...s.matches[m.matchId], ...m } } })),
  upsertSimulation: (sim) =>
    set((s) => ({ simulations: { ...s.simulations, [sim.matchId]: sim } })),
  setLastMatchmaking: (bucketId, ts) =>
    set((s) => ({ lastMatchmakingByBucket: { ...s.lastMatchmakingByBucket, [bucketId]: ts } })),
  setSelectedMatchId: (id) => set({ selectedMatchId: id, turnIndex: 0 }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setAutoplay: (v) => set({ autoplay: v }),
  setTurnIndex: (n) => set({ turnIndex: n }),
  pushHighlight: (h) =>
    set((s) => {
      // dedupe by id
      if (s.highlights.some((x) => x.id === h.id)) return {};
      const next = [h, ...s.highlights].slice(0, HIGHLIGHT_CAP);
      return { highlights: next };
    }),
}));

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
  // #33 — G economy / tier. Source of truth is the contract: `tier` mirrors
  // `_tierFor(agentId)` (0=Bronze, 1=Silver, 2=Gold) and the frontend never
  // re-derives the thresholds. Both undefined until gTreasury resolves.
  gBalance?: number;
  tier?: 0 | 1 | 2;
}

/** G-tier index → label, matching the on-chain `Tier` enum order (#33). */
export type ArenaTier = 0 | 1 | 2;

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

/** One card in an agent's inventory, plus the last on-chain tx that touched it. */
export interface ArenaCard {
  id: number;
  unitType: number;
  mintedAt: number;
  listed: boolean;
  lastTxHash?: string;   // "source" — tx of the most recent event touching this card
  lastTxKind?: string;   // mint | buy | place | remove | list | unlist | market-buy
}

/** Post-ON_START starting stats per slot (after buffs/overlays). */
export interface ArenaInitialStats {
  leftAtk: number[];
  leftHp: number[];
  rightAtk: number[];
  rightHp: number[];
}

/** Cached simulation result keyed by matchId. */
export interface ArenaSimulation {
  matchId: number;
  turns: ArenaTurn[];
  winnerId: number;
  /** True starting ATK/HP the trace runs on — used to render accurate cards. */
  initial?: ArenaInitialStats;
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
  explorerUrl: string | null;           // block-explorer base for the active network
  // Soonest upcoming tier-matchmaking unlock (unix seconds), or null when every
  // tier's cooldown has already elapsed (matchmaking can run now).
  nextMatchmakingAt: number | null;

  // Live data
  ghosts: Record<number, ArenaGhost>;   // by agentId
  matches: Record<number, ArenaMatch>;  // by matchId
  simulations: Record<number, ArenaSimulation>;  // cached by matchId
  inventories: Record<number, ArenaCard[]>;  // owned cards by agentId

  // UI state
  selectedMatchId: number | null;
  selectedAgentId: number | null;       // whose mind to show
  autoplay: boolean;
  turnIndex: number;                    // current turn cursor for the focus match
  paused: boolean;                      // temporary pause during autoplay (Space key)
  highlights: ArenaHighlight[];         // most recent first, capped
  tierFilter: ArenaTier | null;         // #33 leaderboard filter pill — null = all tiers

  // Setters
  setStaticConfig: (addr: string | null) => void;
  setExplorerUrl: (url: string | null) => void;
  setGhosts: (ghosts: Record<number, ArenaGhost>) => void;
  upsertMatch: (m: ArenaMatch) => void;
  upsertSimulation: (sim: ArenaSimulation) => void;
  setInventory: (agentId: number, cards: ArenaCard[]) => void;
  setNextMatchmakingAt: (ts: number | null) => void;
  setSelectedMatchId: (id: number | null) => void;
  setSelectedAgentId: (id: number | null) => void;
  setAutoplay: (v: boolean) => void;
  setTurnIndex: (n: number) => void;
  setPaused: (v: boolean) => void;
  pushHighlight: (h: ArenaHighlight) => void;
  setTierFilter: (t: ArenaTier | null) => void;
}

const HIGHLIGHT_CAP = 12;

export const useArenaStore = create<ArenaState>((set) => ({
  arenaEngineAddress: null,
  explorerUrl: null,
  nextMatchmakingAt: null,

  ghosts: {},
  matches: {},
  simulations: {},
  inventories: {},

  selectedMatchId: null,
  selectedAgentId: null,
  autoplay: true,
  turnIndex: 0,
  paused: false,
  highlights: [],
  tierFilter: null,

  setStaticConfig: (addr) => set({ arenaEngineAddress: addr }),
  setExplorerUrl: (url) => set({ explorerUrl: url }),
  setGhosts: (ghosts) => set({ ghosts }),
  upsertMatch: (m) =>
    set((s) => ({ matches: { ...s.matches, [m.matchId]: { ...s.matches[m.matchId], ...m } } })),
  upsertSimulation: (sim) =>
    set((s) => ({ simulations: { ...s.simulations, [sim.matchId]: sim } })),
  setInventory: (agentId, cards) =>
    set((s) => ({ inventories: { ...s.inventories, [agentId]: cards } })),
  setNextMatchmakingAt: (ts) => set({ nextMatchmakingAt: ts }),
  setSelectedMatchId: (id) => set({ selectedMatchId: id, turnIndex: 0, paused: false }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setAutoplay: (v) => set({ autoplay: v }),
  setTurnIndex: (n) => set({ turnIndex: n }),
  setPaused: (v) => set({ paused: v }),
  setTierFilter: (t) => set({ tierFilter: t }),
  pushHighlight: (h) =>
    set((s) => {
      // dedupe by id
      if (s.highlights.some((x) => x.id === h.id)) return {};
      const next = [h, ...s.highlights].slice(0, HIGHLIGHT_CAP);
      return { highlights: next };
    }),
}));

'use client';

import { useArenaStore } from '../../store/useArenaStore';
import { EvalBar } from './EvalBar';
import { ReplayCanvas } from './ReplayCanvas';

/**
 * Center stage: header (match #, status), eval bar, the replay canvas,
 * and play controls. Reads the focus match from the arena store; if none is
 * selected we show an empty-state.
 */
export function StagePanel() {
  const selectedMatchId = useArenaStore((s) => s.selectedMatchId);
  const matches = useArenaStore((s) => s.matches);
  const ghosts = useArenaStore((s) => s.ghosts);
  const sim = useArenaStore((s) => selectedMatchId ? s.simulations[selectedMatchId] : null);
  const autoplay = useArenaStore((s) => s.autoplay);
  const setAutoplay = useArenaStore((s) => s.setAutoplay);
  const setTurnIndex = useArenaStore((s) => s.setTurnIndex);

  const m = selectedMatchId ? matches[selectedMatchId] : null;
  if (!m || m.attackerId === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600">
        <div className="text-xs uppercase tracking-widest mb-2">stage</div>
        <div className="text-sm">no match selected — waiting for the next round…</div>
      </div>
    );
  }

  const attacker = ghosts[m.attackerId];
  const defender = ghosts[m.defenderId];
  const attackerName = attacker?.agentName ?? `Agent #${m.attackerId}`;
  const defenderName = defender?.agentName ?? `Agent #${m.defenderId}`;
  const attackerElo = attacker?.elo ?? 1000;
  const defenderElo = defender?.elo ?? 1000;

  // After replay finishes we can lock the bar to the winner.
  const resolvedWinner = m.settled
    ? (m.winnerId === m.attackerId ? 'left' : m.winnerId === m.defenderId ? 'right' : null)
    : null;

  return (
    <div className="h-full flex flex-col p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">Stage · Match #{m.matchId}</div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          {m.settled ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 uppercase font-semibold tracking-wider">settled</span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-amber-950 border border-amber-700 text-amber-300 uppercase font-semibold tracking-wider animate-pulse">pending</span>
          )}
          <span className="font-mono">seed {m.seed.slice(0, 10)}…</span>
        </div>
      </div>

      <EvalBar
        leftLabel={attackerName}
        rightLabel={defenderName}
        leftElo={attackerElo}
        rightElo={defenderElo}
        resolvedWinner={resolvedWinner}
      />

      <div className="mt-4">
        <ReplayCanvas
          matchId={m.matchId}
          attackerBench={m.attackerBench}
          defenderBench={m.defenderBench}
          attackerName={attackerName}
          defenderName={defenderName}
        />
      </div>

      {/* Play controls */}
      <div className="mt-3 flex items-center gap-3 justify-center">
        <button
          onClick={() => setAutoplay(!autoplay)}
          className="px-3 py-1.5 rounded border border-zinc-700 hover:border-zinc-500 text-xs font-medium text-zinc-200 transition-colors"
        >
          {autoplay ? '⏸ pause' : '▶ play'}
        </button>
        <button
          onClick={() => { setTurnIndex(0); setAutoplay(true); }}
          className="px-3 py-1.5 rounded border border-zinc-700 hover:border-zinc-500 text-xs font-medium text-zinc-200 transition-colors"
        >
          ↺ replay
        </button>
        {sim && (
          <span className="text-[10px] text-zinc-500 font-mono">
            {sim.turns.length} turns ·
            winner: <span className="text-amber-300 ml-1">{ghosts[sim.winnerId]?.agentName ?? `#${sim.winnerId}`}</span>
          </span>
        )}
      </div>

      {/* Match metadata strip */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="p-2 rounded border border-zinc-800 bg-zinc-950">
          <div className="text-[10px] uppercase text-sky-400 tracking-widest mb-1">{attackerName} — bench</div>
          <div className="text-zinc-400 font-mono text-[11px]">ELO {attackerElo} · slots {m.attackerBench.filter((u) => u !== 0).length}/5</div>
        </div>
        <div className="p-2 rounded border border-zinc-800 bg-zinc-950">
          <div className="text-[10px] uppercase text-rose-400 tracking-widest mb-1">{defenderName} — bench</div>
          <div className="text-zinc-400 font-mono text-[11px]">ELO {defenderElo} · slots {m.defenderBench.filter((u) => u !== 0).length}/5</div>
        </div>
      </div>
    </div>
  );
}

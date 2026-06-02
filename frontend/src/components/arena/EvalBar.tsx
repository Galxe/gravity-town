'use client';

type Props = {
  leftLabel: string;
  rightLabel: string;
  leftElo: number;
  rightElo: number;
  // optional override — if simulation says one side wins outright we can
  // push the bar fully to that side rather than the pre-match ELO odds.
  resolvedWinner?: 'left' | 'right' | null;
};

/**
 * Eval bar = chess-style "who's winning" indicator.
 * Pre-match: based on ELO delta (linearized to ±400 → 0..1, matching the
 * contract's bounded-linear expected-score approximation in _eloUpdate).
 * Post-match: full bar to the winning side.
 */
export function EvalBar({ leftLabel, rightLabel, leftElo, rightElo, resolvedWinner }: Props) {
  let leftPct: number;
  if (resolvedWinner === 'left') leftPct = 100;
  else if (resolvedWinner === 'right') leftPct = 0;
  else {
    // expectedLeft ≈ 0.5 + diff/800, clamped to ±400.
    const rawDiff = leftElo - rightElo;
    const diff = Math.max(-400, Math.min(400, rawDiff));
    leftPct = Math.max(5, Math.min(95, 50 + (diff / 800) * 100));
  }
  const rightPct = 100 - leftPct;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-[11px] mb-1 px-1">
        <span className="text-sky-300 font-medium">{leftLabel}</span>
        <span className="text-xs text-zinc-400 font-mono">ELO {leftElo} · {rightElo}</span>
        <span className="text-rose-300 font-medium">{rightLabel}</span>
      </div>
      <div className="w-full h-2 rounded bg-zinc-800 overflow-hidden flex">
        <div
          className="h-full bg-gradient-to-r from-sky-400 to-sky-500 transition-all"
          style={{ width: `${leftPct}%` }}
        />
        <div
          className="h-full bg-gradient-to-l from-rose-400 to-rose-500 transition-all"
          style={{ width: `${rightPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1 px-1 font-mono">
        <span>{leftPct.toFixed(0)}%</span>
        <span>{rightPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

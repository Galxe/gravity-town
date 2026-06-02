'use client';

import { useEffect, useState } from 'react';
import { useArenaStore } from '../../store/useArenaStore';

/**
 * Top status strip:
 *  - LIVE indicator (red pulsing dot when at least one match arrived within ~5min)
 *  - Countdown to next earliest matchmaking window across all known buckets
 *  - Current concurrent (unsettled) match count
 *  - Compact ELO-bucket roster
 */
export function TopBar() {
  const matches      = useArenaStore((s) => s.matches);
  const ghosts       = useArenaStore((s) => s.ghosts);
  const lastByBucket = useArenaStore((s) => s.lastMatchmakingByBucket);
  const period       = useArenaStore((s) => s.matchmakingPeriod);
  const arenaAddr    = useArenaStore((s) => s.arenaEngineAddress);

  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const i = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(i);
  }, []);

  // Live? Did anything happen in the last 5 minutes?
  const recentMatch = Object.values(matches).find((m) => m.createdAt && now - m.createdAt < 300);
  const live = Boolean(recentMatch);

  const ongoing = Object.values(matches).filter((m) => !m.settled && m.attackerId > 0).length;

  // Next matchmaking ETA across all known buckets.
  let nextEta: number | null = null;
  for (const bucketId of Object.keys(lastByBucket)) {
    const last = lastByBucket[Number(bucketId)] ?? 0;
    const eta = last + period;
    if (eta > now && (nextEta === null || eta < nextEta)) nextEta = eta;
  }
  const etaSecs = nextEta ? Math.max(0, nextEta - now) : null;

  // Bucket roster — count ghosts per bucket
  const bucketCounts: Record<number, number> = {};
  for (const g of Object.values(ghosts)) {
    if (!g.exists) continue;
    bucketCounts[g.bucketId] = (bucketCounts[g.bucketId] ?? 0) + 1;
  }
  const bucketEntries = Object.entries(bucketCounts).sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <div className="w-full px-4 py-2 border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${live ? 'bg-rose-500 animate-pulse' : 'bg-zinc-600'}`} />
        <span className={`text-xs font-bold tracking-wider ${live ? 'text-rose-300' : 'text-zinc-500'}`}>
          {live ? 'LIVE' : 'IDLE'}
        </span>
      </div>

      <div className="text-base font-bold tracking-tight">
        <span className="text-zinc-100">AI Tournament Hall</span>
        <span className="ml-2 text-xs text-zinc-500">— Gravity Town Arena</span>
      </div>

      <div className="flex-1" />

      <div className="text-xs flex items-center gap-1">
        <span className="text-zinc-500">next matchmaking</span>
        <span className="text-amber-300 font-mono">
          {etaSecs === null ? '—' : `${Math.floor(etaSecs / 60)}m ${etaSecs % 60}s`}
        </span>
      </div>

      <div className="text-xs flex items-center gap-1">
        <span className="text-zinc-500">ongoing</span>
        <span className="text-emerald-300 font-mono">{ongoing}</span>
      </div>

      <div className="text-xs flex items-center gap-1">
        <span className="text-zinc-500">buckets</span>
        <div className="flex gap-1">
          {bucketEntries.length === 0 && <span className="text-zinc-700">none</span>}
          {bucketEntries.map(([b, n]) => (
            <span
              key={b}
              className="px-1.5 py-[1px] rounded border border-zinc-700 bg-zinc-900 text-zinc-300 font-mono"
              title={`Bucket ${b} (ELO ${Number(b) * 200}-${Number(b) * 200 + 199})`}
            >
              B{b}:{n}
            </span>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-zinc-600 font-mono truncate max-w-[170px]" title={arenaAddr ?? ''}>
        {arenaAddr ? `arena ${arenaAddr.slice(0, 6)}…${arenaAddr.slice(-4)}` : 'arena: not deployed'}
      </div>
    </div>
  );
}

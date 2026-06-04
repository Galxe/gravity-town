'use client';

import { useArenaStore, ArenaTier } from '../../store/useArenaStore';

/** Tier badge styling, keyed by the on-chain `Tier` enum index (#33). */
const TIER_META: Record<ArenaTier, { label: string; short: string; cls: string }> = {
  0: { label: 'Bronze', short: 'B', cls: 'bg-amber-900/40 text-amber-300 border border-amber-700/50' },
  1: { label: 'Silver', short: 'S', cls: 'bg-zinc-600/40 text-zinc-200 border border-zinc-400/40' },
  2: { label: 'Gold',   short: 'G', cls: 'bg-yellow-700/30 text-yellow-300 border border-yellow-500/50' },
};

const TIER_FILTERS: { value: ArenaTier | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 0, label: 'Bronze' },
  { value: 1, label: 'Silver' },
  { value: 2, label: 'Gold' },
];

/**
 * Left column: leaderboard (top by ELO) + ongoing matches.
 * Clicking a row updates `selectedAgentId` so the Mind panel switches focus;
 * clicking a match row updates `selectedMatchId` so the Stage replays it.
 */
export function LeaderboardPanel() {
  const ghosts = useArenaStore((s) => s.ghosts);
  const matches = useArenaStore((s) => s.matches);
  const selectedAgentId = useArenaStore((s) => s.selectedAgentId);
  const selectedMatchId = useArenaStore((s) => s.selectedMatchId);
  const setSelectedAgentId = useArenaStore((s) => s.setSelectedAgentId);
  const setSelectedMatchId = useArenaStore((s) => s.setSelectedMatchId);
  const tierFilter = useArenaStore((s) => s.tierFilter);
  const setTierFilter = useArenaStore((s) => s.setTierFilter);

  // Sort by ELO (tiers do NOT regroup the ladder — #33). The filter pill only
  // narrows which rows show; ordering stays global so rank reads consistently.
  const ranked = Object.values(ghosts)
    .filter((g) => g.exists)
    .filter((g) => tierFilter === null || (g.tier ?? 0) === tierFilter)
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 10);

  // Ongoing = the most recent N matches (settled or not). Settled stay visible
  // briefly so the viewer can replay them; ongoing rise to the top.
  const recentMatches = Object.values(matches)
    .filter((m) => m.attackerId > 0)
    .sort((a, b) => b.matchId - a.matchId)
    .slice(0, 8);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Leaderboard */}
      <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Leaderboard · top ELO</div>
        {/* #33 — tier filter pills. Narrows rows by Bronze/Silver/Gold; ELO order unchanged. */}
        <div className="mt-1.5 flex gap-1">
          {TIER_FILTERS.map((f) => {
            const active = tierFilter === f.value;
            return (
              <button
                key={f.label}
                onClick={() => setTierFilter(f.value)}
                className={[
                  'px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold transition-colors',
                  active
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                    : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300',
                ].join(' ')}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {ranked.length === 0 && (
          <div className="p-4 text-xs text-zinc-600 text-center">no ghosts submitted yet</div>
        )}
        {ranked.map((g, idx) => {
          const isSel = selectedAgentId === g.agentId;
          return (
            <button
              key={g.agentId}
              onClick={() => setSelectedAgentId(g.agentId)}
              className={[
                'w-full text-left px-3 py-2 border-b border-zinc-900 hover:bg-zinc-900/60 transition-colors flex items-center gap-2',
                isSel ? 'bg-sky-950/40 border-l-2 border-l-sky-400' : '',
              ].join(' ')}
            >
              <div className="text-[10px] w-5 text-zinc-500 font-mono">{idx + 1}.</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="text-sm font-semibold text-zinc-100 truncate">{g.agentName}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* #33 — tier badge. Defaults to Bronze when gTreasury unresolved. */}
                    <span
                      className={['px-1 py-px rounded text-[9px] font-bold leading-none', TIER_META[g.tier ?? 0].cls].join(' ')}
                      title={TIER_META[g.tier ?? 0].label}
                    >
                      {TIER_META[g.tier ?? 0].short}
                    </span>
                    <div className="text-xs font-mono text-amber-300">{g.elo}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <div className="flex gap-0.5">
                    {(g.recentResults.length > 0 ? g.recentResults : ['·','·','·','·','·']).slice(0, 5).map((r, i) => (
                      <span
                        key={i}
                        className={
                          r === 'W' ? 'text-emerald-400' :
                          r === 'L' ? 'text-rose-400' :
                          'text-zinc-700'
                        }
                      >
                        {r === 'W' ? '🔥' : r === 'L' ? '·' : '·'}
                      </span>
                    ))}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    {/* #33 — G balance column (hidden until gTreasury resolves). */}
                    {g.gBalance !== undefined && <span className="text-emerald-300/80">G {g.gBalance}</span>}
                    {g.gBalance !== undefined && <span className="text-zinc-700"> · </span>}
                    {g.bench.filter((u) => u !== 0).length}/5
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Ongoing / recent matches */}
      <div className="px-3 py-2 border-y border-zinc-800 bg-zinc-950">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Recent · click to replay</div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {recentMatches.length === 0 && (
          <div className="p-4 text-xs text-zinc-600 text-center">no matches yet</div>
        )}
        {recentMatches.map((m) => {
          const isSel = selectedMatchId === m.matchId;
          const aName = ghosts[m.attackerId]?.agentName ?? `#${m.attackerId}`;
          const dName = ghosts[m.defenderId]?.agentName ?? `#${m.defenderId}`;
          const winName = m.settled
            ? (m.winnerId === m.attackerId ? aName : m.winnerId === m.defenderId ? dName : '—')
            : null;
          return (
            <button
              key={m.matchId}
              onClick={() => {
                setSelectedMatchId(m.matchId);
                setSelectedAgentId(m.attackerId);
              }}
              className={[
                'w-full text-left px-3 py-2 border-b border-zinc-900 hover:bg-zinc-900/60 transition-colors',
                isSel ? 'bg-emerald-950/30 border-l-2 border-l-emerald-400' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-zinc-400 font-mono">#{m.matchId}</div>
                {m.settled ? (
                  <span className="text-[9px] uppercase text-emerald-400 tracking-wider">settled</span>
                ) : (
                  <span className="text-[9px] uppercase text-amber-400 tracking-wider animate-pulse">live</span>
                )}
              </div>
              <div className="text-xs text-zinc-200 truncate">
                <span className="text-sky-300">{aName}</span>
                <span className="text-zinc-600"> vs </span>
                <span className="text-rose-300">{dName}</span>
              </div>
              {winName && (
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  → <span className="text-amber-300">{winName}</span> won
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

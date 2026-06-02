'use client';

import { useArenaStore } from '../../store/useArenaStore';

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

  const ranked = Object.values(ghosts)
    .filter((g) => g.exists)
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
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-zinc-100 truncate">{g.agentName}</div>
                  <div className="text-xs font-mono text-amber-300">{g.elo}</div>
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
                    B{g.bucketId} · {g.bench.filter((u) => u !== 0).length}/5
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

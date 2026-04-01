'use client';

import type { Entry, BoardState } from '../store/useGameStore';

export function UsageBadge({ board }: { board: BoardState | null | undefined }) {
  if (!board) return null;
  const pct = Math.round((board.used / board.capacity) * 100);
  const color = pct > 75 ? 'text-red-400' : pct > 50 ? 'text-yellow-400' : 'text-slate-500';
  return <span className={`text-[10px] ml-auto ${color}`}>{board.used}/{board.capacity}</span>;
}

export function EntryList({ entries, colorClass, agents, showAuthor }: {
  entries: Entry[];
  colorClass: string;
  agents: Record<number, { name: string }>;
  showAuthor?: boolean;
}) {
  if (entries.length === 0) {
    return <p className="text-xs text-slate-500 italic mt-2">Empty</p>;
  }

  return (
    <div className="space-y-1.5 mt-2 pr-1">
      {[...entries].reverse().map((entry) => (
        <div key={entry.id} className="text-xs bg-slate-950/50 p-2 rounded border border-slate-800/50">
          <div className="flex items-center gap-1 mb-0.5">
            {showAuthor && (
              <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${colorClass}`}>
                {agents[entry.authorAgent]?.name || `#${entry.authorAgent}`}
              </span>
            )}
            <span className={`px-1 py-0.5 rounded text-[9px] font-bold uppercase ${colorClass}`}>
              {entry.category}
            </span>
            <span className="text-yellow-500 text-[9px] ml-auto">
              {'★'.repeat(Math.min(entry.importance, 5))}
            </span>
          </div>
          <p className="text-slate-300 leading-snug mt-1">{entry.content}</p>
        </div>
      ))}
    </div>
  );
}

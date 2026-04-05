'use client';

import type { Entry, BoardState } from '../store/useGameStore';

const COLOR_MAP: Record<string, string> = {
  cyan:   'bg-cart-cyan/15 text-cart-cyan border-cart-cyan/25',
  green:  'bg-cart-green/15 text-cart-green border-cart-green/25',
  gold:   'bg-cart-gold/15 text-cart-gold border-cart-gold/25',
  red:    'bg-cart-red/15 text-cart-red border-cart-red/25',
  blue:   'bg-cart-blue/15 text-cart-blue border-cart-blue/25',
  purple: 'bg-cart-purple/15 text-cart-purple border-cart-purple/25',
};

export function UsageBadge({ board }: { board: BoardState | null | undefined }) {
  if (!board) return null;
  const pct = Math.round((board.used / board.capacity) * 100);
  const color = pct > 75 ? 'text-cart-red' : pct > 50 ? 'text-cart-gold' : 'text-ink-faded';
  return <span className={`text-[10px] font-hand ml-auto ${color}`}>{board.used}/{board.capacity}</span>;
}

export function EntryList({ entries, color, agents, showAuthor }: {
  entries: Entry[];
  color: string;
  agents: Record<number, { name: string }>;
  showAuthor?: boolean;
}) {
  const colorClass = COLOR_MAP[color] || COLOR_MAP.blue;

  if (entries.length === 0) {
    return <p className="text-xs text-ink-faded italic mt-2 font-hand">Empty</p>;
  }

  return (
    <div className="space-y-1.5 mt-2 pr-1">
      {[...entries].reverse().map((entry) => (
        <div key={entry.id} className="text-xs bg-parchment-dark/40 p-2 rounded-xl border-2 border-wood/15">
          <div className="flex items-center gap-1 mb-0.5">
            {showAuthor && (
              <span className={`px-1.5 py-0.5 rounded-lg text-[9px] font-bold font-cartoon border ${colorClass}`}>
                {agents[entry.authorAgent]?.name || `#${entry.authorAgent}`}
              </span>
            )}
            <span className={`px-1.5 py-0.5 rounded-lg text-[9px] font-bold font-cartoon uppercase border ${colorClass}`}>
              {entry.category}
            </span>
            <span className="text-cart-gold text-[9px] ml-auto">
              {'★'.repeat(Math.min(entry.importance, 5))}
            </span>
          </div>
          <p className="text-ink-soft leading-snug mt-1 font-cartoon text-[11px]">{entry.content}</p>
        </div>
      ))}
    </div>
  );
}

'use client';

import { useArenaStore } from '../../store/useArenaStore';

const KIND_STYLE: Record<string, string> = {
  upset:          'bg-amber-950/60 border-amber-700 text-amber-200',
  streak_broken:  'bg-rose-950/60 border-rose-700 text-rose-200',
  matchmaking:    'bg-zinc-900 border-zinc-700 text-zinc-300',
};

const KIND_ICON: Record<string, string> = {
  upset: '⚡',
  streak_broken: '💔',
  matchmaking: '🎲',
};

/**
 * Footer ticker. New entries slide in from the right with a brief fade.
 * Items are capped + dedupe-by-id in the store.
 */
export function HighlightTicker() {
  const highlights = useArenaStore((s) => s.highlights);
  const setSelectedMatchId = useArenaStore((s) => s.setSelectedMatchId);

  return (
    <div className="w-full border-t border-zinc-800 bg-zinc-950 px-3 py-2 flex items-center gap-3 overflow-hidden">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold whitespace-nowrap">Highlights</div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {highlights.length === 0 && (
          <div className="text-xs text-zinc-600 italic">waiting for upsets and streaks…</div>
        )}
        {highlights.map((h) => (
          <button
            key={h.id}
            onClick={() => { if (h.matchId) setSelectedMatchId(h.matchId); }}
            className={[
              'whitespace-nowrap px-2 py-1 rounded border text-[11px] font-medium transition-all animate-arena-slidein',
              KIND_STYLE[h.kind] ?? 'bg-zinc-900 border-zinc-700 text-zinc-300',
            ].join(' ')}
            title={new Date(h.timestamp).toLocaleString()}
          >
            <span className="mr-1">{KIND_ICON[h.kind] ?? '•'}</span>
            {h.text}
          </button>
        ))}
      </div>
    </div>
  );
}

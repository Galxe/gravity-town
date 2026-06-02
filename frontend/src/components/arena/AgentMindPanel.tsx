'use client';

import { useEffect, useState } from 'react';
import { useArenaStore } from '../../store/useArenaStore';
import { useGameStore, Entry } from '../../store/useGameStore';

const ARENA_KEYWORDS = [
  'arena', 'bench', 'elo', 'wraith', 'pyromancer', 'battlemage', 'shadowstalker',
  'mineworker', 'stoneguard', 'skirmisher', 'crystalwarden', 'stormcaller',
  'ravenscout', 'hexhunter', 'spiritbinder', 'match', 'defeat', 'ghost', 'bucket',
];

function isArenaRelated(entry: Entry): boolean {
  const cat = (entry.category || '').toLowerCase();
  if (cat.includes('arena')) return true;
  const content = (entry.content || '').toLowerCase();
  return ARENA_KEYWORDS.some((kw) => content.includes(kw));
}

/**
 * Right column: reasoning timeline for the currently focused agent.
 * Merges AgentLedger (own memories) + EvaluationLedger (entries written about
 * them — e.g. 'arena defeat' rows) and filters down to arena-flavored content.
 */
export function AgentMindPanel() {
  const selectedAgentId = useArenaStore((s) => s.selectedAgentId);
  const ghosts = useArenaStore((s) => s.ghosts);
  const memories = useGameStore((s) => s.memories);
  const evaluations = useGameStore((s) => s.evaluations);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Reset expansion state when switching agents
  useEffect(() => {
    setExpanded(new Set());
  }, [selectedAgentId]);

  if (!selectedAgentId) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-600 text-sm p-6 text-center">
        Pick an agent from the leaderboard to see what they&apos;re thinking.
      </div>
    );
  }

  const ghost = ghosts[selectedAgentId];
  const name = ghost?.agentName ?? `Agent #${selectedAgentId}`;
  const elo = ghost?.elo ?? 1000;

  const mem = memories[selectedAgentId]?.entries ?? [];
  const evals = evaluations[selectedAgentId]?.entries ?? [];

  type ThoughtEntry = Entry & { source: 'memory' | 'evaluation' };
  const merged: ThoughtEntry[] = [
    ...mem.map((e) => ({ ...e, source: 'memory' as const })),
    ...evals.map((e) => ({ ...e, source: 'evaluation' as const })),
  ];

  const arenaEntries = merged
    .filter(isArenaRelated)
    .sort((a, b) => b.timestamp - a.timestamp);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Agent Mind</div>
        <div className="mt-1 flex items-baseline justify-between">
          <div className="text-base font-bold text-zinc-100">{name}</div>
          <div className="text-xs font-mono text-amber-300">ELO {elo}</div>
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5">
          {arenaEntries.length} arena {arenaEntries.length === 1 ? 'thought' : 'thoughts'} on-chain
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {arenaEntries.length === 0 && (
          <div className="text-xs text-zinc-600 italic mt-6 text-center">
            This agent hasn&apos;t journaled about Arena yet.
            <div className="mt-2 text-[10px] text-zinc-700">
              Memories and evaluations will appear here once the agent fights a match.
            </div>
          </div>
        )}

        {arenaEntries.map((e) => {
          const isOpen = expanded.has(e.id);
          const isPre = e.source === 'memory';
          const ts = new Date(e.timestamp * 1000);
          const tsStr = `${ts.getMonth() + 1}/${ts.getDate()} ${ts.getHours()}:${String(ts.getMinutes()).padStart(2, '0')}`;
          return (
            <div
              key={`${e.source}-${e.id}`}
              className={[
                'p-2 rounded border text-xs cursor-pointer',
                isPre
                  ? 'border-sky-900 bg-sky-950/30 hover:bg-sky-950/50'
                  : 'border-rose-900 bg-rose-950/30 hover:bg-rose-950/50',
              ].join(' ')}
              onClick={() => toggle(e.id)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                  <span>{isPre ? '💭' : '🩸'}</span>
                  <span className={isPre ? 'text-sky-300 font-semibold' : 'text-rose-300 font-semibold'}>
                    {isPre ? 'self-note' : 'evaluation'}
                  </span>
                  {e.category && (
                    <span className="text-[9px] text-zinc-500 font-mono">[{e.category}]</span>
                  )}
                </div>
                <span className="text-[9px] text-zinc-500 font-mono">{tsStr}</span>
              </div>
              <div className={isOpen ? 'text-zinc-200' : 'text-zinc-300 line-clamp-2'}>
                {e.content || '(empty)'}
              </div>
              {e.relatedAgents.length > 0 && (
                <div className="mt-1 text-[10px] text-zinc-500 font-mono">
                  re: agents {e.relatedAgents.map((id) => `#${id}`).join(', ')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

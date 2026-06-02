'use client';

import { useEffect } from 'react';
import { TopBar } from '@/components/arena/TopBar';
import { LeaderboardPanel } from '@/components/arena/LeaderboardPanel';
import { StagePanel } from '@/components/arena/StagePanel';
import { AgentMindPanel } from '@/components/arena/AgentMindPanel';
import { HighlightTicker } from '@/components/arena/HighlightTicker';
import { useArenaEngine } from '@/hooks/useArenaEngine';
import { useGameEngine } from '@/hooks/useGameEngine';

export default function ArenaPage() {
  // Pull Arena data (ghosts, matches, sims, events) into the arena store.
  useArenaEngine();
  // Reuse the game engine hook to populate memories + evaluations for the
  // Agent Mind panel — these live on AgentLedger / EvaluationLedger.
  useGameEngine();

  useEffect(() => {
    document.body.classList.add('arena-route');
    return () => { document.body.classList.remove('arena-route'); };
  }, []);

  return (
    <main className="w-screen h-screen flex flex-col bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      <TopBar />

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-px bg-zinc-900">
        <aside className="col-span-3 bg-zinc-950 border-r border-zinc-800 min-h-0">
          <LeaderboardPanel />
        </aside>

        <section className="col-span-6 bg-zinc-950 min-h-0 overflow-hidden">
          <StagePanel />
        </section>

        <aside className="col-span-3 bg-zinc-950 border-l border-zinc-800 min-h-0">
          <AgentMindPanel />
        </aside>
      </div>

      <HighlightTicker />
    </main>
  );
}

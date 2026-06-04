'use client';

import { useEffect, useRef } from 'react';
import { ArenaSimulation, ArenaMatch, ArenaGhost } from '../../store/useArenaStore';
import { getUnit } from '../../lib/arenaUnits';

type Props = {
  sim: ArenaSimulation;
  match: ArenaMatch;
  ghosts: Record<number, ArenaGhost>;
  turnIndex: number;
};

type LogLine = {
  turnNum: number;
  atkLabel: string;
  defLabel: string;
  damage: number;
  ko: boolean;
  attackerSide: 0 | 1;
  isCurrent: boolean;
};

export function BattleLog({ sim, match, ghosts, turnIndex }: Props) {
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [turnIndex]);

  const lines: LogLine[] = sim.turns.map((t, i) => {
    const atkBench = t.attackerSide === 0 ? match.attackerBench : match.defenderBench;
    const defBench = t.attackerSide === 0 ? match.defenderBench : match.attackerBench;
    const atkAgentId = t.attackerSide === 0 ? match.attackerId : match.defenderId;
    const defAgentId = t.attackerSide === 0 ? match.defenderId : match.attackerId;

    const atkUnit = getUnit(atkBench[t.attackerSlot]);
    const defUnit = getUnit(defBench[t.defenderSlot]);
    const atkAgentName = ghosts[atkAgentId]?.agentName ?? `#${atkAgentId}`;
    const defAgentName = ghosts[defAgentId]?.agentName ?? `#${defAgentId}`;

    return {
      turnNum: i + 1,
      atkLabel: `${atkAgentName} ${atkUnit?.name ?? '?'}`,
      defLabel: `${defAgentName} ${defUnit?.name ?? '?'}`,
      damage: t.damage,
      ko: t.defenderDied,
      attackerSide: t.attackerSide,
      isCurrent: i === turnIndex - 1,
    };
  });

  // Newest first.
  const reversed = [...lines].reverse();

  return (
    <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 overflow-hidden">
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-zinc-500 border-b border-zinc-800 font-semibold">
        Battle Log
      </div>
      <div className="h-[120px] overflow-y-auto no-scrollbar">
        {reversed.map((line) => (
          <div
            key={line.turnNum}
            ref={line.isCurrent ? highlightRef : null}
            className={[
              'px-3 py-0.5 font-mono text-[11px] border-b border-zinc-900 last:border-0',
              line.isCurrent ? 'bg-zinc-800 text-white' : 'text-zinc-500',
            ].join(' ')}
          >
            <span className={line.attackerSide === 0 ? 'text-sky-400' : 'text-rose-400'}>
              T{line.turnNum}
            </span>
            <span className="text-zinc-600"> │ </span>
            <span className={line.isCurrent ? 'text-zinc-200' : 'text-zinc-400'}>
              {line.atkLabel}
            </span>
            <span className="text-zinc-600"> → </span>
            <span className={line.isCurrent ? 'text-zinc-200' : 'text-zinc-400'}>
              {line.defLabel}
            </span>
            <span className="text-zinc-600"> │ </span>
            <span className="text-orange-400">{line.damage} dmg</span>
            {line.ko && <span className="ml-1 text-rose-500 font-semibold"> │ KO!</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

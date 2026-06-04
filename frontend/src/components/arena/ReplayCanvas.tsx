'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { UnitCard } from './UnitCard';
import { BattleLog } from './BattleLog';
import { useArenaStore, ArenaTurn, ArenaMatch } from '../../store/useArenaStore';
import { getUnit } from '../../lib/arenaUnits';

type Props = {
  match: ArenaMatch;
  attackerName: string;
  defenderName: string;
};

export function ReplayCanvas({ match, attackerName, defenderName }: Props) {
  const { matchId, attackerBench, defenderBench } = match;

  const sim = useArenaStore((s) => s.simulations[matchId]);
  const ghosts = useArenaStore((s) => s.ghosts);
  const autoplay = useArenaStore((s) => s.autoplay);
  const paused = useArenaStore((s) => s.paused);
  const turnIndex = useArenaStore((s) => s.turnIndex);
  const setTurnIndex = useArenaStore((s) => s.setTurnIndex);
  const setPaused = useArenaStore((s) => s.setPaused);

  // Animation state: which turn is actively animating.
  const prevTurnRef = useRef(turnIndex);
  const [attackAnimKey, setAttackAnimKey] = useState(0);
  const [currentTurn, setCurrentTurn] = useState<ArenaTurn | null>(null);

  // Reset cursor and animation state when match changes.
  useEffect(() => {
    setTurnIndex(0);
    setAttackAnimKey(0);
    setCurrentTurn(null);
  }, [matchId, setTurnIndex]);

  // Autoplay tick.
  useEffect(() => {
    if (!autoplay || paused || !sim) return;
    if (turnIndex >= sim.turns.length) return;
    const t = setTimeout(() => setTurnIndex(turnIndex + 1), 800);
    return () => clearTimeout(t);
  }, [autoplay, paused, sim, turnIndex, setTurnIndex]);

  // Compute HP by replaying turns up to turnIndex.
  const { leftHp, rightHp, leftMax, rightMax } = useMemo(() => {
    const lHp: number[] = attackerBench.map((t) => getUnit(t)?.hp ?? 0);
    const rHp: number[] = defenderBench.map((t) => getUnit(t)?.hp ?? 0);
    const lMax = [...lHp];
    const rMax = [...rHp];
    if (sim) {
      const upto = Math.min(turnIndex, sim.turns.length);
      for (let i = 0; i < upto; i++) {
        const t = sim.turns[i];
        if (t.attackerSide === 0) {
          rHp[t.defenderSlot] = Math.max(0, rHp[t.defenderSlot] - t.damage);
        } else {
          lHp[t.defenderSlot] = Math.max(0, lHp[t.defenderSlot] - t.damage);
        }
      }
    }
    return { leftHp: lHp, rightHp: rHp, leftMax: lMax, rightMax: rMax };
  }, [sim, turnIndex, attackerBench, defenderBench]);

  // Track turn direction for animation triggering.
  useEffect(() => {
    if (turnIndex > prevTurnRef.current && sim && turnIndex > 0) {
      setCurrentTurn(sim.turns[turnIndex - 1]);
      setAttackAnimKey((k) => k + 1);
    } else if (turnIndex < prevTurnRef.current) {
      // Scrubbing backward — clear animation.
      setCurrentTurn(null);
    }
    prevTurnRef.current = turnIndex;
  }, [turnIndex, sim]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sim) return;
      if (e.key === ' ') {
        e.preventDefault();
        setPaused(!paused);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setTurnIndex(Math.min(turnIndex + 1, sim.turns.length));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setTurnIndex(Math.max(0, turnIndex - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sim, paused, turnIndex, setPaused, setTurnIndex]);

  const finishedTurns = sim ? sim.turns.length : 0;
  const done = sim && turnIndex >= sim.turns.length;

  const ct = currentTurn;

  const renderBench = (bench: number[], hpArr: number[], maxArr: number[], side: 'left' | 'right') => {
    const sideNum = side === 'left' ? 0 : 1;
    return bench.map((u, i) => {
      const isAttacker = ct !== null && ct.attackerSide === sideNum && ct.attackerSlot === i;
      const isDefender = ct !== null && ct.attackerSide !== sideNum && ct.defenderSlot === i;
      // Stable key — only changes on match switch. Attack/hit animations triggered via DOM refs.
      return (
        <UnitCard
          key={`${side}-${i}-m${matchId}`}
          unitType={u}
          hp={hpArr[i]}
          maxHp={maxArr[i]}
          dead={hpArr[i] <= 0 && maxArr[i] > 0}
          attackKey={isAttacker ? attackAnimKey : 0}
          hitKey={isDefender ? attackAnimKey : 0}
          floatingDamage={isDefender && ct ? ct.damage : null}
          enterDelay={side === 'left' ? i * 80 : (bench.length - 1 - i) * 80}
          slotIndex={i}
          side={side}
        />
      );
    });
  };

  return (
    <div className="w-full">
      {/* Side labels + turn counter */}
      <div className="flex items-center justify-between mb-2 text-xs">
        <div className="text-sky-300 font-semibold">⬅ {attackerName}</div>
        <div className="text-zinc-500 font-mono flex items-center gap-2">
          {paused && <span className="text-amber-400">⏸</span>}
          turn {Math.min(turnIndex, finishedTurns)} / {finishedTurns}
          {done && <span className="text-emerald-400">· complete</span>}
        </div>
        <div className="text-rose-300 font-semibold">{defenderName} ➡</div>
      </div>

      {/* Scrubber */}
      {sim && (
        <div className="mb-3 px-1">
          <input
            type="range"
            min={0}
            max={sim.turns.length}
            value={turnIndex}
            onChange={(e) => {
              setPaused(true);
              setTurnIndex(Number(e.target.value));
            }}
            className="w-full h-1.5 accent-sky-500 cursor-pointer"
          />
        </div>
      )}

      {/* Battle grid */}
      <div className="flex items-center justify-center gap-2 px-2 py-4 rounded-lg bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 border border-zinc-800">
        <div className="flex gap-1.5">
          {renderBench(attackerBench, leftHp, leftMax, 'left')}
        </div>
        <div className="px-2 text-zinc-500 text-2xl font-black">⚔</div>
        <div className="flex gap-1.5">
          {renderBench(defenderBench, rightHp, rightMax, 'right')}
        </div>
      </div>

      {/* Battle log */}
      {sim && (
        <BattleLog
          sim={sim}
          match={match}
          ghosts={ghosts}
          turnIndex={turnIndex}
        />
      )}

      {!sim && (
        <div className="mt-3 min-h-[34px] px-3 py-2 rounded bg-zinc-900/60 border border-zinc-800 text-xs font-mono text-zinc-500">
          loading simulation…
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { UnitCard } from './UnitCard';
import { useArenaStore, ArenaTurn } from '../../store/useArenaStore';
import { getUnit } from '../../lib/arenaUnits';

type Props = {
  matchId: number;
  attackerBench: number[];
  defenderBench: number[];
  attackerName: string;
  defenderName: string;
};

/**
 * Battle replay rendered with React DOM + CSS — no Phaser, no canvas.
 * Drives an HP map per turn deterministically, animates KOs, and pushes
 * `turnIndex` forward on a fixed 800ms cadence when autoplay is on.
 */
export function ReplayCanvas({
  matchId, attackerBench, defenderBench, attackerName, defenderName,
}: Props) {
  const sim = useArenaStore((s) => s.simulations[matchId]);
  const autoplay = useArenaStore((s) => s.autoplay);
  const turnIndex = useArenaStore((s) => s.turnIndex);
  const setTurnIndex = useArenaStore((s) => s.setTurnIndex);

  // Reset cursor when match changes.
  useEffect(() => {
    setTurnIndex(0);
  }, [matchId, setTurnIndex]);

  // Autoplay tick. Stop at end of turns.
  useEffect(() => {
    if (!autoplay || !sim) return;
    if (turnIndex >= sim.turns.length) return;
    const t = setTimeout(() => setTurnIndex(turnIndex + 1), 800);
    return () => clearTimeout(t);
  }, [autoplay, sim, turnIndex, setTurnIndex]);

  // Compute current HP for every slot by replaying turns up to `turnIndex`.
  const { leftHp, rightHp, leftMax, rightMax, lastTurn } = useMemo(() => {
    const lHp: number[] = attackerBench.map((t) => getUnit(t)?.hp ?? 0);
    const rHp: number[] = defenderBench.map((t) => getUnit(t)?.hp ?? 0);
    const lMax = [...lHp];
    const rMax = [...rHp];
    let lt: ArenaTurn | null = null;
    if (sim) {
      const upto = Math.min(turnIndex, sim.turns.length);
      for (let i = 0; i < upto; i++) {
        const t = sim.turns[i];
        if (t.attackerSide === 0) {
          rHp[t.defenderSlot] = Math.max(0, rHp[t.defenderSlot] - t.damage);
        } else {
          lHp[t.defenderSlot] = Math.max(0, lHp[t.defenderSlot] - t.damage);
        }
        lt = t;
      }
    }
    return { leftHp: lHp, rightHp: rHp, leftMax: lMax, rightMax: rMax, lastTurn: lt };
  }, [sim, turnIndex, attackerBench, defenderBench]);

  const finishedTurns = sim ? sim.turns.length : 0;
  const done = sim && turnIndex >= sim.turns.length;

  return (
    <div className="w-full">
      {/* Side labels + turn counter */}
      <div className="flex items-center justify-between mb-2 text-xs">
        <div className="text-sky-300 font-semibold">⬅ {attackerName}</div>
        <div className="text-zinc-500 font-mono">
          turn {Math.min(turnIndex, finishedTurns)} / {finishedTurns}
          {done && <span className="ml-2 text-emerald-400">· complete</span>}
        </div>
        <div className="text-rose-300 font-semibold">{defenderName} ➡</div>
      </div>

      {/* Battle grid: left bench → vs marker → right bench */}
      <div className="flex items-center justify-center gap-2 px-2 py-4 rounded-lg bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 border border-zinc-800">
        <div className="flex gap-1.5">
          {attackerBench.map((u, i) => {
            const isAttacker = lastTurn?.attackerSide === 0 && lastTurn?.attackerSlot === i;
            const isDefender = lastTurn?.attackerSide === 1 && lastTurn?.defenderSlot === i;
            return (
              <UnitCard
                key={`L-${i}`}
                unitType={u}
                hp={leftHp[i]}
                maxHp={leftMax[i]}
                dead={leftHp[i] <= 0 && leftMax[i] > 0}
                flashing={isDefender ? 'hit' : null}
                slotIndex={i}
                side="left"
              />
            );
          })}
        </div>

        <div className="px-2 text-zinc-500 text-2xl font-black">⚔</div>

        <div className="flex gap-1.5">
          {defenderBench.map((u, i) => {
            const isAttacker = lastTurn?.attackerSide === 1 && lastTurn?.attackerSlot === i;
            const isDefender = lastTurn?.attackerSide === 0 && lastTurn?.defenderSlot === i;
            return (
              <UnitCard
                key={`R-${i}`}
                unitType={u}
                hp={rightHp[i]}
                maxHp={rightMax[i]}
                dead={rightHp[i] <= 0 && rightMax[i] > 0}
                flashing={isDefender ? 'hit' : null}
                slotIndex={i}
                side="right"
              />
            );
          })}
        </div>
      </div>

      {/* Turn description ticker */}
      <div className="mt-3 min-h-[34px] px-3 py-2 rounded bg-zinc-900/60 border border-zinc-800 text-xs font-mono text-zinc-300">
        {!sim && <span className="text-zinc-500">loading simulation…</span>}
        {sim && turnIndex === 0 && <span className="text-zinc-500">▶ ready — first strike incoming</span>}
        {sim && lastTurn && (
          <span>
            <span className={lastTurn.attackerSide === 0 ? 'text-sky-300' : 'text-rose-300'}>
              {lastTurn.attackerSide === 0 ? attackerName : defenderName}
            </span>
            {' slot '}#{lastTurn.attackerSlot}
            {' hits '}
            <span className={lastTurn.attackerSide === 0 ? 'text-rose-300' : 'text-sky-300'}>
              {lastTurn.attackerSide === 0 ? defenderName : attackerName}
            </span>
            {' slot '}#{lastTurn.defenderSlot}
            {' for '}<span className="text-orange-300">{lastTurn.damage}</span>
            {lastTurn.defenderDied && <span className="text-rose-500"> — KO!</span>}
          </span>
        )}
      </div>
    </div>
  );
}

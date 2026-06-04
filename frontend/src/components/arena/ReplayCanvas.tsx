'use client';

import { useEffect, useMemo } from 'react';
import { UnitCard } from './UnitCard';
import { useArenaStore, ArenaTurn } from '../../store/useArenaStore';
import { getUnit } from '../../lib/arenaUnits';
import { t } from '../../i18n';

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
  // Seed from the contract's post-ON_START stats when available (accurate);
  // fall back to catalog base stats for older sims.
  const { leftHp, rightHp, leftMax, rightMax, leftAtk, rightAtk, lastTurn } = useMemo(() => {
    const lHp: number[] = sim?.initial?.leftHp ?? attackerBench.map((t) => getUnit(t)?.hp ?? 0);
    const rHp: number[] = sim?.initial?.rightHp ?? defenderBench.map((t) => getUnit(t)?.hp ?? 0);
    const lAtk: number[] = sim?.initial?.leftAtk ?? attackerBench.map((t) => getUnit(t)?.atk ?? 0);
    const rAtk: number[] = sim?.initial?.rightAtk ?? defenderBench.map((t) => getUnit(t)?.atk ?? 0);
    const lHpCur = [...lHp];
    const rHpCur = [...rHp];
    // Mutable ATK copies: a turn's `damage` equals the attacker's current ATK
    // (no armor/mitigation in the engine), so replaying turns reveals mid-combat
    // ATK buffs (ON_HURT, ON_FRIEND_DEATH, …) without any extra contract data.
    const lAtkCur = [...lAtk];
    const rAtkCur = [...rAtk];
    let lt: ArenaTurn | null = null;
    if (sim) {
      const upto = Math.min(turnIndex, sim.turns.length);
      for (let i = 0; i < upto; i++) {
        const t = sim.turns[i];
        if (t.attackerSide === 0) {
          rHpCur[t.defenderSlot] = Math.max(0, rHpCur[t.defenderSlot] - t.damage);
          lAtkCur[t.attackerSlot] = t.damage;
        } else {
          lHpCur[t.defenderSlot] = Math.max(0, lHpCur[t.defenderSlot] - t.damage);
          rAtkCur[t.attackerSlot] = t.damage;
        }
        lt = t;
      }
    }
    return {
      leftHp: lHpCur, rightHp: rHpCur,
      leftMax: lHp, rightMax: rHp,
      leftAtk: lAtkCur, rightAtk: rAtkCur,
      lastTurn: lt,
    };
  }, [sim, turnIndex, attackerBench, defenderBench]);

  const finishedTurns = sim ? sim.turns.length : 0;
  const done = sim && turnIndex >= sim.turns.length;

  return (
    <div className="w-full">
      {/* Turn counter (team names now sit beside each row below) */}
      <div className="flex items-center justify-center mb-2 text-xs">
        <div className="text-zinc-500 font-mono">
          {t('replay.turn', { cur: Math.min(turnIndex, finishedTurns), total: finishedTurns })}
          {done && <span className="ml-2 text-emerald-400">{t('replay.complete')}</span>}
        </div>
      </div>

      {/* Battle board: attacker row stacked on top of defender row, so all 5
          cards per side fit the narrow stage. Wraps instead of clipping when
          the stage is extremely tight. */}
      <div className="flex flex-col items-center gap-1.5 px-2 py-4 rounded-lg bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 border border-zinc-800">
        <div className="flex justify-center w-full">
          <div className="relative flex justify-center gap-1.5 flex-wrap">
          <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-sky-300 font-semibold text-sm">{attackerName}</div>
          {attackerBench.map((u, i) => {
            const isDefender = lastTurn?.attackerSide === 1 && lastTurn?.defenderSlot === i;
            return (
              <UnitCard
                key={`L-${i}`}
                unitType={u}
                hp={leftHp[i]}
                maxHp={leftMax[i]}
                atk={leftAtk[i]}
                dead={leftHp[i] <= 0 && leftMax[i] > 0}
                flashing={isDefender ? 'hit' : null}
                slotIndex={i}
                side="left"
              />
            );
          })}
          </div>
        </div>

        {/* horizontal divider between the two team rows */}
        <div className="flex items-center gap-2 w-full max-w-[440px] my-0.5 text-zinc-600">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-lg font-black leading-none">⚔</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        <div className="flex justify-center w-full">
          <div className="relative flex justify-center gap-1.5 flex-wrap">
          <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-rose-300 font-semibold text-sm">{defenderName}</div>
          {defenderBench.map((u, i) => {
            const isDefender = lastTurn?.attackerSide === 0 && lastTurn?.defenderSlot === i;
            return (
              <UnitCard
                key={`R-${i}`}
                unitType={u}
                hp={rightHp[i]}
                maxHp={rightMax[i]}
                atk={rightAtk[i]}
                dead={rightHp[i] <= 0 && rightMax[i] > 0}
                flashing={isDefender ? 'hit' : null}
                slotIndex={i}
                side="right"
              />
            );
          })}
          </div>
        </div>
      </div>

      {/* Turn description ticker */}
      <div className="mt-3 min-h-[34px] px-3 py-2 rounded bg-zinc-900/60 border border-zinc-800 text-xs font-mono text-zinc-300">
        {!sim && <span className="text-zinc-500">{t('replay.loading')}</span>}
        {sim && turnIndex === 0 && <span className="text-zinc-500">{t('replay.ready')}</span>}
        {sim && lastTurn && (
          <span>
            <span className={lastTurn.attackerSide === 0 ? 'text-sky-300' : 'text-rose-300'}>
              {lastTurn.attackerSide === 0 ? attackerName : defenderName}
            </span>
            {' '}{t('replay.slotLabel')} #{lastTurn.attackerSlot}
            {' '}{t('replay.hitVerb')}{' '}
            <span className={lastTurn.attackerSide === 0 ? 'text-rose-300' : 'text-sky-300'}>
              {lastTurn.attackerSide === 0 ? defenderName : attackerName}
            </span>
            {' '}{t('replay.slotLabel')} #{lastTurn.defenderSlot}
            {t('replay.dealtPrefix')}<span className="text-orange-300">{lastTurn.damage}</span>{t('replay.dealtSuffix')}
            {lastTurn.defenderDied && <span className="text-rose-500">{t('replay.ko')}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

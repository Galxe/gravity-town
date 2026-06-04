'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { UnitCard } from './UnitCard';
import { BattleLog } from './BattleLog';
import { useArenaStore, ArenaTurn, ArenaMatch } from '../../store/useArenaStore';
import { getUnit } from '../../lib/arenaUnits';
import { t } from '../../i18n';

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

  // Compute current HP + ATK for every slot by replaying turns up to `turnIndex`.
  // Seed from the contract's post-ON_START stats (sim.initial, via getInitialStats)
  // when available — accurate; fall back to catalog base stats for older sims.
  const { leftHp, rightHp, leftMax, rightMax, leftAtk, rightAtk } = useMemo(() => {
    const lHp: number[] = sim?.initial?.leftHp ?? attackerBench.map((u) => getUnit(u)?.hp ?? 0);
    const rHp: number[] = sim?.initial?.rightHp ?? defenderBench.map((u) => getUnit(u)?.hp ?? 0);
    const lAtk: number[] = sim?.initial?.leftAtk ?? attackerBench.map((u) => getUnit(u)?.atk ?? 0);
    const rAtk: number[] = sim?.initial?.rightAtk ?? defenderBench.map((u) => getUnit(u)?.atk ?? 0);
    const lMax = [...lHp];
    const rMax = [...rHp];
    const lHpCur = [...lHp];
    const rHpCur = [...rHp];
    // A turn's `damage` equals the attacker's current ATK (no mitigation), so
    // replaying reveals mid-combat ATK buffs (ON_HURT, ON_FRIEND_DEATH, …).
    const lAtkCur = [...lAtk];
    const rAtkCur = [...rAtk];
    if (sim) {
      const upto = Math.min(turnIndex, sim.turns.length);
      for (let i = 0; i < upto; i++) {
        const tn = sim.turns[i];
        if (tn.attackerSide === 0) {
          rHpCur[tn.defenderSlot] = Math.max(0, rHpCur[tn.defenderSlot] - tn.damage);
          lAtkCur[tn.attackerSlot] = tn.damage;
        } else {
          lHpCur[tn.defenderSlot] = Math.max(0, lHpCur[tn.defenderSlot] - tn.damage);
          rAtkCur[tn.attackerSlot] = tn.damage;
        }
      }
    }
    return {
      leftHp: lHpCur, rightHp: rHpCur,
      leftMax: lMax, rightMax: rMax,
      leftAtk: lAtkCur, rightAtk: rAtkCur,
    };
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

  const renderBench = (
    bench: number[], hpArr: number[], maxArr: number[], atkArr: number[], side: 'left' | 'right',
  ) => {
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
          atk={atkArr[i]}
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
        <div className="text-sky-300 font-semibold">⬆ {attackerName}</div>
        <div className="text-zinc-500 font-mono flex items-center gap-2">
          {paused && <span className="text-amber-400">⏸</span>}
          {t('replay.turn', { cur: Math.min(turnIndex, finishedTurns), total: finishedTurns })}
          {done && <span className="text-emerald-400">{t('replay.complete')}</span>}
        </div>
        <div className="text-rose-300 font-semibold">{defenderName} ⬇</div>
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

      {/* Battle grid — two rows: attacker on top, defender on bottom */}
      <div className="relative flex flex-col items-center justify-center gap-2 px-2 py-4 rounded-lg bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 border border-zinc-800">
        {/* Winner stamp overlay */}
        {done && sim && (() => {
          const winnerSide = sim.winnerId === match.attackerId ? 'top' : 'bottom';
          const winnerName = sim.winnerId === match.attackerId ? attackerName : defenderName;
          return (
            <div
              className={[
                'absolute inset-x-0 h-[50%] flex items-center justify-center pointer-events-none z-20',
                winnerSide === 'top' ? 'top-0' : 'bottom-0',
              ].join(' ')}
            >
              <div className="animate-arena-stamp flex flex-col items-center gap-1 select-none">
                <div className="text-5xl">🏆</div>
                <div className={[
                  'text-[11px] font-black uppercase tracking-widest px-2 py-0.5 rounded border-2',
                  'text-amber-300 border-amber-400 bg-amber-950/80',
                ].join(' ')}>
                  {winnerName}
                </div>
                <div className="text-[10px] text-amber-500 font-bold uppercase tracking-widest">{t('replay.winner')}</div>
              </div>
            </div>
          );
        })()}

        <div className="flex gap-1.5">
          {renderBench(attackerBench, leftHp, leftMax, leftAtk, 'left')}
        </div>
        <div className="py-1 text-zinc-500 text-2xl font-black">⚔</div>
        <div className="flex gap-1.5">
          {renderBench(defenderBench, rightHp, rightMax, rightAtk, 'right')}
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
          {t('replay.loading')}
        </div>
      )}
    </div>
  );
}

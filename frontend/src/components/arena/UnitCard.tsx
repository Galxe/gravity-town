'use client';

import { useEffect, useRef } from 'react';
import { getUnit, TIER_COLOR, TIER_TEXT } from '../../lib/arenaUnits';

type Props = {
  unitType: number;
  hp?: number;
  maxHp?: number;
  dead?: boolean;
  attackKey?: number;
  hitKey?: number;
  floatingDamage?: number | null;
  enterDelay?: number;
  slotIndex: number;
  side: 'left' | 'right';
};

export function UnitCard({
  unitType, hp, maxHp, dead, attackKey, hitKey, floatingDamage, enterDelay = 0, slotIndex, side,
}: Props) {
  const u = getUnit(unitType);
  const outerRef = useRef<HTMLDivElement>(null);

  // Entry animation — managed entirely via DOM, never via React className.
  // This guarantees it only plays once on mount, immune to re-renders.
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const cls = side === 'left' ? 'animate-arena-enter-left' : 'animate-arena-enter-right';
    el.style.animationDelay = enterDelay > 0 ? `${enterDelay}ms` : '';
    el.classList.add(cls);
    // Remove after animation completes so it can never replay.
    const total = enterDelay + 500;
    const tid = setTimeout(() => {
      el.classList.remove(cls);
      el.style.animationDelay = '';
    }, total);
    return () => {
      clearTimeout(tid);
      el.classList.remove(cls);
      el.style.animationDelay = '';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs exactly once per mount

  // Lunge animation via DOM when attackKey increments.
  useEffect(() => {
    if (!attackKey || !outerRef.current) return;
    const el = outerRef.current;
    const cls = side === 'left' ? 'animate-arena-attack-left' : 'animate-arena-attack-right';
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    const tid = setTimeout(() => el.classList.remove(cls), 350);
    return () => clearTimeout(tid);
  }, [attackKey, side]);

  // Hit flash via DOM when hitKey increments.
  useEffect(() => {
    if (!hitKey || !outerRef.current) return;
    const el = outerRef.current;
    el.classList.remove('animate-arena-hit');
    void el.offsetWidth;
    el.classList.add('animate-arena-hit');
    const tid = setTimeout(() => el.classList.remove('animate-arena-hit'), 500);
    return () => clearTimeout(tid);
  }, [hitKey]);

  if (!u) {
    return (
      <div className="w-[78px] h-[100px] rounded-md border border-dashed border-zinc-700 bg-zinc-900/40 flex items-center justify-center text-zinc-700 text-xs">
        empty
      </div>
    );
  }

  const showHp = hp !== undefined && maxHp !== undefined && maxHp > 0;
  const hpPct = showHp ? Math.max(0, Math.min(100, (hp! / maxHp!) * 100)) : 100;

  // React only manages dead-state and base layout — NOT animation classes.
  const outerClasses = [
    'transition-[opacity,filter,transform] duration-300',
    dead ? 'opacity-30 grayscale translate-y-5' : '',
  ].filter(Boolean).join(' ');

  const innerClasses = [
    'relative w-[78px] h-[100px] rounded-md border flex flex-col items-center justify-between p-1.5',
    TIER_COLOR[u.tier],
    side === 'right' ? 'scale-x-[-1]' : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={outerRef} className={outerClasses} title={`${u.name} — ${u.trigger}: ${u.ability}`}>
      <div className={innerClasses}>
        {floatingDamage != null && floatingDamage > 0 && (
          <span
            key={hitKey}
            className={[
              'absolute -top-6 left-1/2 -translate-x-1/2 text-red-400 font-bold text-sm',
              'pointer-events-none select-none z-10 animate-arena-damage-float',
              side === 'right' ? 'scale-x-[-1]' : '',
            ].join(' ')}
          >
            -{floatingDamage}
          </span>
        )}

        <div className={side === 'right' ? 'scale-x-[-1] flex flex-col items-center w-full' : 'flex flex-col items-center w-full'}>
          <div className={`text-[9px] uppercase tracking-wide ${TIER_TEXT[u.tier]}`}>T{u.tier}</div>
          <div className="text-2xl leading-none mt-0.5">{u.emoji}</div>
          <div className="text-[10px] mt-1 text-zinc-200 text-center font-medium leading-tight">{u.name}</div>
        </div>

        <div className={side === 'right' ? 'scale-x-[-1] w-full' : 'w-full'}>
          {showHp && (
            <div className="w-full h-[3px] rounded bg-zinc-800 overflow-hidden mb-1">
              <div
                className="h-full bg-emerald-500 transition-[width] duration-[400ms] ease-out"
                style={{ width: `${hpPct}%` }}
              />
            </div>
          )}
          <div className="flex items-center justify-between w-full text-[10px] font-mono">
            <span className="text-orange-400">⚔ {u.atk}</span>
            <span className="text-emerald-400">❤ {showHp ? Math.max(0, hp!) : u.hp}</span>
          </div>
        </div>

        <div className={`absolute top-0.5 ${side === 'left' ? 'left-0.5' : 'right-0.5'} text-[8px] text-zinc-500 ${side === 'right' ? 'scale-x-[-1]' : ''}`}>
          #{slotIndex}
        </div>
      </div>
    </div>
  );
}

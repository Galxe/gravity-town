'use client';

import { getUnit, TIER_COLOR, TIER_TEXT } from '../../lib/arenaUnits';

type Props = {
  unitType: number;
  hp?: number;              // current HP for the battle replay; defaults to base
  maxHp?: number;
  dead?: boolean;
  flashing?: 'hit' | null;
  slotIndex: number;
  side: 'left' | 'right';
};

/**
 * One bench slot. Renders the unit's emoji-sprite + atk/hp + a thin HP bar
 * when current/max diverge. Empty slots get a faint dashed outline.
 */
export function UnitCard({ unitType, hp, maxHp, dead, flashing, slotIndex, side }: Props) {
  const u = getUnit(unitType);
  if (!u) {
    return (
      <div className="w-[78px] h-[100px] rounded-md border border-dashed border-zinc-700 bg-zinc-900/40 flex items-center justify-center text-zinc-700 text-xs">
        empty
      </div>
    );
  }

  const showHp = hp !== undefined && maxHp !== undefined && maxHp > 0;
  const hpPct = showHp ? Math.max(0, Math.min(100, (hp! / maxHp!) * 100)) : 100;

  return (
    <div
      className={[
        'relative w-[78px] h-[100px] rounded-md border flex flex-col items-center justify-between p-1.5 transition-all',
        TIER_COLOR[u.tier],
        dead ? 'opacity-30 scale-90 grayscale' : '',
        flashing === 'hit' ? 'animate-arena-hit' : '',
        side === 'right' ? 'scale-x-[-1]' : '',
      ].join(' ')}
      title={`${u.name} — ${u.trigger}: ${u.ability}`}
    >
      <div className={side === 'right' ? 'scale-x-[-1] flex flex-col items-center w-full' : 'flex flex-col items-center w-full'}>
        <div className={`text-[9px] uppercase tracking-wide ${TIER_TEXT[u.tier]}`}>T{u.tier}</div>
        <div className="text-2xl leading-none mt-0.5">{u.emoji}</div>
        <div className="text-[10px] mt-1 text-zinc-200 text-center font-medium leading-tight">{u.name}</div>
      </div>
      <div className={side === 'right' ? 'scale-x-[-1] w-full' : 'w-full'}>
        {showHp && (
          <div className="w-full h-[3px] rounded bg-zinc-800 overflow-hidden mb-1">
            <div className="h-full bg-emerald-500" style={{ width: `${hpPct}%` }} />
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
  );
}

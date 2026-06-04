'use client';

import { useEffect, useState } from 'react';
import { useArenaStore } from '../../store/useArenaStore';
import { t, LOCALES } from '../../i18n';
import { useLocale } from '../../i18n/useLocale';

// Display label per locale; falls back to the upper-cased code for any locale
// added to LOCALES without an explicit label here.
const LANG_LABEL: Record<string, string> = { zh: '中', en: 'EN' };

// Tier roster: short letter (language-neutral, like ELO) + i18n full name.
const TIER_SHORT = ['B', 'S', 'G'] as const;
const TIER_NAME_KEY = ['tier.bronze', 'tier.silver', 'tier.gold'] as const;

/**
 * Top status strip:
 *  - LIVE indicator (red pulsing dot when at least one match arrived within ~5min)
 *  - Countdown to next earliest matchmaking window across all known buckets
 *  - Current concurrent (unsettled) match count
 *  - Compact ELO-bucket roster
 */
export function TopBar() {
  const matches      = useArenaStore((s) => s.matches);
  const ghosts       = useArenaStore((s) => s.ghosts);
  const nextMatchmakingAt = useArenaStore((s) => s.nextMatchmakingAt);
  const arenaAddr    = useArenaStore((s) => s.arenaEngineAddress);
  const locale       = useLocale((s) => s.locale);
  const setLocale    = useLocale((s) => s.setLocale);

  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const i = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(i);
  }, []);

  // Live? Did anything happen in the last 5 minutes?
  const recentMatch = Object.values(matches).find((m) => m.createdAt && now - m.createdAt < 300);
  const live = Boolean(recentMatch);

  const ongoing = Object.values(matches).filter((m) => !m.settled && m.attackerId > 0).length;

  // Next matchmaking ETA — soonest tier still on cooldown (computed in the hook).
  const etaSecs = nextMatchmakingAt ? Math.max(0, nextMatchmakingAt - now) : null;

  // Tier roster — count submitted ghosts per G-tier (Bronze/Silver/Gold).
  const tierCounts: [number, number, number] = [0, 0, 0];
  for (const g of Object.values(ghosts)) {
    if (!g.exists) continue;
    tierCounts[g.tier ?? 0] += 1;
  }

  return (
    <div className="w-full px-4 py-2 border-b border-zinc-800 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${live ? 'bg-rose-500 animate-pulse' : 'bg-zinc-600'}`} />
        <span className={`text-xs font-bold tracking-wider ${live ? 'text-rose-300' : 'text-zinc-500'}`}>
          {live ? t('topbar.live') : t('topbar.idle')}
        </span>
      </div>

      <div className="text-base font-bold tracking-tight">
        <span className="text-zinc-100">{t('topbar.title')}</span>
        <span className="ml-2 text-xs text-zinc-500">{t('topbar.subtitle')}</span>
      </div>

      <div className="flex-1" />

      <div className="text-xs flex items-center gap-1">
        <span className="text-zinc-500">{t('topbar.nextMatchmaking')}</span>
        <span className="text-amber-300 font-mono">
          {etaSecs === null ? '—' : t('topbar.eta', { m: Math.floor(etaSecs / 60), s: etaSecs % 60 })}
        </span>
      </div>

      <div className="text-xs flex items-center gap-1">
        <span className="text-zinc-500">{t('topbar.ongoing')}</span>
        <span className="text-emerald-300 font-mono">{ongoing}</span>
      </div>

      <div className="text-xs flex items-center gap-1">
        <span className="text-zinc-500">{t('topbar.tiers')}</span>
        <div className="flex gap-1">
          {([0, 1, 2] as const).map((tr) => (
            <span
              key={tr}
              className="px-1.5 py-[1px] rounded border border-zinc-700 bg-zinc-900 text-zinc-300 font-mono"
              title={t(TIER_NAME_KEY[tr])}
            >
              {TIER_SHORT[tr]}:{tierCounts[tr]}
            </span>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-zinc-600 font-mono truncate max-w-[170px]" title={arenaAddr ?? ''}>
        {arenaAddr ? t('topbar.arena', { addr: `${arenaAddr.slice(0, 6)}…${arenaAddr.slice(-4)}` }) : t('topbar.arenaNotDeployed')}
      </div>

      {/* Language switch */}
      <div className="flex items-center rounded border border-zinc-700 overflow-hidden text-[11px] font-medium">
        {LOCALES.map((lng) => (
          <button
            key={lng}
            onClick={() => setLocale(lng)}
            className={`px-2 py-0.5 transition-colors ${
              locale === lng
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {LANG_LABEL[lng] ?? lng.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

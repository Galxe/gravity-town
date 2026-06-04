'use client';

import { useArenaStore } from '../../store/useArenaStore';
import { getUnit, TIER_TEXT } from '../../lib/arenaUnits';
import { t } from '../../i18n';

function shortTx(h?: string): string | null {
  if (!h) return null;
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

/**
 * Right-sidebar "Inventory" tab: the focused agent's owned cards. Each row shows
 * basic info (unit, tier, stats, card id, listed flag) plus a `source` line — the
 * most recent on-chain tx that touched the card (kind + short hash).
 */
export function InventoryPanel() {
  const selectedAgentId = useArenaStore((s) => s.selectedAgentId);
  const inventories = useArenaStore((s) => s.inventories);
  const ghosts = useArenaStore((s) => s.ghosts);
  const explorerUrl = useArenaStore((s) => s.explorerUrl);

  if (!selectedAgentId) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-600 text-sm p-6 text-center">
        {t('inventory.pickAgent')}
      </div>
    );
  }

  const name = ghosts[selectedAgentId]?.agentName ?? `Agent #${selectedAgentId}`;
  const cards = inventories[selectedAgentId];

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950 flex items-baseline justify-between">
        <div className="text-base font-bold text-zinc-100 truncate">{name}</div>
        <div className="text-xs font-mono text-zinc-400 shrink-0">
          {cards ? t('inventory.count', { n: cards.length }) : '…'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cards && cards.length === 0 && (
          <div className="text-xs text-zinc-600 italic mt-6 text-center">{t('inventory.empty')}</div>
        )}
        {cards?.map((card) => {
          const u = getUnit(card.unitType);
          const unitName = t(`units.${card.unitType}.name`, undefined, u?.name ?? `#${card.unitType}`);
          const tx = shortTx(card.lastTxHash);
          return (
            <div key={card.id} className="p-2 rounded border border-zinc-800 bg-zinc-950">
              <div className="flex items-center gap-2">
                <span className="text-xl leading-none">{u?.emoji ?? '🎴'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-zinc-100 truncate">{unitName}</span>
                    {u && <span className={`text-[9px] uppercase ${TIER_TEXT[u.tier]}`}>T{u.tier}</span>}
                    {card.listed && (
                      <span className="text-[9px] px-1 rounded bg-amber-900/40 text-amber-300 border border-amber-700/50">
                        {t('inventory.listed')}
                      </span>
                    )}
                  </div>
                  {u && (
                    <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                      <span className="text-orange-400">⚔ {u.atk}</span>
                      <span className="mx-1.5 text-emerald-400">❤ {u.hp}</span>
                      <span className="text-zinc-600">#{card.id}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-1.5 text-[10px] font-mono flex items-center gap-1">
                <span className="text-zinc-600">{t('inventory.source')}:</span>
                {tx ? (
                  <>
                    <span className="text-sky-300/80">
                      {t(`inventory.kind.${card.lastTxKind}`, undefined, card.lastTxKind)}
                    </span>
                    {explorerUrl ? (
                      <a
                        href={`${explorerUrl}/tx/${card.lastTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={card.lastTxHash}
                        className="text-sky-400 hover:text-sky-300 underline decoration-dotted truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {tx} ↗
                      </a>
                    ) : (
                      <span className="text-zinc-400 truncate" title={card.lastTxHash}>{tx}</span>
                    )}
                  </>
                ) : (
                  <span className="text-zinc-700">{t('inventory.noTx')}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

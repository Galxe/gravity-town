'use client';

import { useState } from 'react';
import { AgentMindPanel } from './AgentMindPanel';
import { InventoryPanel } from './InventoryPanel';
import { t } from '../../i18n';

/** Right sidebar with two tabs over the focused agent: Mind and Inventory. */
export function RightPanel() {
  const [tab, setTab] = useState<'mind' | 'inventory'>('mind');
  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-zinc-800 bg-zinc-950">
        {(['mind', 'inventory'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={[
              'flex-1 px-3 py-2 text-[11px] uppercase tracking-widest font-semibold transition-colors',
              tab === k
                ? 'text-sky-300 border-b-2 border-sky-400 bg-zinc-900/40'
                : 'text-zinc-500 hover:text-zinc-300',
            ].join(' ')}
          >
            {t(`${k}.tab`)}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'mind' ? <AgentMindPanel /> : <InventoryPanel />}
      </div>
    </div>
  );
}

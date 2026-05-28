'use client';

import { useEffect, useState } from 'react';
import { Network } from 'lucide-react';
import { NETWORKS, getActiveNetwork, setActiveNetwork } from '../lib/networks';

// Compact chip rendered at the top of the Sidebar. Clicking expands a tiny menu
// listing the available networks. Selecting one writes localStorage and reloads
// the page so the whole ethers + Phaser stack re-initializes from scratch.
export default function NetworkPicker() {
  const [activeKey, setActiveKey] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);

  // localStorage isn't available during SSR — resolve the active network on mount.
  useEffect(() => {
    setActiveKey(getActiveNetwork()?.key);
  }, []);

  if (NETWORKS.length <= 1) return null; // nothing to choose from

  const activeLabel = NETWORKS.find((n) => n.key === activeKey)?.label
    ?? NETWORKS[0]?.label
    ?? 'Network';

  return (
    <div className="relative pointer-events-auto flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-cartoon border-2 border-wood-dark/40 bg-parchment hover:bg-parchment-dark/60 transition-colors shadow-cartoon"
      >
        <Network size={12} className="text-wood-dark" />
        <span className="text-[11px] font-bold font-cartoon text-wood-dark uppercase tracking-wide">
          {activeLabel}
        </span>
        <span className="ml-auto text-[10px] font-hand text-ink-faded">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-cartoon border-2 border-wood-dark/40 bg-parchment shadow-cartoon overflow-hidden z-20">
          {NETWORKS.map((n) => {
            const isActive = n.key === activeKey;
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!isActive) setActiveNetwork(n.key);
                }}
                className={`w-full px-2.5 py-1.5 text-left flex items-center gap-2 hover:bg-parchment-dark/60 transition-colors ${
                  isActive ? 'bg-cart-gold/15' : ''
                }`}
              >
                <span className={`text-[11px] font-bold font-cartoon uppercase ${
                  isActive ? 'text-cart-gold' : 'text-ink-soft'
                }`}>
                  {n.label}
                </span>
                <span className="ml-auto text-[9px] font-hand text-ink-faded">
                  chain {n.chain_id}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

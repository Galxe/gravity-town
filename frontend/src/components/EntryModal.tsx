'use client';

import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Entry } from '../store/useGameStore';

const COLOR_MAP: Record<string, string> = {
  cyan:   'bg-cart-cyan/15 text-cart-cyan border-cart-cyan/25',
  green:  'bg-cart-green/15 text-cart-green border-cart-green/25',
  gold:   'bg-cart-gold/15 text-cart-gold border-cart-gold/25',
  red:    'bg-cart-red/15 text-cart-red border-cart-red/25',
  blue:   'bg-cart-blue/15 text-cart-blue border-cart-blue/25',
  purple: 'bg-cart-purple/15 text-cart-purple border-cart-purple/25',
};

export default function EntryModal({ title, entries, agents, onClose, color, showAuthor }: {
  title: string;
  entries: Entry[];
  agents: Record<number, { name: string }>;
  onClose: () => void;
  color: string;
  showAuthor?: boolean;
}) {
  const colorClass = COLOR_MAP[color] || COLOR_MAP.blue;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-parchment/95 border-[3px] border-wood-dark/70 rounded-cartoon shadow-cartoon w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-wood/30 bg-parchment-dark/60 flex-shrink-0">
          <span className="text-sm font-bold font-cartoon text-wood-dark">{title}</span>
          <button onClick={onClose} className="text-ink-faded hover:text-ink p-1 rounded-lg hover:bg-wood/10">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable entries */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 cartoon-scroll space-y-2">
          {entries.length === 0 ? (
            <p className="text-sm text-ink-faded italic font-hand">Empty</p>
          ) : (
            [...entries].reverse().map((entry) => (
              <div key={entry.id} className="bg-parchment-dark/40 p-3 rounded-xl border-2 border-wood/15">
                <div className="flex items-center gap-1.5 mb-1.5">
                  {showAuthor && (
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-cartoon border ${colorClass}`}>
                      {agents[entry.authorAgent]?.name || `#${entry.authorAgent}`}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-cartoon uppercase border ${colorClass}`}>
                    {entry.category}
                  </span>
                  <span className="text-cart-gold text-[10px] ml-auto">
                    {'★'.repeat(Math.min(entry.importance, 5))}
                  </span>
                  <span className="text-[9px] font-hand text-ink-faded">#{entry.blockNumber}</span>
                </div>
                <p className="text-ink-soft font-cartoon text-[13px] leading-relaxed whitespace-pre-wrap">
                  {entry.content}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

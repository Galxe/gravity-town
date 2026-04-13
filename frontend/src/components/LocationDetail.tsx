'use client';

import { useState } from 'react';
import { useGameStore, LocationData, BoardState } from '../store/useGameStore';
import { MapPin, ScrollText } from 'lucide-react';
import { EntryList, UsageBadge } from './EntryList';
import EntryModal from './EntryModal';
import Card from './Card';

export default function LocationDetail({ location, board, agents }: {
  location: LocationData;
  board: BoardState | undefined;
  agents: Record<number, { name: string }>;
}) {
  const [showChronicle, setShowChronicle] = useState(false);

  return (
    <>
      {/* Card 1: Info */}
      <Card
        header={
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-cart-blue" />
            <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">Location</span>
          </div>
        }
      >
        <div className="p-1">
          <h3 className="text-lg font-bold font-cartoon text-ink">{location.name}</h3>
          <p className="text-xs font-hand text-ink-faded mt-1">{location.description}</p>
          <div className="text-[10px] font-hand text-ink-faded mt-1">
            Hex ({location.q}, {location.r})
          </div>

          <div className="mt-3">
            <span className="text-[10px] uppercase font-bold font-cartoon text-wood-dark">
              Agents here ({location.agentIds.length})
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {location.agentIds.map((aid) => (
                <button
                  key={aid}
                  onClick={() => useGameStore.getState().setSelectedEntity({ type: 'agent', id: aid })}
                  className="px-2 py-0.5 rounded-xl text-[11px] font-cartoon font-semibold bg-cart-purple/15 text-cart-purple border-2 border-cart-purple/25 hover:bg-cart-purple/25 transition-colors cursor-pointer"
                >
                  {agents[aid]?.name || `#${aid}`}
                </button>
              ))}
              {location.agentIds.length === 0 && (
                <span className="text-xs text-ink-faded italic font-hand">Nobody here</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Card 2: Chronicle (click to expand) */}
      <div className="flex-1 min-h-0 cursor-pointer" onClick={() => setShowChronicle(true)}>
        <Card
          className="h-full"
          header={
            <div className="flex items-center gap-2">
              <ScrollText size={13} className="text-cart-gold" />
              <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">Chronicle</span>
              <UsageBadge board={board} />
              <span className="text-[9px] font-hand text-ink-faded ml-auto">click to expand</span>
            </div>
          }
        >
          <EntryList
            entries={board?.entries || []}
            color="gold"
            agents={agents}
            showAuthor
          />
        </Card>
      </div>

      {showChronicle && (
        <EntryModal
          title={`${location.name} — Chronicle`}
          entries={board?.entries || []}
          agents={agents}
          color="gold"
          showAuthor
          onClose={() => setShowChronicle(false)}
        />
      )}
    </>
  );
}

'use client';

import { useGameStore, LocationData, BoardState } from '../store/useGameStore';
import { MapPin, ScrollText } from 'lucide-react';
import { EntryList, UsageBadge } from './EntryList';
import Card from './Card';

export default function LocationDetail({ location, board, agents }: {
  location: LocationData;
  board: BoardState | undefined;
  agents: Record<number, { name: string }>;
}) {
  return (
    <>
      {/* Card 1: Info */}
      <Card
        header={
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-blue-400" />
            <span className="text-[10px] uppercase font-bold text-slate-400">Location</span>
          </div>
        }
      >
        <div className="p-1">
          <h3 className="text-lg font-black text-white">{location.name}</h3>
          <p className="text-xs text-slate-400 mt-1">{location.description}</p>
          <div className="text-[10px] font-mono text-slate-500 mt-1">
            Hex ({location.q}, {location.r})
          </div>

          <div className="mt-3">
            <span className="text-[10px] uppercase font-bold text-slate-400">
              Agents here ({location.agentIds.length})
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {location.agentIds.map((aid) => (
                <button
                  key={aid}
                  onClick={() => useGameStore.getState().setSelectedEntity({ type: 'agent', id: aid })}
                  className="px-1.5 py-0.5 rounded text-[11px] bg-purple-500/15 text-purple-300 border border-purple-500/20 font-semibold hover:bg-purple-500/30 transition-colors cursor-pointer"
                >
                  {agents[aid]?.name || `#${aid}`}
                </button>
              ))}
              {location.agentIds.length === 0 && (
                <span className="text-xs text-slate-500 italic">Nobody here</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Card 2: Chronicle */}
      <Card
        className="flex-1 min-h-0"
        header={
          <div className="flex items-center gap-2">
            <ScrollText size={13} className="text-amber-400" />
            <span className="text-[10px] uppercase font-bold text-slate-400">Chronicle</span>
            <UsageBadge board={board} />
          </div>
        }
      >
        <EntryList
          entries={board?.entries || []}
          colorClass="bg-amber-500/15 text-amber-300 border border-amber-500/20"
          agents={agents}
          showAuthor
        />
      </Card>
    </>
  );
}

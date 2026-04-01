'use client';

import { useGameStore, Agent, BoardState } from '../store/useGameStore';
import { User, MapPin, Coins, Brain, MessageCircle } from 'lucide-react';
import { EntryList, UsageBadge } from './EntryList';
import { hexToPixel, LOCATION_SPREAD } from '../game/world/HexGrid';
import Card from './Card';

const STAT_LABELS = ['STR', 'WIS', 'CHR', 'LCK'];

export default function AgentDetail({ agent, locationName, memories, inbox, agents }: {
  agent: Agent;
  locationName: string;
  memories: BoardState | undefined;
  inbox: BoardState | undefined;
  agents: Record<number, { name: string }>;
}) {
  return (
    <>
      {/* Card 1: Profile */}
      <Card
        header={
          <div className="flex items-center gap-2">
            <User size={14} className="text-purple-400" />
            <span className="text-[10px] uppercase font-bold text-slate-400">Agent</span>
          </div>
        }
      >
        <div className="p-1">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-black text-white">{agent.name}</h3>
              <div className="text-[10px] font-mono text-slate-500">ID #{agent.id}</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-purple-500/20 border-2 border-purple-500 flex items-center justify-center font-black text-lg text-purple-200">
              {agent.name.charAt(0)}
            </div>
          </div>

          <p className="text-xs text-slate-300 italic bg-slate-800/50 p-2 rounded-md border border-slate-700/30 mt-3">
            &ldquo;{agent.personality}&rdquo;
          </p>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800/80">
              <div className="flex items-center gap-1 text-slate-400 mb-0.5">
                <MapPin size={12} />
                <span className="text-[9px] uppercase font-bold">Location</span>
              </div>
              <button
                className="text-xs font-semibold text-blue-300 truncate hover:text-blue-200 cursor-pointer"
                onClick={() => {
                  const { locations, setSelectedEntity, setFocusTarget } = useGameStore.getState();
                  const loc = locations[agent.location];
                  if (loc) {
                    setSelectedEntity({ type: 'location', id: loc.id });
                    const { x, y } = hexToPixel(loc.q * LOCATION_SPREAD, loc.r * LOCATION_SPREAD);
                    setFocusTarget({ x, y, zoom: 'far' });
                  }
                }}
              >
                {locationName}
              </button>
            </div>
            <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800/80 relative overflow-hidden">
              <div className="absolute inset-0 bg-yellow-500/5" />
              <div className="flex items-center gap-1 text-slate-400 mb-0.5 relative">
                <Coins size={12} className="text-yellow-500" />
                <span className="text-[9px] uppercase font-bold text-yellow-500/80">Wealth</span>
              </div>
              <div className="text-xs font-black text-yellow-400 relative">
                {agent.gold} <span className="text-[9px] text-yellow-600">G</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 mt-3">
            {STAT_LABELS.map((label, i) => (
              <div key={label} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-mono w-7">{label}</span>
                <div className="flex-1 mx-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${(agent.stats[i] / 10) * 100}%` }} />
                </div>
                <span className="text-slate-300 font-bold w-4 text-right">{agent.stats[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Card 2: Memories */}
      <Card
        className="flex-1 min-h-0"
        header={
          <div className="flex items-center gap-2">
            <Brain size={13} className="text-cyan-400" />
            <span className="text-[10px] uppercase font-bold text-slate-400">Memories</span>
            <UsageBadge board={memories} />
          </div>
        }
      >
        <EntryList
          entries={memories?.entries || []}
          colorClass="bg-cyan-500/15 text-cyan-300 border border-cyan-500/20"
          agents={agents}
        />
      </Card>

      {/* Card 3: Inbox */}
      <Card
        className="flex-1 min-h-0"
        header={
          <div className="flex items-center gap-2">
            <MessageCircle size={13} className="text-emerald-400" />
            <span className="text-[10px] uppercase font-bold text-slate-400">Inbox</span>
            <UsageBadge board={inbox} />
          </div>
        }
      >
        <EntryList
          entries={inbox?.entries || []}
          colorClass="bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
          agents={agents}
          showAuthor
        />
      </Card>
    </>
  );
}

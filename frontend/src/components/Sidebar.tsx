'use client';

import { useGameStore } from '../store/useGameStore';
import { Activity } from 'lucide-react';
import { PALETTE } from '../game/constants';
import { hexToPixel, LOCATION_SPREAD } from '../game/world/HexGrid';
import Card from './Card';

export default function Sidebar() {
  const agents = useGameStore((s) => s.agents);
  const locations = useGameStore((s) => s.locations);
  const locationBoards = useGameStore((s) => s.locationBoards);
  const selectedEntity = useGameStore((s) => s.selectedEntity);
  const setSelectedEntity = useGameStore((s) => s.setSelectedEntity);
  const setFocusTarget = useGameStore((s) => s.setFocusTarget);

  const locArray = Object.values(locations);
  const agentArray = Object.values(agents);

  const agentsByLoc: Record<number, typeof agentArray> = {};
  for (const a of agentArray) {
    if (!agentsByLoc[a.location]) agentsByLoc[a.location] = [];
    agentsByLoc[a.location].push(a);
  }

  const allLocationEntries = Object.values(locationBoards).flatMap((b) => b.entries);
  const sortedEvents = [...allLocationEntries].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);

  const selectLocation = (locId: number) => {
    setSelectedEntity({ type: 'location', id: locId });
    const loc = locations[locId];
    if (loc) {
      const { x, y } = hexToPixel(loc.q * LOCATION_SPREAD, loc.r * LOCATION_SPREAD);
      setFocusTarget({ x, y, zoom: 'far' });
    }
  };

  const selectAgent = (agentId: number) => {
    setSelectedEntity({ type: 'agent', id: agentId });
    const agent = agents[agentId];
    if (agent) {
      const loc = locations[agent.location];
      if (loc) {
        const { x, y } = hexToPixel(loc.q * LOCATION_SPREAD, loc.r * LOCATION_SPREAD);
        setFocusTarget({ x, y, zoom: 'far' });
      }
    }
  };

  return (
    <div className="absolute left-0 top-0 bottom-0 w-72 p-3 flex flex-col gap-3 pointer-events-none" style={{ zIndex: 10 }}>
      {/* Card 1: Locations & Agents */}
      <Card
        className="max-h-[40%]"
        header={
          <>
            <h1 className="text-base font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
              GRAVITY TOWN
            </h1>
            <p className="text-[10px] font-mono text-slate-500 mt-0.5">
              {agentArray.length} agents &middot; {locArray.length} locations
            </p>
          </>
        }
      >
        <div className="space-y-0.5">
          {locArray.map((loc) => {
            const color = PALETTE[loc.id % PALETTE.length];
            const locAgents = agentsByLoc[loc.id] || [];
            const isLocSelected = selectedEntity?.type === 'location' && selectedEntity.id === loc.id;

            return (
              <div key={loc.id}>
                <button
                  onClick={() => selectLocation(loc.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                    isLocSelected ? 'bg-slate-700/60' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-xs font-semibold text-slate-200 truncate flex-1">{loc.name}</span>
                  <span className="text-[10px] font-mono text-slate-500">{locAgents.length}</span>
                </button>

                {locAgents.length > 0 && (
                  <div className="ml-5 border-l border-slate-800/60 pl-2 space-y-0.5 mb-0.5">
                    {locAgents.map((agent) => {
                      const isAgentSelected = selectedEntity?.type === 'agent' && selectedEntity.id === agent.id;
                      return (
                        <button
                          key={agent.id}
                          onClick={() => selectAgent(agent.id)}
                          className={`w-full flex items-center gap-1.5 px-2 py-0.5 rounded text-left transition-colors ${
                            isAgentSelected ? 'bg-slate-700/50' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />
                          <span className="text-[11px] text-slate-300 truncate flex-1">{agent.name}</span>
                          <span className="text-[9px] font-mono text-yellow-500/60">{agent.gold}g</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Card 2: World Events */}
      <Card
        className="flex-1 min-h-0"
        header={
          <div className="flex items-center gap-2">
            <Activity size={13} className="text-blue-400" />
            <span className="text-[10px] uppercase font-bold text-slate-400">World Events</span>
          </div>
        }
      >
        <div className="space-y-1">
          {sortedEvents.length === 0 ? (
            <p className="text-xs text-slate-500 italic px-1">(No events yet...)</p>
          ) : (
            sortedEvents.map((entry) => (
              <div key={entry.id} className="text-xs px-1 pb-1.5 border-b border-slate-800/40 last:border-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="px-1 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {entry.category}
                  </span>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {agents[entry.authorAgent]?.name || `#${entry.authorAgent}`}
                  </span>
                </div>
                <p className="text-slate-300 leading-snug">{entry.content}</p>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Status bar */}
      <div className="rounded-lg bg-slate-900/85 border border-slate-700/50 backdrop-blur-md px-3 py-2 flex items-center gap-2 pointer-events-auto">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-mono text-emerald-300/70">ON-CHAIN SYNCED</span>
      </div>
    </div>
  );
}

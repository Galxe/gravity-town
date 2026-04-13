'use client';

import { useState } from 'react';
import { useGameStore, Entry } from '../store/useGameStore';
import { Activity, Trophy, Swords } from 'lucide-react';
import { PALETTE } from '../game/constants';
import { hexToPixel, LOCATION_SPREAD } from '../game/world/HexGrid';
import Card from './Card';
import EntryModal from './EntryModal';

const COMBAT_CATEGORIES = new Set([
  'attack_sent', 'attack_received', 'settlement', 'combat', 'battle',
]);

export default function Sidebar() {
  const [expandedPanel, setExpandedPanel] = useState<'combat' | 'events' | null>(null);
  const agents = useGameStore((s) => s.agents);
  const locations = useGameStore((s) => s.locations);
  const locationBoards = useGameStore((s) => s.locationBoards);
  const memories = useGameStore((s) => s.memories);
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

  const scoreboard = [...agentArray].sort((a, b) => b.score - a.score);

  const allLocationEntries = Object.values(locationBoards).flatMap((b) => b.entries);
  const sortedEvents = [...allLocationEntries].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30);

  const allMemoryEntries = Object.values(memories).flatMap((b) => b.entries);
  const combatEntries = [...allMemoryEntries, ...allLocationEntries]
    .filter((e) => COMBAT_CATEGORIES.has(e.category))
    .sort((a, b) => b.timestamp - a.timestamp);
  const seenIds = new Set<number>();
  const combatLog: Entry[] = [];
  for (const e of combatEntries) {
    if (!seenIds.has(e.id)) {
      seenIds.add(e.id);
      combatLog.push(e);
    }
    if (combatLog.length >= 20) break;
  }

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
        className="max-h-[30%]"
        header={
          <>
            <h1 className="text-base font-bold tracking-tight font-cartoon text-wood-dark">
              Gravity Town
            </h1>
            <p className="text-[10px] font-hand text-ink-faded mt-0.5">
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
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-left transition-colors ${
                    isLocSelected ? 'bg-wood-light/30' : 'hover:bg-parchment-dark/60'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 border-2 border-wood/40" style={{ backgroundColor: color }} />
                  <span className="text-[9px] font-hand text-ink-faded w-4">#{loc.id}</span>
                  <span className="text-xs font-semibold font-cartoon text-ink-soft truncate flex-1">{loc.name}</span>
                  <span className="text-[10px] font-hand text-ink-faded">{locAgents.length}</span>
                </button>

                {locAgents.length > 0 && (
                  <div className="ml-5 border-l-2 border-wood/20 pl-2 space-y-0.5 mb-0.5">
                    {locAgents.map((agent) => {
                      const isAgentSelected = selectedEntity?.type === 'agent' && selectedEntity.id === agent.id;
                      return (
                        <button
                          key={agent.id}
                          onClick={() => selectAgent(agent.id)}
                          className={`w-full flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-left transition-colors ${
                            isAgentSelected ? 'bg-wood-light/25' : 'hover:bg-parchment-dark/40'
                          }`}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-cart-green flex-shrink-0" />
                          <span className="text-[9px] font-hand text-ink-faded w-4">#{agent.id}</span>
                          <span className="text-[11px] font-cartoon text-ink-soft truncate flex-1">{agent.name}</span>
                          <span className="text-[9px] font-hand text-cart-gold">{agent.score}pt</span>
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

      {/* Card 2: Scoreboard */}
      <Card
        header={
          <div className="flex items-center gap-2">
            <Trophy size={13} className="text-cart-gold" />
            <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">Scoreboard</span>
          </div>
        }
      >
        {scoreboard.length === 0 ? (
          <p className="text-xs text-ink-faded italic px-1 font-hand">(No agents yet)</p>
        ) : (
          <div className="space-y-0.5">
            {scoreboard.map((agent, rank) => (
              <button
                key={agent.id}
                onClick={() => selectAgent(agent.id)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left hover:bg-parchment-dark/50 transition-colors"
              >
                <span className={`text-[10px] font-bold font-cartoon w-4 text-right ${
                  rank === 0 ? 'text-cart-gold' : rank === 1 ? 'text-ink-faded' : rank === 2 ? 'text-wood-light' : 'text-ink-faded'
                }`}>
                  {rank + 1}
                </span>
                <span className="text-[9px] font-hand text-ink-faded w-4">#{agent.id}</span>
                <span className="text-[11px] font-cartoon text-ink-soft truncate flex-1">{agent.name}</span>
                <div className="flex items-center gap-2 text-[9px] font-hand">
                  <span className="text-cart-green">{agent.hexCount}h</span>
                  <span className="text-cart-gold font-bold">{agent.score}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Card 3: Combat Log (click to expand) */}
      {combatLog.length > 0 && (
        <div className="max-h-[25%] cursor-pointer" onClick={() => setExpandedPanel('combat')}>
          <Card
            className="h-full"
            header={
              <div className="flex items-center gap-2">
                <Swords size={13} className="text-cart-red" />
                <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">Combat Log</span>
                <span className="text-[9px] font-hand text-ink-faded">{combatLog.length}</span>
                <span className="text-[9px] font-hand text-ink-faded ml-auto">click to expand</span>
              </div>
            }
          >
            <div className="space-y-1">
              {combatLog.map((entry) => (
                <div key={entry.id} className="text-xs px-1 pb-1.5 border-b border-wood/15 last:border-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="px-1.5 py-0.5 rounded-lg text-[9px] font-bold font-cartoon uppercase bg-cart-red/15 text-cart-red border border-cart-red/25">
                      {entry.category}
                    </span>
                    <span className="text-ink-faded font-hand text-[10px]">
                      {agents[entry.authorAgent]?.name || `#${entry.authorAgent}`}
                    </span>
                  </div>
                  <p className="text-ink-soft leading-snug font-cartoon text-[11px]">{entry.content}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Card 4: World Events (click to expand) */}
      <div className="flex-1 min-h-0 cursor-pointer" onClick={() => setExpandedPanel('events')}>
        <Card
          className="h-full"
          header={
            <div className="flex items-center gap-2">
              <Activity size={13} className="text-cart-blue" />
              <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">World Events</span>
              <span className="text-[9px] font-hand text-ink-faded ml-auto">click to expand</span>
            </div>
          }
        >
          <div className="space-y-1">
            {sortedEvents.length === 0 ? (
              <p className="text-xs text-ink-faded italic px-1 font-hand">(No events yet...)</p>
            ) : (
              sortedEvents.map((entry) => (
                <div key={entry.id} className="text-xs px-1 pb-1.5 border-b border-wood/15 last:border-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="px-1.5 py-0.5 rounded-lg text-[9px] font-bold font-cartoon uppercase bg-cart-blue/15 text-cart-blue border border-cart-blue/25">
                      {entry.category}
                    </span>
                    <span className="text-ink-faded font-hand text-[10px]">
                      {agents[entry.authorAgent]?.name || `#${entry.authorAgent}`}
                    </span>
                  </div>
                  <p className="text-ink-soft leading-snug font-cartoon text-[11px]">{entry.content}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Expanded modals */}
      {expandedPanel === 'combat' && (
        <EntryModal
          title="Combat Log"
          entries={combatLog}
          agents={agents}
          color="red"
          showAuthor
          onClose={() => setExpandedPanel(null)}
        />
      )}
      {expandedPanel === 'events' && (
        <EntryModal
          title="World Events"
          entries={sortedEvents}
          agents={agents}
          color="blue"
          showAuthor
          onClose={() => setExpandedPanel(null)}
        />
      )}

      {/* Status bar */}
      <div className="rounded-cartoon bg-parchment/90 border-[3px] border-wood-dark/70 shadow-cartoon-sm px-3 py-2 flex items-center gap-2 pointer-events-auto">
        <div className="w-2 h-2 rounded-full bg-cart-green animate-pulse" />
        <span className="text-[10px] font-cartoon font-semibold text-cart-green">ON-CHAIN SYNCED</span>
      </div>
    </div>
  );
}

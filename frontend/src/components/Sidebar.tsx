'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore, Entry } from '../store/useGameStore';
import { BookOpen, Trophy, Swords, ScrollText, MessageSquareQuote, Crown } from 'lucide-react';
import { PALETTE } from '../game/constants';
import { hexToPixel, LOCATION_SPREAD } from '../game/world/HexGrid';
import Card from './Card';
import EntryModal from './EntryModal';
import { formatNarrative, timeAgo, reputationLabel, type NarrativeEvent } from '../utils/narrativeFormat';

const COMBAT_CATEGORIES = new Set([
  'attack_sent', 'attack_received', 'settlement', 'combat', 'battle',
]);

const NARRATIVE_COLOR_MAP: Record<string, string> = {
  red:    'border-cart-red/30 bg-cart-red/5',
  blue:   'border-cart-blue/30 bg-cart-blue/5',
  gold:   'border-cart-gold/30 bg-cart-gold/5',
  green:  'border-cart-green/30 bg-cart-green/5',
  purple: 'border-cart-purple/30 bg-cart-purple/5',
  cyan:   'border-cart-cyan/30 bg-cart-cyan/5',
};

function NarrativeEntry({ event, expanded }: { event: NarrativeEvent; expanded?: boolean }) {
  const colorClass = NARRATIVE_COLOR_MAP[event.color] || NARRATIVE_COLOR_MAP.blue;
  return (
    <div className={`px-2 py-1.5 rounded-xl border-l-[3px] ${colorClass} ${expanded ? 'mb-2' : ''}`}>
      <div className="flex items-start gap-1.5">
        <span className="text-sm flex-shrink-0 leading-none mt-0.5">{event.icon}</span>
        <p className={`font-hand text-ink-soft leading-snug flex-1 ${expanded ? 'text-sm' : 'text-[11px]'}`}>
          {event.narrative}
        </p>
      </div>
      <div className="flex items-center gap-2 mt-0.5 ml-5">
        <span className="text-[8px] font-hand text-ink-faded">{timeAgo(event.timestamp)}</span>
        {event.importance >= 7 && (
          <span className="text-[8px] text-cart-gold">{'\u2605'.repeat(Math.min(event.importance - 5, 5))}</span>
        )}
      </div>
    </div>
  );
}

function BibleModal({ entries, agents, onClose }: {
  entries: Entry[];
  agents: Record<number, { name: string }>;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;
  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999 }}
      onClick={(e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-parchment border-[3px] border-cart-gold/60 rounded-cartoon shadow-cartoon p-5 w-[700px] max-w-[92vw] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-cart-gold/30">
          <div className="flex items-center gap-2">
            <Crown size={18} className="text-cart-gold" />
            <h2 className="text-lg font-bold font-cartoon text-ink">The World Bible of Gravity Town</h2>
          </div>
          <button onClick={onClose} className="text-ink-faded hover:text-ink text-lg font-bold">&times;</button>
        </div>
        <div className="overflow-y-auto cartoon-scroll space-y-6 pr-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-ink-faded italic font-hand text-center py-8">
              The sacred text awaits its first author. Only the most renowned agent may write...
            </p>
          ) : (
            sorted.map((entry, idx) => {
              const authorName = agents[entry.authorAgent]?.name || `Agent #${entry.authorAgent}`;
              return (
                <div key={entry.id} className="bg-cart-gold/5 rounded-xl border-2 border-cart-gold/20 p-4">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-cart-gold/15">
                    <Crown size={14} className="text-cart-gold" />
                    <span className="text-sm font-bold font-cartoon text-cart-gold">Chapter {idx + 1}</span>
                    <span className="text-[9px] font-hand text-ink-faded ml-auto">
                      by {authorName} &middot; {timeAgo(entry.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm font-hand text-ink-soft leading-relaxed indent-4 whitespace-pre-line">
                    {entry.content}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ChronicleModal({ chroniclesByAgent, agents, onClose }: {
  chroniclesByAgent: { agentId: number; name: string; entries: Entry[]; score: number }[];
  agents: Record<number, { name: string }>;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999 }}
      onClick={(e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-parchment border-[3px] border-wood-dark rounded-cartoon shadow-cartoon p-5 w-[700px] max-w-[92vw] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-wood/30">
          <div className="flex items-center gap-2">
            <ScrollText size={18} className="text-cart-purple" />
            <h2 className="text-lg font-bold font-cartoon text-ink">The Chronicles of Gravity Town</h2>
          </div>
          <button onClick={onClose} className="text-ink-faded hover:text-ink text-lg font-bold">&times;</button>
        </div>
        <div className="overflow-y-auto cartoon-scroll space-y-6 pr-2">
          {chroniclesByAgent.length === 0 ? (
            <p className="text-sm text-ink-faded italic font-hand text-center py-8">
              The pages are blank. No agent has yet earned a place in history...
            </p>
          ) : (
            chroniclesByAgent.map(({ agentId, name, entries, score }) => {
              const rep = reputationLabel(score);
              return (
                <div key={agentId} className="bg-parchment-dark/30 rounded-xl border-2 border-wood/20 p-4">
                  {/* Agent header */}
                  <div className="flex items-center gap-3 mb-3 pb-2 border-b border-wood/15">
                    <div className="w-10 h-10 rounded-full bg-cart-purple/20 border-[3px] border-cart-purple flex items-center justify-center font-bold text-lg font-cartoon text-cart-purple">
                      {name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold font-cartoon text-ink">{name}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold font-cartoon ${rep.color}`}>{rep.text}</span>
                        <span className="text-[9px] font-hand text-ink-faded">&middot;</span>
                        <span className={`text-[10px] font-bold font-cartoon ${score > 0 ? 'text-cart-green' : score < 0 ? 'text-cart-red' : 'text-ink-faded'}`}>
                          Score: {score > 0 ? '+' : ''}{score}
                        </span>
                        <span className="text-[9px] font-hand text-ink-faded">&middot;</span>
                        <span className="text-[9px] font-hand text-ink-faded">{entries.length} chapter{entries.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>

                  {/* Biography — flowing narrative */}
                  <div className="space-y-3">
                    {entries.map((entry, idx) => {
                      const writerName = entry.relatedAgents[0]
                        ? (agents[entry.relatedAgents[0]]?.name || `#${entry.relatedAgents[0]}`)
                        : 'an unknown scribe';
                      const stars = '\u2605'.repeat(Math.min(entry.importance, 5));
                      return (
                        <div key={entry.id}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-bold font-cartoon text-cart-purple uppercase">Chapter {idx + 1}</span>
                            <span className="text-[9px] text-cart-gold">{stars}</span>
                            <span className="text-[8px] font-hand text-ink-faded ml-auto">
                              recorded by {writerName} &middot; {timeAgo(entry.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm font-hand text-ink-soft leading-relaxed indent-4">
                            {entry.content}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NarrativeModal({ title, events, onClose }: {
  title: string;
  events: NarrativeEvent[];
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999 }}
      onClick={(e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-parchment border-[3px] border-wood-dark rounded-cartoon shadow-cartoon p-4 w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-wood/30">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-cart-gold" />
            <h2 className="text-base font-bold font-cartoon text-ink">{title}</h2>
          </div>
          <button onClick={onClose} className="text-ink-faded hover:text-ink text-lg font-bold">&times;</button>
        </div>
        <div className="overflow-y-auto cartoon-scroll space-y-1 pr-1">
          {events.length === 0 ? (
            <p className="text-sm text-ink-faded italic font-hand">The chronicles are empty...</p>
          ) : (
            events.map((ev) => <NarrativeEntry key={ev.id} event={ev} expanded />)
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function Sidebar() {
  const [expandedPanel, setExpandedPanel] = useState<'combat' | 'events' | 'debates' | 'chronicles' | 'bible' | null>(null);
  const agents = useGameStore((s) => s.agents);
  const locations = useGameStore((s) => s.locations);
  const locationBoards = useGameStore((s) => s.locationBoards);
  const memories = useGameStore((s) => s.memories);
  const chronicles = useGameStore((s) => s.chronicles);
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

  // Build narrative events from all location board entries
  const narrativeEvents: NarrativeEvent[] = sortedEvents
    .map((e) => formatNarrative(e, agents))
    .sort((a, b) => b.timestamp - a.timestamp);

  // Debate entries (from location boards: category = debate/support/oppose)
  const DEBATE_CATEGORIES = new Set(['debate', 'support', 'oppose']);
  const debateEntries = allLocationEntries
    .filter((e) => DEBATE_CATEGORIES.has(e.category))
    .sort((a, b) => b.timestamp - a.timestamp);

  // Chronicle entries (from EvaluationLedger — separate from memories)
  const evaluations = useGameStore((s) => s.evaluations);
  const worldBible = useGameStore((s) => s.worldBible);
  const allChronicleEntries = Object.values(evaluations)
    .flatMap((b) => b.entries)
    .sort((a, b) => b.timestamp - a.timestamp);

  // Group chronicle entries by subject agent (authorAgent is the subject in AgentLedger)
  const chronicleMap = new Map<number, Entry[]>();
  for (const e of allChronicleEntries) {
    const subjectId = e.authorAgent; // In AgentLedger, authorAgent is the subject agent
    if (!chronicleMap.has(subjectId)) chronicleMap.set(subjectId, []);
    chronicleMap.get(subjectId)!.push(e);
  }
  const chroniclesByAgent = Array.from(chronicleMap.entries()).map(([agentId, entries]) => ({
    agentId,
    name: agents[agentId]?.name || `Agent #${agentId}`,
    entries: entries.sort((a, b) => a.timestamp - b.timestamp), // chronological for biography
    score: chronicles[agentId]?.score ?? 0,
  }));

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

      {/* Card 3: Active Debates */}
      <div className="max-h-[18%] cursor-pointer" onClick={() => setExpandedPanel('debates')}>
        <Card
          header={
            <div className="flex items-center gap-2">
              <MessageSquareQuote size={13} className="text-cart-gold" />
              <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">Debates</span>
              {debateEntries.length > 0 && (
                <span className="text-[9px] font-hand text-cart-gold">{debateEntries.length}</span>
              )}
              <span className="text-[9px] font-hand text-ink-faded ml-auto">click to expand</span>
            </div>
          }
        >
          {debateEntries.length === 0 ? (
            <p className="text-xs text-ink-faded italic px-1 font-hand">No debates yet...</p>
          ) : (
            <div className="space-y-1">
              {debateEntries.slice(0, 5).map((entry) => {
                const authorName = agents[entry.authorAgent]?.name || `#${entry.authorAgent}`;
                const isDebate = entry.category === 'debate';
                const isSupport = entry.category === 'support';
                return (
                  <div key={entry.id} className={`px-2 py-1.5 rounded-xl border-l-[3px] ${
                    isDebate ? 'border-cart-gold/40 bg-cart-gold/5' :
                    isSupport ? 'border-cart-green/40 bg-cart-green/5' :
                    'border-cart-red/40 bg-cart-red/5'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{isDebate ? '\u{1F4DC}' : isSupport ? '\u2714' : '\u2718'}</span>
                      <span className={`text-[9px] font-bold font-cartoon uppercase ${
                        isDebate ? 'text-cart-gold' : isSupport ? 'text-cart-green' : 'text-cart-red'
                      }`}>{entry.category}</span>
                      <span className="text-[9px] font-hand text-ink-faded">{authorName}</span>
                      <span className="text-[8px] font-hand text-ink-faded ml-auto">{timeAgo(entry.timestamp)}</span>
                    </div>
                    <p className="text-[10px] font-hand text-ink-soft leading-snug mt-0.5 ml-5">
                      &ldquo;{entry.content.length > 70 ? entry.content.slice(0, 70) + '\u2026' : entry.content}&rdquo;
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Card 4: Chronicles (per-agent biographies) */}
      <div className="max-h-[20%] cursor-pointer" onClick={() => setExpandedPanel('chronicles')}>
        <Card
          header={
            <div className="flex items-center gap-2">
              <ScrollText size={13} className="text-cart-purple" />
              <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">Chronicles</span>
              {allChronicleEntries.length > 0 && (
                <span className="text-[9px] font-hand text-cart-purple">{allChronicleEntries.length} entries</span>
              )}
              <span className="text-[9px] font-hand text-ink-faded ml-auto">click to expand</span>
            </div>
          }
        >
          {chroniclesByAgent.length === 0 ? (
            <p className="text-xs text-ink-faded italic px-1 font-hand">No chronicles written yet...</p>
          ) : (
            <div className="space-y-2">
              {chroniclesByAgent.slice(0, 3).map(({ agentId, name, entries, score }) => (
                <div key={agentId} className="bg-cart-purple/5 rounded-xl border border-cart-purple/20 p-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">{'\u{1F4D6}'}</span>
                    <span className="text-[11px] font-bold font-cartoon text-cart-purple">{name}</span>
                    <span className={`text-[9px] font-bold font-cartoon ml-auto ${score > 0 ? 'text-cart-green' : score < 0 ? 'text-cart-red' : 'text-ink-faded'}`}>
                      {score > 0 ? '+' : ''}{score}
                    </span>
                  </div>
                  <p className="text-[10px] font-hand text-ink-soft leading-snug italic">
                    &ldquo;{entries[0].content.length > 120 ? entries[0].content.slice(0, 120) + '\u2026' : entries[0].content}&rdquo;
                  </p>
                  {entries.length > 1 && (
                    <span className="text-[8px] font-hand text-ink-faded">+ {entries.length - 1} more chapters</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Card 5: World Events (narrative feed) */}
      <div className="flex-1 min-h-0 cursor-pointer" onClick={() => setExpandedPanel('events')}>
        <Card
          className="h-full"
          header={
            <div className="flex items-center gap-2">
              <BookOpen size={13} className="text-cart-cyan" />
              <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">World Events</span>
              <span className="text-[9px] font-hand text-ink-faded ml-auto">click to expand</span>
            </div>
          }
        >
          <div className="space-y-0.5">
            {narrativeEvents.length === 0 ? (
              <p className="text-xs text-ink-faded italic px-1 font-hand">(No events yet...)</p>
            ) : (
              narrativeEvents.slice(0, 10).map((ev) => (
                <NarrativeEntry key={ev.id} event={ev} />
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Card 6: World Bible (bottom — the sacred text) */}
      <div className="max-h-[15%] cursor-pointer" onClick={() => setExpandedPanel('bible')}>
        <Card
          header={
            <div className="flex items-center gap-2">
              <Crown size={13} className="text-cart-gold" />
              <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">World Bible</span>
              {worldBible && worldBible.entries.length > 0 && (
                <span className="text-[9px] font-hand text-cart-gold">{worldBible.entries.length} chapters</span>
              )}
              <span className="text-[9px] font-hand text-ink-faded ml-auto">click to expand</span>
            </div>
          }
        >
          {!worldBible || worldBible.entries.length === 0 ? (
            <p className="text-xs text-ink-faded italic px-1 font-hand">The sacred text awaits its first author...</p>
          ) : (
            <div className="space-y-1">
              {worldBible.entries.slice(-2).reverse().map((entry) => (
                <div key={entry.id} className="px-2 py-1.5 rounded-xl border-l-[3px] border-cart-gold/50 bg-cart-gold/5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Crown size={10} className="text-cart-gold" />
                    <span className="text-[9px] font-bold font-cartoon text-cart-gold">
                      {agents[entry.authorAgent]?.name || `#${entry.authorAgent}`}
                    </span>
                    <span className="text-[8px] font-hand text-ink-faded ml-auto">{timeAgo(entry.timestamp)}</span>
                  </div>
                  <p className="text-[10px] font-hand text-ink-soft leading-snug italic">
                    {entry.content.length > 150 ? entry.content.slice(0, 150) + '\u2026' : entry.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Expanded modals */}
      {expandedPanel === 'debates' && (
        <EntryModal
          title="Debates"
          entries={debateEntries}
          agents={agents}
          color="gold"
          showAuthor
          onClose={() => setExpandedPanel(null)}
        />
      )}
      {expandedPanel === 'chronicles' && (
        <ChronicleModal
          chroniclesByAgent={chroniclesByAgent}
          agents={agents}
          onClose={() => setExpandedPanel(null)}
        />
      )}
      {expandedPanel === 'bible' && worldBible && (
        <BibleModal
          entries={worldBible.entries}
          agents={agents}
          onClose={() => setExpandedPanel(null)}
        />
      )}
      {expandedPanel === 'events' && (
        <NarrativeModal
          title="World Events"
          events={narrativeEvents}
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

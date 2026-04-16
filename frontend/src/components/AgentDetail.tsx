'use client';

import { useGameStore, Agent, BoardState, HexData } from '../store/useGameStore';
import { User, MapPin, Brain, MessageCircle, Shield, Pickaxe, Trophy, Map, BookOpen } from 'lucide-react';
import { useState } from 'react';
import { EntryList, UsageBadge } from './EntryList';
import EntryModal from './EntryModal';
import { hexToPixel, LOCATION_SPREAD } from '../game/world/HexGrid';
import Card from './Card';
import { reputationLabel } from '../utils/narrativeFormat';

const STAT_LABELS = ['STR', 'WIS', 'CHR', 'LCK'];
const STAT_COLORS = ['bg-cart-red', 'bg-cart-blue', 'bg-cart-pink', 'bg-cart-gold'];

function HexTerritoryPanel({ hexes }: { hexes: HexData[] }) {
  const avgHappiness = hexes.length > 0 ? Math.round(hexes.reduce((s, h) => s + h.happiness, 0) / hexes.length) : 0;
  const totalReserve = hexes.reduce((s, h) => s + h.reserve, 0);
  const totalMines = hexes.reduce((s, h) => s + h.mineCount, 0);
  const totalArsenals = hexes.reduce((s, h) => s + h.arsenalCount, 0);
  const totalDefense = hexes.reduce((s, h) => s + h.defense, 0);

  return (
    <Card
      header={
        <div className="flex items-center gap-2">
          <Map size={13} className="text-cart-gold" />
          <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">Territory</span>
          <span className="text-[9px] font-hand text-ink-faded ml-auto">
            {hexes.length} hex{hexes.length !== 1 ? 'es' : ''}
          </span>
        </div>
      }
    >
      {/* Summary */}
      <div className="grid grid-cols-4 gap-1.5 px-1 mb-2">
        <div className="bg-parchment-dark/50 p-1.5 rounded-xl border-2 border-wood/20 text-center">
          <div className="text-[8px] uppercase font-cartoon font-semibold text-wood-light">Happy</div>
          <div className={`text-[11px] font-bold font-cartoon ${avgHappiness > 30 ? 'text-cart-green' : 'text-cart-red'}`}>{avgHappiness}%</div>
          <div className="text-[7px] font-hand text-ink-faded">avg</div>
        </div>
        <div className="bg-parchment-dark/50 p-1.5 rounded-xl border-2 border-wood/20 text-center">
          <div className="text-[8px] uppercase font-cartoon font-semibold text-wood-light">Reserve</div>
          <div className={`text-[11px] font-bold font-cartoon ${totalReserve > 0 ? 'text-cart-cyan' : 'text-cart-red'}`}>{totalReserve}</div>
          <div className="text-[7px] font-hand text-ink-faded">{totalReserve > 0 ? 'active' : 'depleted'}</div>
        </div>
        <div className="bg-parchment-dark/50 p-1.5 rounded-xl border-2 border-wood/20 text-center">
          <div className="text-[8px] uppercase font-cartoon font-semibold text-wood-light">Mines</div>
          <div className="text-[11px] font-bold font-cartoon text-cart-green">{totalMines}</div>
        </div>
        <div className="bg-parchment-dark/50 p-1.5 rounded-xl border-2 border-wood/20 text-center">
          <div className="text-[8px] uppercase font-cartoon font-semibold text-wood-light">Defense</div>
          <div className="text-[11px] font-bold font-cartoon text-cart-blue">{totalDefense}</div>
          <div className="text-[7px] font-hand text-ink-faded">{totalArsenals} arsenals</div>
        </div>
      </div>

      {/* Per-hex list (scrollable) */}
      <div className="space-y-1 px-1 max-h-24 overflow-y-auto cartoon-scroll">
        {hexes.map((h) => (
          <div key={h.hexKey} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-parchment-dark/30 border border-wood/15 text-[10px]">
            <span className="text-ink-faded font-hand w-12">({h.q},{h.r})</span>
            <div className="flex items-center gap-1 flex-1">
              <Pickaxe size={9} className="text-cart-gold" />
              <span className="text-ink-soft font-cartoon">{h.mineCount}</span>
              <Shield size={9} className="text-cart-blue ml-1" />
              <span className="text-ink-soft font-cartoon">{h.arsenalCount}</span>
            </div>
            <span className={`font-hand ${h.happiness > 30 ? 'text-cart-green' : 'text-cart-red'}`}>{h.happiness}hp</span>
            <span className={`font-hand ${h.reserve > 0 ? 'text-cart-cyan' : 'text-cart-red'}`}>{h.reserve}r</span>
            <span className="text-ink-faded font-hand">{h.usedSlots}/{h.totalSlots}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function AgentDetail({ agent, locationName, memories, inbox, agents }: {
  agent: Agent;
  locationName: string;
  memories: BoardState | undefined;
  inbox: BoardState | undefined;
  agents: Record<number, { name: string }>;
}) {
  const agentHexes = useGameStore((s) => s.agentHexes[agent.id]) || [];
  const chronicle = useGameStore((s) => s.chronicles[agent.id]);
  const [expandedPanel, setExpandedPanel] = useState<'memories' | 'inbox' | 'chronicle' | null>(null);

  // Chronicle entries from EvaluationLedger (separate from memories)
  const evaluation = useGameStore((s) => s.evaluations[agent.id]);
  const chronicleEntries = evaluation?.entries || [];
  const rep = reputationLabel(chronicle?.score ?? 0);

  return (
    <>
      {/* Card 1: Profile */}
      <Card
        header={
          <div className="flex items-center gap-2">
            <User size={14} className="text-cart-purple" />
            <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">Agent</span>
          </div>
        }
      >
        <div className="p-1">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold font-cartoon text-ink">{agent.name}</h3>
              <div className="text-[10px] font-hand text-ink-faded">ID #{agent.id}</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-cart-purple/20 border-[3px] border-cart-purple flex items-center justify-center font-bold text-lg font-cartoon text-cart-purple">
              {agent.name.charAt(0)}
            </div>
          </div>

          <p className="text-xs font-hand text-ink-soft italic bg-parchment-dark/50 p-2 rounded-xl border-2 border-wood/20 mt-3">
            &ldquo;{agent.personality}&rdquo;
          </p>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="bg-parchment-dark/50 p-2 rounded-xl border-2 border-wood/20">
              <div className="flex items-center gap-1 text-ink-faded mb-0.5">
                <MapPin size={12} />
                <span className="text-[9px] uppercase font-bold font-cartoon">At</span>
              </div>
              <button
                className="text-[10px] font-semibold font-cartoon text-cart-blue truncate hover:text-cart-blue/70 cursor-pointer"
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
            <div className="bg-parchment-dark/50 p-2 rounded-xl border-2 border-wood/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-cart-gold/5" />
              <div className="flex items-center gap-1 text-ink-faded mb-0.5 relative">
                <Trophy size={12} className="text-cart-gold" />
                <span className="text-[9px] uppercase font-bold font-cartoon text-cart-gold/80">Score</span>
              </div>
              <div className="text-xs font-bold font-cartoon text-cart-gold relative">{agent.score}</div>
            </div>
            <div className="bg-parchment-dark/50 p-2 rounded-xl border-2 border-wood/20">
              <div className="flex items-center gap-1 text-ink-faded mb-0.5">
                <Map size={12} className="text-cart-green" />
                <span className="text-[9px] uppercase font-bold font-cartoon text-cart-green/80">Hexes</span>
              </div>
              <div className="text-xs font-bold font-cartoon text-cart-green">{agent.hexCount}</div>
            </div>
          </div>

          <div className="space-y-1.5 mt-3">
            {STAT_LABELS.map((label, i) => (
              <div key={label} className="flex items-center justify-between text-[11px]">
                <span className="text-ink-faded font-cartoon font-semibold w-7">{label}</span>
                <div className="flex-1 mx-2 h-2 bg-parchment-dark rounded-full overflow-hidden border border-wood/20">
                  <div className={`h-full ${STAT_COLORS[i]} rounded-full`} style={{ width: `${(agent.stats[i] / 10) * 100}%` }} />
                </div>
                <span className="text-ink font-bold font-cartoon w-4 text-right">{agent.stats[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Card 2: Territory */}
      {agentHexes.length > 0 && <HexTerritoryPanel hexes={agentHexes} />}

      {/* Card 3: Chronicle (reputation) */}
      <div className="cursor-pointer" onClick={() => setExpandedPanel('chronicle')}>
        <Card
          header={
            <div className="flex items-center gap-2">
              <BookOpen size={13} className="text-cart-purple" />
              <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">Chronicle</span>
              {chronicleEntries.length > 0 && (
                <span className="text-[9px] font-hand text-ink-faded">{chronicleEntries.length} entries</span>
              )}
              <span className="text-[9px] font-hand text-ink-faded ml-auto">click to expand</span>
            </div>
          }
        >
          <div className="px-1">
            {/* Reputation badge */}
            <div className="flex items-center gap-3 bg-parchment-dark/50 p-2 rounded-xl border-2 border-wood/20">
              <div className="text-center flex-1">
                <div className="text-[8px] uppercase font-cartoon font-semibold text-wood-light">Reputation</div>
                <div className={`text-sm font-bold font-cartoon ${rep.color}`}>{rep.text}</div>
              </div>
              <div className="text-center flex-1">
                <div className="text-[8px] uppercase font-cartoon font-semibold text-wood-light">Score</div>
                <div className={`text-sm font-bold font-cartoon ${(chronicle?.score ?? 0) >= 0 ? 'text-cart-green' : 'text-cart-red'}`}>
                  {(chronicle?.score ?? 0) > 0 ? '+' : ''}{chronicle?.score ?? 0}
                </div>
              </div>
              <div className="text-center flex-1">
                <div className="text-[8px] uppercase font-cartoon font-semibold text-wood-light">Avg Rating</div>
                <div className="text-sm font-bold font-cartoon text-cart-gold">
                  {chronicle && chronicle.count > 0 ? chronicle.avgRating.toFixed(1) : '-'} <span className="text-[9px]">/ 10</span>
                </div>
              </div>
            </div>

            {/* Recent chronicle entries preview */}
            {chronicleEntries.length > 0 && (
              <div className="mt-2 space-y-1">
                {chronicleEntries.slice(-2).reverse().map((entry) => (
                  <div key={entry.id} className="text-[10px] px-2 py-1 rounded-lg bg-cart-purple/5 border-l-[3px] border-cart-purple/30">
                    <span className="font-cartoon text-cart-purple font-semibold">
                      {agents[entry.relatedAgents?.[0]]?.name || 'Unknown'}
                    </span>
                    <span className="text-ink-faded font-hand"> rated </span>
                    <span className="text-cart-gold">{'\u2605'.repeat(Math.min(entry.importance, 5))}</span>
                    <p className="text-ink-soft font-hand mt-0.5 leading-tight">&ldquo;{entry.content.slice(0, 60)}{entry.content.length > 60 ? '\u2026' : ''}&rdquo;</p>
                  </div>
                ))}
              </div>
            )}

            {chronicleEntries.length === 0 && (
              <p className="text-[10px] text-ink-faded italic font-hand mt-1.5">No one has written about {agent.name} yet...</p>
            )}
          </div>
        </Card>
      </div>

      {/* Card 4: Memories (click to expand) */}
      <div className="flex-1 min-h-0 cursor-pointer" onClick={() => setExpandedPanel('memories')}>
        <Card
          className="h-full"
          header={
            <div className="flex items-center gap-2">
              <Brain size={13} className="text-cart-cyan" />
              <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">Memories</span>
              <UsageBadge board={memories} />
              <span className="text-[9px] font-hand text-ink-faded ml-1">click to expand</span>
            </div>
          }
        >
          <EntryList entries={memories?.entries || []} color="cyan" agents={agents} />
        </Card>
      </div>

      {/* Card 4: Inbox (click to expand) */}
      <div className="flex-1 min-h-0 cursor-pointer" onClick={() => setExpandedPanel('inbox')}>
        <Card
          className="h-full"
          header={
            <div className="flex items-center gap-2">
              <MessageCircle size={13} className="text-cart-green" />
              <span className="text-[11px] uppercase font-bold font-cartoon text-wood-dark">Inbox</span>
              <UsageBadge board={inbox} />
              <span className="text-[9px] font-hand text-ink-faded ml-1">click to expand</span>
            </div>
          }
        >
          <EntryList entries={inbox?.entries || []} color="green" agents={agents} showAuthor />
        </Card>
      </div>

      {/* Expanded modal via Portal */}
      {expandedPanel === 'memories' && (
        <EntryModal
          title={`${agent.name} — Memories`}
          entries={memories?.entries || []}
          agents={agents}
          color="cyan"
          onClose={() => setExpandedPanel(null)}
        />
      )}
      {expandedPanel === 'inbox' && (
        <EntryModal
          title={`${agent.name} — Inbox`}
          entries={inbox?.entries || []}
          agents={agents}
          color="green"
          showAuthor
          onClose={() => setExpandedPanel(null)}
        />
      )}
      {expandedPanel === 'chronicle' && (
        <EntryModal
          title={`${agent.name} — Chronicle (${rep.text})`}
          entries={chronicleEntries}
          agents={agents}
          color="purple"
          showAuthor
          onClose={() => setExpandedPanel(null)}
        />
      )}
    </>
  );
}

'use client';

import { useGameStore } from '../store/useGameStore';
import { User, Activity, MapPin, Coins, Navigation, Brain } from 'lucide-react';

export default function HUD() {
  const agents = useGameStore((state) => state.agents);
  const locations = useGameStore((state) => state.locations);
  const events = useGameStore((state) => state.events);
  const memories = useGameStore((state) => state.memories);
  const selectedAgentId = useGameStore((state) => state.selectedAgentId);

  const selectedAgent = selectedAgentId !== null ? agents[selectedAgentId] : null;
  const selectedMemories = selectedAgentId !== null ? (memories[selectedAgentId] || []) : [];

  return (
    <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between" style={{ zIndex: 10 }}>
      {/* Top Bar */}
      <div className="flex w-full justify-between items-start pointer-events-auto">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/50 backdrop-blur-md shadow-2xl">
          <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
            AI TOWN
          </h1>
          <p className="text-xs font-mono text-slate-400 uppercase tracking-widest mt-1">
            Global Entities: {Object.keys(agents).length}
          </p>
        </div>

        {/* Global Stats / Status */}
        <div className="p-3 px-5 rounded-full bg-slate-900/80 border border-emerald-500/30 backdrop-blur-md shadow-[0_0_15px_rgba(52,211,153,0.2)] flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          <span className="text-sm font-mono text-emerald-100 font-semibold tracking-wide">ON-CHAIN SYNCED</span>
        </div>
      </div>

      {/* Sidebars Container */}
      <div className="flex w-full justify-between items-end flex-1 pb-4 pointer-events-auto mt-4 gap-4 overflow-hidden max-h-min">
        {/* Left Panel: Global Activity (stubbed for now, can implement latest actions later) */}
        <div className="w-80 h-96 p-4 rounded-xl bg-slate-900/80 border border-slate-700/50 backdrop-blur-md shadow-2xl flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-blue-400" />
            <h2 className="font-bold text-slate-200">World Events</h2>
          </div>
          <div className="flex-1 rounded border border-slate-800 bg-slate-950/50 p-3 overflow-y-auto space-y-2">
            {events.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-500 font-mono text-sm">
                (No events yet...)
              </div>
            ) : (
              [...events].reverse().map((evt, i) => (
                <div key={i} className="text-xs border-b border-slate-800/50 pb-2 last:border-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {evt.action}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {agents[evt.agentId]?.name || `#${evt.agentId}`}
                    </span>
                    <span className="text-slate-600 ml-auto text-[10px]">
                      @ {locations[evt.locationId]?.name || `Loc#${evt.locationId}`}
                    </span>
                  </div>
                  <p className="text-slate-300 leading-snug">{evt.result}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Agent Detail */}
        <div className="w-96 p-5 rounded-xl bg-slate-900/90 border border-slate-700/50 backdrop-blur-md shadow-2xl transition-all duration-300">
          <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-800">
            <User size={18} className="text-purple-400" />
            <h2 className="font-bold text-slate-200 uppercase tracking-wider text-sm">Entity Detail</h2>
          </div>

          {selectedAgent ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-black text-white">{selectedAgent.name}</h3>
                  <div className="text-xs font-mono text-slate-400 mt-1 uppercase">ID: 0x0{selectedAgent.id}</div>
                </div>
                <div className="w-12 h-12 rounded-full bg-purple-500/20 border-2 border-purple-500 flex items-center justify-center font-black text-xl text-purple-200 shadow-[0_0_15px_rgba(167,139,250,0.5)]">
                  {selectedAgent.name.charAt(0)}
                </div>
              </div>

              <p className="text-sm text-slate-300 italic bg-slate-800/50 p-3 rounded-md border border-slate-700/30">
                "{selectedAgent.personality}"
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/80">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <MapPin size={14} />
                    <span className="text-[10px] uppercase font-bold">Location</span>
                  </div>
                  <div className="text-sm font-semibold text-blue-300 truncate">
                    {locations[selectedAgent.location]?.name || 'Unknown'}
                  </div>
                </div>
                <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/80 relative overflow-hidden">
                  <div className="absolute inset-0 bg-yellow-500/5"></div>
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1 relative">
                    <Coins size={14} className="text-yellow-500" />
                    <span className="text-[10px] uppercase font-bold text-yellow-500/80">Wealth</span>
                  </div>
                  <div className="text-sm font-black text-yellow-400 relative">
                    {selectedAgent.gold} <span className="text-[10px] text-yellow-600">G</span>
                  </div>
                </div>
              </div>

              {/* Stats Bar */}
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-mono">CHR</span>
                  <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-pink-500" style={{ width: `${(selectedAgent.stats[0] / 20) * 100}%` }}></div>
                  </div>
                  <span className="text-slate-300 font-bold w-4 text-right">{selectedAgent.stats[0]}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-mono">INT</span>
                  <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${(selectedAgent.stats[1] / 20) * 100}%` }}></div>
                  </div>
                  <span className="text-slate-300 font-bold w-4 text-right">{selectedAgent.stats[1]}</span>
                </div>
              </div>

              {/* Memories */}
              <div className="mt-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Brain size={14} className="text-cyan-400" />
                  <span className="text-[10px] uppercase font-bold text-slate-400">Memories</span>
                  <span className="text-[10px] text-slate-600 ml-auto">{selectedMemories.length}</span>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {selectedMemories.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No memories recorded</p>
                  ) : (
                    [...selectedMemories].reverse().map((mem) => (
                      <div key={mem.id} className="text-xs bg-slate-950/50 p-2 rounded border border-slate-800/50">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="px-1 py-0.5 rounded text-[9px] font-bold uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
                            {mem.category}
                          </span>
                          <span className="text-yellow-500 text-[9px] ml-auto">
                            {'★'.repeat(Math.min(mem.importance, 10))}
                          </span>
                        </div>
                        <p className="text-slate-300 leading-snug mt-1">{mem.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-slate-500 opacity-60">
              <Navigation size={32} className="mb-3 animate-bounce" />
              <p className="text-sm">Click any entity on the map</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

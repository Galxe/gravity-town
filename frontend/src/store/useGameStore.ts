import { create } from 'zustand';

export interface Agent {
  id: number;
  name: string;
  personality: string;
  stats: number[];
  location: number;
  gold: number;
  createdAt: number;
}

export interface LocationData {
  id: number;
  name: string;
  description: string;
  availableActions: string[];
  agentIds: number[];
}

export interface ActionEvent {
  agentId: number;
  locationId: number;
  action: string;
  result: string;
  timestamp: number;
}

export interface AgentMemory {
  id: number;
  agentId: number;
  timestamp: number;
  importance: number;
  category: string;
  content: string;
  relatedAgents: number[];
}

export interface GameState {
  agents: Record<number, Agent>;
  locations: Record<number, LocationData>;
  events: ActionEvent[];
  memories: Record<number, AgentMemory[]>;
  selectedAgentId: number | null;
  setAgents: (agents: Record<number, Agent>) => void;
  setLocations: (locations: Record<number, LocationData>) => void;
  setEvents: (events: ActionEvent[]) => void;
  setMemories: (agentId: number, memories: AgentMemory[]) => void;
  setSelectedAgentId: (id: number | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  agents: {},
  locations: {},
  events: [],
  memories: {},
  selectedAgentId: null,
  setAgents: (agents) => set({ agents }),
  setLocations: (locations) => set({ locations }),
  setEvents: (events) => set({ events }),
  setMemories: (agentId, mems) => set((state) => ({
    memories: { ...state.memories, [agentId]: mems },
  })),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
}));

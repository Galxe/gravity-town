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
  agentIds: number[];
  q: number;
  r: number;
}

/** Unified entry — same structure for memories, location board, and inbox */
export interface Entry {
  id: number;
  authorAgent: number;
  blockNumber: number;
  timestamp: number;
  importance: number;
  category: string;
  content: string;
  relatedAgents: number[];
}

export interface BoardState {
  entries: Entry[];
  used: number;
  capacity: number;
}

export interface FocusTarget {
  x: number;
  y: number;
  zoom?: 'far' | 'close';
}

export interface HoveredEntity {
  type: 'agent' | 'location';
  id: number;
}

export interface SelectedEntity {
  type: 'agent' | 'location';
  id: number;
}

export interface GameState {
  agents: Record<number, Agent>;
  locations: Record<number, LocationData>;
  memories: Record<number, BoardState>;
  locationBoards: Record<number, BoardState>;
  inbox: Record<number, BoardState>;
  selectedEntity: SelectedEntity | null;
  focusTarget: FocusTarget | null;
  hoveredEntity: HoveredEntity | null;
  setAgents: (agents: Record<number, Agent>) => void;
  setLocations: (locations: Record<number, LocationData>) => void;
  setMemories: (agentId: number, board: BoardState) => void;
  setLocationBoard: (locationId: number, board: BoardState) => void;
  setInbox: (agentId: number, board: BoardState) => void;
  setSelectedEntity: (entity: SelectedEntity | null) => void;
  setFocusTarget: (target: FocusTarget | null) => void;
  setHoveredEntity: (entity: HoveredEntity | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  agents: {},
  locations: {},
  memories: {},
  locationBoards: {},
  inbox: {},
  selectedEntity: null,
  focusTarget: null,
  hoveredEntity: null,
  setAgents: (agents) => set({ agents }),
  setLocations: (locations) => set({ locations }),
  setMemories: (agentId, board) => set((state) => ({
    memories: { ...state.memories, [agentId]: board },
  })),
  setLocationBoard: (locationId, board) => set((state) => ({
    locationBoards: { ...state.locationBoards, [locationId]: board },
  })),
  setInbox: (agentId, board) => set((state) => ({
    inbox: { ...state.inbox, [agentId]: board },
  })),
  setSelectedEntity: (entity) => set({ selectedEntity: entity }),
  setFocusTarget: (target) => set({ focusTarget: target }),
  setHoveredEntity: (entity) => set({ hoveredEntity: entity }),
}));

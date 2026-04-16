import { create } from 'zustand';

export interface Agent {
  id: number;
  name: string;
  personality: string;
  stats: number[];
  location: number;
  hexCount: number;
  score: number;
  createdAt: number;
}

export interface HexData {
  hexKey: string;
  ownerId: number;
  locationId: number;
  q: number;
  r: number;
  mineCount: number;
  arsenalCount: number;
  lastHarvest: number;
  reserve: number;
  happiness: number;
  usedSlots: number;
  totalSlots: number;
  defense: number;
}

export interface LocationData {
  id: number;
  name: string;
  description: string;
  agentIds: number[];
  q: number;
  r: number;
}

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

export interface ChronicleData {
  score: number;       // -5 to +5
  count: number;       // total chronicle entries
  avgRating: number;   // average rating (1-10)
}

export interface GameState {
  agents: Record<number, Agent>;
  locations: Record<number, LocationData>;
  hexes: Record<string, HexData>;          // keyed by hexKey
  agentHexes: Record<number, HexData[]>;   // agentId → owned hexes
  memories: Record<number, BoardState>;
  locationBoards: Record<number, BoardState>;
  inbox: Record<number, BoardState>;
  chronicles: Record<number, ChronicleData>; // agentId → chronicle
  evaluations: Record<number, BoardState>;  // agentId → evaluation entries (written by others)
  worldBible: BoardState | null;
  selectedEntity: SelectedEntity | null;
  focusTarget: FocusTarget | null;
  hoveredEntity: HoveredEntity | null;
  setAgents: (agents: Record<number, Agent>) => void;
  setLocations: (locations: Record<number, LocationData>) => void;
  setHexes: (hexes: Record<string, HexData>) => void;
  setWorldData: (agents: Record<number, Agent>, locations: Record<number, LocationData>, hexes: Record<string, HexData>) => void;
  setAgentHexes: (agentId: number, hexes: HexData[]) => void;
  setMemories: (agentId: number, board: BoardState) => void;
  setLocationBoard: (locationId: number, board: BoardState) => void;
  setInbox: (agentId: number, board: BoardState) => void;
  setChronicles: (chronicles: Record<number, ChronicleData>) => void;
  setEvaluation: (agentId: number, board: BoardState) => void;
  setWorldBible: (board: BoardState) => void;
  setSelectedEntity: (entity: SelectedEntity | null) => void;
  setFocusTarget: (target: FocusTarget | null) => void;
  setHoveredEntity: (entity: HoveredEntity | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  agents: {},
  locations: {},
  hexes: {},
  agentHexes: {},
  memories: {},
  locationBoards: {},
  inbox: {},
  chronicles: {},
  evaluations: {},
  worldBible: null,
  selectedEntity: null,
  focusTarget: null,
  hoveredEntity: null,
  setAgents: (agents) => set({ agents }),
  setLocations: (locations) => set({ locations }),
  setHexes: (hexes) => set({ hexes }),
  setWorldData: (agents, locations, hexes) => set({ agents, locations, hexes }),
  setAgentHexes: (agentId, hexes) => set((state) => ({
    agentHexes: { ...state.agentHexes, [agentId]: hexes },
  })),
  setMemories: (agentId, board) => set((state) => ({
    memories: { ...state.memories, [agentId]: board },
  })),
  setLocationBoard: (locationId, board) => set((state) => ({
    locationBoards: { ...state.locationBoards, [locationId]: board },
  })),
  setInbox: (agentId, board) => set((state) => ({
    inbox: { ...state.inbox, [agentId]: board },
  })),
  setChronicles: (chronicles) => set({ chronicles }),
  setEvaluation: (agentId, board) => set((state) => ({
    evaluations: { ...state.evaluations, [agentId]: board },
  })),
  setWorldBible: (board) => set({ worldBible: board }),
  setSelectedEntity: (entity) => set({ selectedEntity: entity }),
  setFocusTarget: (target) => set({ focusTarget: target }),
  setHoveredEntity: (entity) => set({ hoveredEntity: entity }),
}));

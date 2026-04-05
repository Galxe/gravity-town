// Full-state sync: fetches all agents, locations, and boards from chain
import type { Contracts } from './contracts';
import type { Agent, LocationData, BoardState, Entry } from '../store/useGameStore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEntry(e: any): Entry {
  return {
    id: Number(e.id),
    authorAgent: Number(e.authorAgent),
    blockNumber: Number(e.blockNumber),
    timestamp: Number(e.timestamp),
    importance: Number(e.importance),
    category: e.category,
    content: e.content,
    relatedAgents: Array.from(e.relatedAgents).map(Number),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseBoardResult(raw: any): BoardState {
  const [entries, used, capacity] = raw;
  return {
    entries: Array.from(entries).map(parseEntry),
    used: Number(used),
    capacity: Number(capacity),
  };
}

export interface SyncResult {
  agents: Record<number, Agent>;
  locations: Record<number, LocationData>;
  memories: Record<number, BoardState>;
  locationBoards: Record<number, BoardState>;
  inbox: Record<number, BoardState>;
}

/** Fetch everything from chain in one shot */
export async function fullSync(c: Contracts): Promise<SyncResult> {
  const [locIds, agentIds] = await Promise.all([
    c.locationLedger.getAllLocationIds(),
    c.registry.getAllAgentIds(),
  ]);

  const [locResults, agentResults] = await Promise.all([
    Promise.all(locIds.map(async (locId: bigint) => {
      const id = Number(locId);
      const [[name, desc, q, r], agentsAt] = await Promise.all([
        c.locationLedger.getLocation(id),
        c.locationLedger.getAgentsAtLocation(id),
      ]);
      return {
        id, name, description: desc,
        agentIds: agentsAt.map(Number),
        q: Number(q), r: Number(r),
      } as LocationData;
    })),
    Promise.all(agentIds.map(async (aId: bigint) => {
      const id = Number(aId);
      const [[name, personality, stats, location, createdAt], score, hCount] = await Promise.all([
        c.registry.getAgent(id),
        c.gameEngine.getScore(id),
        c.gameEngine.hexCount(id),
      ]);
      return {
        id, name, personality,
        stats: Array.from(stats).map(Number),
        location: Number(location), hexCount: Number(hCount),
        score: Number(score), createdAt: Number(createdAt),
      } as Agent;
    })),
  ]);

  const agents: Record<number, Agent> = {};
  for (const a of agentResults) agents[a.id] = a;

  const locations: Record<number, LocationData> = {};
  for (const l of locResults) locations[l.id] = l;

  const memories: Record<number, BoardState> = {};
  const inbox: Record<number, BoardState> = {};
  const locationBoards: Record<number, BoardState> = {};

  await Promise.all([
    Promise.all(agentIds.map(async (aId: bigint) => {
      const id = Number(aId);
      memories[id] = parseBoardResult(await c.agentLedger.readRecent(id, 10));
    })),
    Promise.all(locIds.map(async (locId: bigint) => {
      const id = Number(locId);
      locationBoards[id] = parseBoardResult(await c.locationLedger.readRecent(id, 20));
    })),
    Promise.all(agentIds.map(async (aId: bigint) => {
      const id = Number(aId);
      inbox[id] = parseBoardResult(await c.inboxLedger.readRecent(id, 10));
    })),
  ]);

  return { agents, locations, memories, locationBoards, inbox };
}

// --- Targeted refetch helpers (called on individual events) ---

export async function fetchAgent(c: Contracts, agentId: number): Promise<Agent> {
  const [[name, personality, stats, location, createdAt], score, hCount] = await Promise.all([
    c.registry.getAgent(agentId),
    c.gameEngine.getScore(agentId),
    c.gameEngine.hexCount(agentId),
  ]);
  return {
    id: agentId, name, personality,
    stats: Array.from(stats).map(Number),
    location: Number(location), hexCount: Number(hCount),
    score: Number(score), createdAt: Number(createdAt),
  };
}

export async function fetchAllAgentIds(c: Contracts): Promise<number[]> {
  const ids: bigint[] = await c.registry.getAllAgentIds();
  return ids.map(Number);
}

export async function fetchAgentsAtLocation(c: Contracts, locationId: number): Promise<number[]> {
  const ids: bigint[] = await c.locationLedger.getAgentsAtLocation(locationId);
  return ids.map(Number);
}

export async function fetchLocation(c: Contracts, locationId: number): Promise<LocationData> {
  const [name, desc, q, r] = await c.locationLedger.getLocation(locationId);
  const agentsAt = await c.locationLedger.getAgentsAtLocation(locationId);
  return {
    id: locationId, name, description: desc,
    agentIds: agentsAt.map(Number),
    q: Number(q), r: Number(r),
  };
}

export async function fetchAllLocationIds(c: Contracts): Promise<number[]> {
  const ids: bigint[] = await c.locationLedger.getAllLocationIds();
  return ids.map(Number);
}

export async function fetchMemories(c: Contracts, agentId: number): Promise<BoardState> {
  return parseBoardResult(await c.agentLedger.readRecent(agentId, 10));
}

export async function fetchLocationBoard(c: Contracts, locationId: number): Promise<BoardState> {
  return parseBoardResult(await c.locationLedger.readRecent(locationId, 20));
}

export async function fetchInbox(c: Contracts, agentId: number): Promise<BoardState> {
  return parseBoardResult(await c.inboxLedger.readRecent(agentId, 10));
}

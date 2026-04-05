// Subscribe to all contract events via WSS, trigger targeted store updates
import type { Contracts } from './contracts';
import { useGameStore } from '../store/useGameStore';
import {
  fetchAgent, fetchAgentsAtLocation,
  fetchLocation, fetchAllLocationIds,
  fetchMemories, fetchLocationBoard, fetchInbox,
} from './sync';

/** Subscribe to all contract events; returns a cleanup function */
export function subscribeEvents(contracts: Contracts): () => void {
  const { registry, agentLedger, locationLedger, inboxLedger } = contracts;
  const store = useGameStore.getState;
  const set = useGameStore.setState;

  // --- AgentRegistry events ---

  const onAgentCreated = async (agentId: bigint) => {
    const id = Number(agentId);
    const agent = await fetchAgent(contracts, id);
    // Refetch locations to update agentIds arrays
    const locIds = await fetchAllLocationIds(contracts);
    const locations = { ...store().locations };
    await Promise.all(locIds.map(async (locId) => {
      locations[locId] = await fetchLocation(contracts, locId);
    }));
    set((s) => ({
      agents: { ...s.agents, [id]: agent },
      locations,
    }));
    // Fetch new agent's boards
    const [memories, inbox] = await Promise.all([
      fetchMemories(contracts, id),
      fetchInbox(contracts, id),
    ]);
    set((s) => ({
      memories: { ...s.memories, [id]: memories },
      inbox: { ...s.inbox, [id]: inbox },
    }));
  };

  const onAgentRemoved = async (agentId: bigint) => {
    const id = Number(agentId);
    set((s) => {
      const agents = { ...s.agents };
      delete agents[id];
      const memories = { ...s.memories };
      delete memories[id];
      const inbox = { ...s.inbox };
      delete inbox[id];
      return { agents, memories, inbox };
    });
    // Refresh location agent lists
    const locIds = await fetchAllLocationIds(contracts);
    const locations = { ...store().locations };
    await Promise.all(locIds.map(async (locId) => {
      locations[locId] = await fetchLocation(contracts, locId);
    }));
    set({ locations });
  };

  const onAgentMoved = async (agentId: bigint, fromLocation: bigint, toLocation: bigint) => {
    const id = Number(agentId);
    const fromLoc = Number(fromLocation);
    const toLoc = Number(toLocation);
    const [agent, fromAgents, toAgents] = await Promise.all([
      fetchAgent(contracts, id),
      fetchAgentsAtLocation(contracts, fromLoc),
      fetchAgentsAtLocation(contracts, toLoc),
    ]);
    set((s) => ({
      agents: { ...s.agents, [id]: agent },
      locations: {
        ...s.locations,
        [fromLoc]: s.locations[fromLoc] ? { ...s.locations[fromLoc], agentIds: fromAgents } : s.locations[fromLoc],
        [toLoc]: s.locations[toLoc] ? { ...s.locations[toLoc], agentIds: toAgents } : s.locations[toLoc],
      },
    }));
  };

  // --- AgentLedger events ---

  const onMemoryWritten = async (_entryId: bigint, agentId: bigint) => {
    const id = Number(agentId);
    const board = await fetchMemories(contracts, id);
    set((s) => ({ memories: { ...s.memories, [id]: board } }));
  };

  const onMemoryCompacted = async (agentId: bigint) => {
    const id = Number(agentId);
    const board = await fetchMemories(contracts, id);
    set((s) => ({ memories: { ...s.memories, [id]: board } }));
  };

  // --- LocationLedger events ---

  const onLocationCreated = async (locationId: bigint) => {
    const id = Number(locationId);
    const [location, board] = await Promise.all([
      fetchLocation(contracts, id),
      fetchLocationBoard(contracts, id),
    ]);
    set((s) => ({
      locations: { ...s.locations, [id]: location },
      locationBoards: { ...s.locationBoards, [id]: board },
    }));
  };

  const onLocationEntryWritten = async (_entryId: bigint, locationId: bigint) => {
    const id = Number(locationId);
    const board = await fetchLocationBoard(contracts, id);
    set((s) => ({ locationBoards: { ...s.locationBoards, [id]: board } }));
  };

  const onLocationCompacted = async (locationId: bigint) => {
    const id = Number(locationId);
    const board = await fetchLocationBoard(contracts, id);
    set((s) => ({ locationBoards: { ...s.locationBoards, [id]: board } }));
  };

  // --- InboxLedger events ---

  const onInboxEntryWritten = async (_entryId: bigint, _fromAgent: bigint, toAgent: bigint) => {
    const id = Number(toAgent);
    const board = await fetchInbox(contracts, id);
    set((s) => ({ inbox: { ...s.inbox, [id]: board } }));
  };

  const onInboxCompacted = async (agentId: bigint) => {
    const id = Number(agentId);
    const board = await fetchInbox(contracts, id);
    set((s) => ({ inbox: { ...s.inbox, [id]: board } }));
  };

  // Wire up all listeners
  registry.on('AgentCreated', onAgentCreated);
  registry.on('AgentRemoved', onAgentRemoved);
  registry.on('AgentMoved', onAgentMoved);
  agentLedger.on('EntryWritten', onMemoryWritten);
  agentLedger.on('Compacted', onMemoryCompacted);

  locationLedger.on('LocationCreated', onLocationCreated);
  locationLedger.on('EntryWritten', onLocationEntryWritten);
  locationLedger.on('Compacted', onLocationCompacted);
  // TickAdvanced is informational — no refetch needed

  inboxLedger.on('EntryWritten', onInboxEntryWritten);
  inboxLedger.on('Compacted', onInboxCompacted);

  // Cleanup function
  return () => {
    registry.removeAllListeners();
    agentLedger.removeAllListeners();
    locationLedger.removeAllListeners();
    inboxLedger.removeAllListeners();
  };
}

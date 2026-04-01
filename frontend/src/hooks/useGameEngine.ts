import { useEffect, useRef } from 'react';
import { JsonRpcProvider, Contract } from 'ethers';
import { useGameStore, Agent, LocationData, Entry, BoardState } from '../store/useGameStore';

const RPC_URL        = process.env.NEXT_PUBLIC_RPC_URL        || 'http://127.0.0.1:8545';
const ROUTER_ADDR    = process.env.NEXT_PUBLIC_ROUTER_ADDRESS || '0x0000000000000000000000000000000000000000';

const ROUTER_ABI = [
  'function getAddresses() view returns (address, address, address, address)',
];

const REGISTRY_ABI = [
  'function getAgent(uint256) view returns (string, string, uint8[4], uint256, uint256, uint256)',
  'function getAllAgentIds() view returns (uint256[])',
];

const ENTRY_TUPLE = 'tuple(uint256 id, uint256 authorAgent, uint256 blockNumber, uint256 timestamp, uint8 importance, string category, string content, uint256[] relatedAgents)';

const AGENT_LEDGER_ABI = [
  `function readRecent(uint256 agentId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
];

const LOCATION_LEDGER_ABI = [
  `function getLocation(uint256) view returns (string, string, int32, int32)`,
  `function getAllLocationIds() view returns (uint256[])`,
  `function getAgentsAtLocation(uint256) view returns (uint256[])`,
  `function readRecent(uint256 locationId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
];

const INBOX_LEDGER_ABI = [
  `function readRecent(uint256 agentId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
];

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
function parseBoardResult(raw: any): BoardState {
  const [entries, used, capacity] = raw;
  return {
    entries: Array.from(entries).map(parseEntry),
    used: Number(used),
    capacity: Number(capacity),
  };
}

export function useGameEngine() {
  const setAgents = useGameStore((state) => state.setAgents);
  const setLocations = useGameStore((state) => state.setLocations);
  const setMemories = useGameStore((state) => state.setMemories);
  const setLocationBoard = useGameStore((state) => state.setLocationBoard);
  const setInbox = useGameStore((state) => state.setInbox);

  const isFetching = useRef(false);

  useEffect(() => {
    const provider = new JsonRpcProvider(RPC_URL);
    let registry: Contract;
    let agentLedger: Contract;
    let locationLedger: Contract;
    let inboxLedger: Contract;
    let resolved = false;

    const resolveContracts = async () => {
      if (resolved) return;
      const router = new Contract(ROUTER_ADDR, ROUTER_ABI, provider);
      const [registryAddr, agentLedgerAddr, locationLedgerAddr, inboxLedgerAddr] = await router.getAddresses();
      registry = new Contract(registryAddr, REGISTRY_ABI, provider);
      agentLedger = new Contract(agentLedgerAddr, AGENT_LEDGER_ABI, provider);
      locationLedger = new Contract(locationLedgerAddr, LOCATION_LEDGER_ABI, provider);
      inboxLedger = new Contract(inboxLedgerAddr, INBOX_LEDGER_ABI, provider);
      resolved = true;
    };

    const pullData = async () => {
      if (isFetching.current) return;
      isFetching.current = true;
      try {
        await resolveContracts();
        const [locIds, agentIds] = await Promise.all([
          locationLedger.getAllLocationIds(),
          registry.getAllAgentIds(),
        ]);

        // Fetch locations, agents in parallel
        const [locResults, agentResults] = await Promise.all([
          Promise.all(locIds.map(async (locId: bigint) => {
            const id = Number(locId);
            const [[name, desc, q, r], agentsAt] = await Promise.all([
              locationLedger.getLocation(id),
              locationLedger.getAgentsAtLocation(id),
            ]);
            return {
              id, name, description: desc,
              agentIds: agentsAt.map(Number),
              q: Number(q), r: Number(r),
            } as LocationData;
          })),
          Promise.all(agentIds.map(async (aId: bigint) => {
            const id = Number(aId);
            const [name, personality, stats, location, gold, createdAt] = await registry.getAgent(id);
            return {
              id, name, personality,
              stats: Array.from(stats).map(Number),
              location: Number(location), gold: Number(gold), createdAt: Number(createdAt),
            } as Agent;
          })),
        ]);

        const newLocs: Record<number, LocationData> = {};
        for (const loc of locResults) newLocs[loc.id] = loc;

        const newAgents: Record<number, Agent> = {};
        for (const agent of agentResults) newAgents[agent.id] = agent;

        // Fetch all boards in parallel: memories, location boards, inboxes
        await Promise.all([
          // Agent memories
          Promise.all(agentIds.map(async (aId: bigint) => {
            const id = Number(aId);
            const raw = await agentLedger.readRecent(id, 10);
            setMemories(id, parseBoardResult(raw));
          })),
          // Location boards
          Promise.all(locIds.map(async (locId: bigint) => {
            const id = Number(locId);
            const raw = await locationLedger.readRecent(id, 20);
            setLocationBoard(id, parseBoardResult(raw));
          })),
          // Agent inboxes
          Promise.all(agentIds.map(async (aId: bigint) => {
            const id = Number(aId);
            const raw = await inboxLedger.readRecent(id, 10);
            setInbox(id, parseBoardResult(raw));
          })),
        ]);

        setLocations(newLocs);
        setAgents(newAgents);
      } catch (err) {
        console.error("RPC Error:", err);
      } finally {
        isFetching.current = false;
      }
    };

    pullData();
    const interval = setInterval(pullData, 5000);
    return () => clearInterval(interval);
  }, [setAgents, setLocations, setMemories, setLocationBoard, setInbox]);
}

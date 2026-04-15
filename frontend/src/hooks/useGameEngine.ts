import { useEffect, useRef } from 'react';
import { JsonRpcProvider, Contract } from 'ethers';
import { useGameStore, Agent, LocationData, Entry, BoardState, HexData, ChronicleData } from '../store/useGameStore';

const RPC_URL     = process.env.NEXT_PUBLIC_RPC_URL        || 'http://127.0.0.1:8545';
const ROUTER_ADDR = process.env.NEXT_PUBLIC_ROUTER_ADDRESS || '0x0000000000000000000000000000000000000000';

const ENTRY_TUPLE = 'tuple(uint256 id, uint256 authorAgent, uint256 blockNumber, uint256 timestamp, uint8 importance, string category, string content, uint256[] relatedAgents)';

const ROUTER_ABI = [
  'function getAddresses() view returns (address, address, address, address, address, address)',
];

const REGISTRY_ABI = [
  'function getAgent(uint256) view returns (string, string, uint8[4], uint256, uint256)',
  'function getAllAgentIds() view returns (uint256[])',
];

const EVALUATION_LEDGER_ABI = [
  `function readRecent(uint256 agentId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
];

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

const GAME_ENGINE_ABI = [
  'function getScore(uint256) view returns (uint256)',
  'function hexCount(uint256) view returns (uint256)',
  'function getAgentHexKeys(uint256) view returns (bytes32[])',
  'function getAllHexKeys() view returns (bytes32[])',
  'function getHex(bytes32) view returns (uint256 ownerId, uint256 locationId, int32 q, int32 r, uint256 mineCount, uint256 arsenalCount, uint256 lastHarvest, uint256 reserve, uint256 happiness, uint256 happinessUpdatedAt)',
  'function orePool(uint256) view returns (uint256)',
  'function inciteRebellion(uint256 agentId, bytes32 targetHexKey)',
  'function getChronicle(uint256 agentId) view returns (int256 score, uint256 count, uint256 ratingSum)',
  'function getWorldBible() view returns (uint256 locationId, uint256 lastTimestamp, uint256 bestAgentId, int256 bestScore)',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEntry(e: any): Entry {
  return {
    id: Number(e.id), authorAgent: Number(e.authorAgent),
    blockNumber: Number(e.blockNumber), timestamp: Number(e.timestamp),
    importance: Number(e.importance), category: e.category,
    content: e.content, relatedAgents: Array.from(e.relatedAgents).map(Number),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBoardResult(raw: any): BoardState {
  const [entries, used, capacity] = raw;
  return { entries: Array.from(entries).map(parseEntry), used: Number(used), capacity: Number(capacity) };
}

export function useGameEngine() {
  const setWorldData = useGameStore((s) => s.setWorldData);
  const setAgentHexes = useGameStore((s) => s.setAgentHexes);
  const setMemories = useGameStore((s) => s.setMemories);
  const setLocationBoard = useGameStore((s) => s.setLocationBoard);
  const setInbox = useGameStore((s) => s.setInbox);
  const setChronicles = useGameStore((s) => s.setChronicles);
  const setEvaluation = useGameStore((s) => s.setEvaluation);
  const setWorldBible = useGameStore((s) => s.setWorldBible);

  const isFetching = useRef(false);

  useEffect(() => {
    const provider = new JsonRpcProvider(RPC_URL);
    let registry: Contract;
    let agentLedger: Contract;
    let locationLedger: Contract;
    let inboxLedger: Contract;
    let gameEngine: Contract;
    let evaluationLedger: Contract;
    let resolved = false;

    const resolveContracts = async () => {
      if (resolved) return;
      const router = new Contract(ROUTER_ADDR, ROUTER_ABI, provider);
      const [registryAddr, agentLedgerAddr, locationLedgerAddr, inboxLedgerAddr, engineAddr, evalLedgerAddr] =
        await router.getAddresses();
      registry = new Contract(registryAddr, REGISTRY_ABI, provider);
      agentLedger = new Contract(agentLedgerAddr, AGENT_LEDGER_ABI, provider);
      locationLedger = new Contract(locationLedgerAddr, LOCATION_LEDGER_ABI, provider);
      inboxLedger = new Contract(inboxLedgerAddr, INBOX_LEDGER_ABI, provider);
      gameEngine = new Contract(engineAddr, GAME_ENGINE_ABI, provider);
      evaluationLedger = new Contract(evalLedgerAddr, EVALUATION_LEDGER_ABI, provider);
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

        const [locResults, agentResults] = await Promise.all([
          Promise.all(locIds.map(async (locId: bigint) => {
            const id = Number(locId);
            const [[name, desc, q, r], agentsAt] = await Promise.all([
              locationLedger.getLocation(id),
              locationLedger.getAgentsAtLocation(id),
            ]);
            return { id, name, description: desc, agentIds: agentsAt.map(Number), q: Number(q), r: Number(r) } as LocationData;
          })),
          Promise.all(agentIds.map(async (aId: bigint) => {
            const id = Number(aId);
            const [[name, personality, stats, location, createdAt], score, hCount] =
              await Promise.all([
                registry.getAgent(id),
                gameEngine.getScore(id),
                gameEngine.hexCount(id),
              ]);
            return {
              id, name, personality,
              stats: Array.from(stats).map(Number),
              location: Number(location),
              hexCount: Number(hCount),
              score: Number(score),
              createdAt: Number(createdAt),
            } as Agent;
          })),
        ]);

        const newLocs: Record<number, LocationData> = {};
        for (const loc of locResults) newLocs[loc.id] = loc;
        const newAgents: Record<number, Agent> = {};
        for (const agent of agentResults) newAgents[agent.id] = agent;

        // Fetch all hex data + boards in parallel
        const allHexes: Record<string, HexData> = {};

        await Promise.all([
          // All hexes (global list — includes unowned/rebelled)
          (async () => {
            const keys: string[] = await gameEngine.getAllHexKeys();
            const agentHexMap: Record<number, HexData[]> = {};
            await Promise.all(keys.map(async (k: string) => {
              const [ownerId, locationId, q, r, mineCount, arsenalCount, lastHarvest, reserve, happiness] =
                await gameEngine.getHex(k);
              const hd: HexData = {
                hexKey: k, ownerId: Number(ownerId), locationId: Number(locationId),
                q: Number(q), r: Number(r),
                mineCount: Number(mineCount), arsenalCount: Number(arsenalCount),
                lastHarvest: Number(lastHarvest),
                reserve: Number(reserve),
                happiness: Number(happiness),
                usedSlots: Number(mineCount) + Number(arsenalCount), totalSlots: 6,
                defense: Number(arsenalCount) * 5,
              };
              allHexes[k] = hd;
              if (hd.ownerId > 0) {
                if (!agentHexMap[hd.ownerId]) agentHexMap[hd.ownerId] = [];
                agentHexMap[hd.ownerId].push(hd);
              }
            }));
            for (const [id, hexList] of Object.entries(agentHexMap)) {
              setAgentHexes(Number(id), hexList);
            }
          })(),
          // Memories
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
          // Inboxes
          Promise.all(agentIds.map(async (aId: bigint) => {
            const id = Number(aId);
            const raw = await inboxLedger.readRecent(id, 10);
            setInbox(id, parseBoardResult(raw));
          })),
          // Chronicles
          (async () => {
            const chronicleMap: Record<number, ChronicleData> = {};
            await Promise.all(agentIds.map(async (aId: bigint) => {
              const id = Number(aId);
              try {
                const [score, count, ratingSum] = await gameEngine.getChronicle(id);
                const c = Number(count);
                chronicleMap[id] = {
                  score: Number(score),
                  count: c,
                  avgRating: c > 0 ? Number(ratingSum) / c : 0,
                };
              } catch {
                chronicleMap[id] = { score: 0, count: 0, avgRating: 0 };
              }
            }));
            setChronicles(chronicleMap);
          })(),
          // Evaluations (separate from memories)
          Promise.all(agentIds.map(async (aId: bigint) => {
            const id = Number(aId);
            try {
              const raw = await evaluationLedger.readRecent(id, 20);
              setEvaluation(id, parseBoardResult(raw));
            } catch { /* evaluation ledger may not exist on old deploys */ }
          })),
          // World Bible
          (async () => {
            try {
              const [wbLocationId] = await gameEngine.getWorldBible();
              const locId = Number(wbLocationId);
              if (locId > 0) {
                const raw = await locationLedger.readRecent(locId, 20);
                setWorldBible(parseBoardResult(raw));
              }
            } catch { /* world bible may not exist */ }
          })(),
        ]);

        setWorldData(newAgents, newLocs, allHexes);
      } catch (err) {
        console.error("RPC Error:", err);
      } finally {
        isFetching.current = false;
      }
    };

    pullData();
    const interval = setInterval(pullData, 5000);
    return () => clearInterval(interval);
  }, [setWorldData, setAgentHexes, setMemories, setLocationBoard, setInbox, setChronicles, setEvaluation, setWorldBible]);
}

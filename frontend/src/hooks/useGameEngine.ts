import { useEffect, useRef } from 'react';
import { JsonRpcProvider, Contract } from 'ethers';
import { useGameStore, Agent, LocationData, ActionEvent, AgentMemory } from '../store/useGameStore';

const RPC_URL       = process.env.NEXT_PUBLIC_RPC_URL            || 'http://127.0.0.1:8545';
const REGISTRY_ADDR = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS   || '0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9';
const WORLD_ADDR    = process.env.NEXT_PUBLIC_WORLD_ADDRESS      || '0xdc64a140aa3e981100a9beca4e685f962f0cf6c9';
const MEMORY_ADDR   = process.env.NEXT_PUBLIC_MEMORY_ADDRESS     || '0x5fc8d32690cc91d4c39d9d3abcbd16989f875707';

const REGISTRY_ABI = [
  'function getAgent(uint256) view returns (string, string, uint8[4], uint256, uint256, uint256)',
  'function getAllAgentIds() view returns (uint256[])',
];

const WORLD_ABI = [
  'function getLocation(uint256) view returns (string, string, string[])',
  'function getAllLocationIds() view returns (uint256[])',
  'function getAgentsAtLocation(uint256) view returns (uint256[])',
  'function getRecentGlobalActions(uint256) view returns (tuple(uint256 agentId, uint256 locationId, string action, string result, uint256 timestamp)[])',
];

const MEMORY_ABI = [
  'function getRecentMemories(uint256 agentId, uint256 count) view returns (tuple(uint256 id, uint256 agentId, uint256 timestamp, uint8 importance, string category, string content, uint256[] relatedAgents)[])',
];

export function useGameEngine() {
  const setAgents = useGameStore((state) => state.setAgents);
  const setLocations = useGameStore((state) => state.setLocations);
  const setEvents = useGameStore((state) => state.setEvents);
  const setMemories = useGameStore((state) => state.setMemories);

  // Ref to prevent overlapping fetches
  const isFetching = useRef(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    const provider = new JsonRpcProvider(RPC_URL);
    const registry = new Contract(REGISTRY_ADDR, REGISTRY_ABI, provider);
    const world = new Contract(WORLD_ADDR, WORLD_ABI, provider);
    const memoryLedger = new Contract(MEMORY_ADDR, MEMORY_ABI, provider);

    const pullData = async () => {
      if (isFetching.current) return;
      isFetching.current = true;
      try {
        const locIds = await world.getAllLocationIds();
        const newLocs: Record<number, LocationData> = {};
        for (const locId of locIds) {
          const id = Number(locId);
          const [name, desc, actions] = await world.getLocation(id);
          const agentIds = await world.getAgentsAtLocation(id);
          newLocs[id] = {
            id,
            name,
            description: desc,
            availableActions: Array.from(actions),
            agentIds: agentIds.map(Number),
          };
        }

        const agentIds = await registry.getAllAgentIds();
        const newAgents: Record<number, Agent> = {};
        for (const aId of agentIds) {
          const id = Number(aId);
          const [name, personality, stats, location, gold, createdAt] = await registry.getAgent(id);
          newAgents[id] = {
            id,
            name,
            personality,
            stats: Array.from(stats).map(Number),
            location: Number(location),
            gold: Number(gold),
            createdAt: Number(createdAt),
          };
        }

        // Fetch recent global events
        const rawEvents = await world.getRecentGlobalActions(20);
        const events: ActionEvent[] = rawEvents.map((e: any) => ({
          agentId: Number(e.agentId),
          locationId: Number(e.locationId),
          action: e.action,
          result: e.result,
          timestamp: Number(e.timestamp),
        }));

        // Fetch memories for all agents
        for (const aId of agentIds) {
          const id = Number(aId);
          const rawMems = await memoryLedger.getRecentMemories(id, 10);
          const mems: AgentMemory[] = rawMems.map((m: any) => ({
            id: Number(m.id),
            agentId: Number(m.agentId),
            timestamp: Number(m.timestamp),
            importance: Number(m.importance),
            category: m.category,
            content: m.content,
            relatedAgents: Array.from(m.relatedAgents).map(Number),
          }));
          setMemories(id, mems);
        }

        setLocations(newLocs);
        setAgents(newAgents);
        setEvents(events);
      } catch (err) {
        console.error("RPC Error:", err);
      } finally {
        isFetching.current = false;
      }
    };

    pullData();
    interval = setInterval(pullData, 2000);
    return () => clearInterval(interval);
  }, [setAgents, setLocations, setEvents, setMemories]);
}

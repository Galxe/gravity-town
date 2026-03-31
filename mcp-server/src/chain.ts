// Chain interaction layer - wraps ethers.js calls to the AI Town contracts
import { ethers } from "ethers";

// Minimal ABIs (only the functions we need)
const AGENT_REGISTRY_ABI = [
  "event AgentCreated(uint256 indexed agentId, string name, address indexed owner)",
  "function createAgent(string name, string personality, uint8[4] stats, uint256 location, address agentOwnerAddr) returns (uint256)",
  "function getAgent(uint256 agentId) view returns (string name, string personality, uint8[4] stats, uint256 location, uint256 gold, uint256 createdAt)",
  "function moveAgent(uint256 agentId, uint256 toLocation)",
  "function transferGold(uint256 fromAgent, uint256 toAgent, uint256 amount)",
  "function addGold(uint256 agentId, uint256 amount)",
  "function updateStats(uint256 agentId, uint8[4] newStats)",
  "function getAgentCount() view returns (uint256)",
  "function getAllAgentIds() view returns (uint256[])",
  "function agentOwner(uint256) view returns (address)",
];

const WORLD_STATE_ABI = [
  "function createLocation(string name, string description, string[] availableActions) returns (uint256)",
  "function performAction(uint256 agentId, string action, string result)",
  "function getAgentsAtLocation(uint256 locationId) view returns (uint256[])",
  "function getRecentActions(uint256 locationId, uint256 count) view returns (tuple(uint256 agentId, uint256 locationId, string action, string result, uint256 timestamp)[])",
  "function getRecentGlobalActions(uint256 count) view returns (tuple(uint256 agentId, uint256 locationId, string action, string result, uint256 timestamp)[])",
  "function getLocation(uint256 locationId) view returns (string name, string description, string[] availableActions)",
  "function getAllLocationIds() view returns (uint256[])",
  "function advanceTick()",
  "function currentTick() view returns (uint256)",
];

const MEMORY_LEDGER_ABI = [
  "function addMemory(uint256 agentId, uint8 importance, string category, string content, uint256[] relatedAgents) returns (uint256)",
  "function compressMemories(uint256 agentId, uint256 count, string summaryContent, uint8 importance, string category) returns (uint256)",
  "function getRecentMemories(uint256 agentId, uint256 count) view returns (tuple(uint256 id, uint256 agentId, uint256 timestamp, uint8 importance, string category, string content, uint256[] relatedAgents)[])",
  "function getImportantMemories(uint256 agentId, uint8 minImportance) view returns (tuple(uint256 id, uint256 agentId, uint256 timestamp, uint8 importance, string category, string content, uint256[] relatedAgents)[])",
  "function getMemoriesByCategory(uint256 agentId, string category) view returns (tuple(uint256 id, uint256 agentId, uint256 timestamp, uint8 importance, string category, string content, uint256[] relatedAgents)[])",
  "function getSharedMemories(uint256 agentA, uint256 agentB) view returns (tuple(uint256 id, uint256 agentId, uint256 timestamp, uint8 importance, string category, string content, uint256[] relatedAgents)[])",
  "function memoryCount(uint256) view returns (uint256)",
  "function memoryCapacity() view returns (uint256)",
];

export interface ChainConfig {
  rpcUrl: string;
  privateKey: string;
  agentRegistryAddress: string;
  worldStateAddress: string;
  memoryLedgerAddress: string;
}

export class ChainClient {
  provider: ethers.providers.JsonRpcProvider;
  signer: ethers.Wallet;
  registry: ethers.Contract;
  world: ethers.Contract;
  memory: ethers.Contract;

  constructor(config: ChainConfig) {
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);
    this.registry = new ethers.Contract(config.agentRegistryAddress, AGENT_REGISTRY_ABI, this.signer);
    this.world = new ethers.Contract(config.worldStateAddress, WORLD_STATE_ABI, this.signer);
    this.memory = new ethers.Contract(config.memoryLedgerAddress, MEMORY_LEDGER_ABI, this.signer);
  }

  // ============ Agent Operations ============

  async createAgent(name: string, personality: string, stats: number[], location: number, ownerAddr: string) {
    const tx = await this.registry.createAgent(name, personality, stats, location, ownerAddr);
    const receipt = await tx.wait();
    // Try parsed event first, then fall back to raw log parsing (needed for proxy contracts)
    let agentId: string | null = null;
    const event = receipt.events?.find((entry: any) => entry.event === "AgentCreated");
    if (event?.args?.[0] != null) {
      agentId = event.args[0].toString();
    } else if (receipt.logs?.length > 0) {
      const iface = this.registry.interface;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === "AgentCreated") {
            agentId = parsed.args[0].toString();
            break;
          }
        } catch {}
      }
    }
    return { agentId, txHash: receipt.transactionHash };
  }

  async getAgent(agentId: number) {
    const [name, personality, stats, location, gold, createdAt] = await this.registry.getAgent(agentId);
    return {
      id: agentId,
      name,
      personality,
      stats: stats.map((s: bigint) => Number(s)),
      location: Number(location),
      gold: Number(gold),
      createdAt: Number(createdAt),
    };
  }

  async listAgents() {
    const ids: bigint[] = await this.registry.getAllAgentIds();
    const agents = [];
    for (const id of ids) {
      agents.push(await this.getAgent(Number(id)));
    }
    return agents;
  }

  async moveAgent(agentId: number, toLocation: number) {
    const tx = await this.registry.moveAgent(agentId, toLocation);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  async transferGold(fromAgent: number, toAgent: number, amount: number) {
    const tx = await this.registry.transferGold(fromAgent, toAgent, amount);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  async addGold(agentId: number, amount: number) {
    const tx = await this.registry.addGold(agentId, amount);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  // ============ World Operations ============

  async getWorld() {
    const locationIds: bigint[] = await this.world.getAllLocationIds();
    const locations = [];
    for (const id of locationIds) {
      const [name, description, availableActions] = await this.world.getLocation(Number(id));
      const agentIds: bigint[] = await this.world.getAgentsAtLocation(Number(id));
      locations.push({
        id: Number(id),
        name,
        description,
        availableActions,
        agents: agentIds.map((a: bigint) => Number(a)),
      });
    }
    const tick = await this.world.currentTick();
    return { tick: Number(tick), locations };
  }

  async performAction(agentId: number, action: string, result: string) {
    const tx = await this.world.performAction(agentId, action, result);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  async getRecentEvents(locationId: number, count: number) {
    const logs = await this.world.getRecentActions(locationId, count);
    return logs.map((l: any) => ({
      agentId: Number(l.agentId),
      locationId: Number(l.locationId),
      action: l.action,
      result: l.result,
      timestamp: Number(l.timestamp),
    }));
  }

  async getNearbyAgents(agentId: number) {
    const agent = await this.getAgent(agentId);
    const ids: bigint[] = await this.world.getAgentsAtLocation(agent.location);
    const agents = [];
    for (const id of ids) {
      if (Number(id) !== agentId) {
        agents.push(await this.getAgent(Number(id)));
      }
    }
    return agents;
  }

  async advanceTick() {
    const tx = await this.world.advanceTick();
    const receipt = await tx.wait();
    const tick = await this.world.currentTick();
    return { tick: Number(tick), txHash: receipt.transactionHash };
  }

  // ============ Memory Operations ============

  async addMemory(agentId: number, importance: number, category: string, content: string, relatedAgents: number[]) {
    const tx = await this.memory.addMemory(agentId, importance, category, content, relatedAgents);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  async compressMemories(agentId: number, count: number, summaryContent: string, importance: number, category: string) {
    const tx = await this.memory.compressMemories(agentId, count, summaryContent, importance, category);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  async getMemoryUsage(agentId: number) {
    const count = await this.memory.memoryCount(agentId);
    const capacity = await this.memory.memoryCapacity();
    return { count: Number(count), capacity: Number(capacity) };
  }

  private formatMemories(mems: any[]) {
    return mems.map((m: any) => ({
      id: Number(m.id),
      agentId: Number(m.agentId),
      timestamp: Number(m.timestamp),
      importance: Number(m.importance),
      category: m.category,
      content: m.content,
      relatedAgents: m.relatedAgents.map((a: bigint) => Number(a)),
    }));
  }

  async recallMemories(agentId: number, count: number) {
    const mems = await this.memory.getRecentMemories(agentId, count);
    return this.formatMemories(mems);
  }

  async getImportantMemories(agentId: number, minImportance: number) {
    const mems = await this.memory.getImportantMemories(agentId, minImportance);
    return this.formatMemories(mems);
  }

  async getMemoriesByCategory(agentId: number, category: string) {
    const mems = await this.memory.getMemoriesByCategory(agentId, category);
    return this.formatMemories(mems);
  }

  async getSharedHistory(agentA: number, agentB: number) {
    const mems = await this.memory.getSharedMemories(agentA, agentB);
    return this.formatMemories(mems);
  }
}

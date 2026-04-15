// Chain interaction layer — hex territory economy
import { ethers } from "ethers";

// ──────────────────── ABIs ────────────────────

const AGENT_REGISTRY_ABI = [
  "event AgentCreated(uint256 indexed agentId, string name, address indexed owner)",
  "function getAgent(uint256 agentId) view returns (string name, string personality, uint8[4] stats, uint256 location, uint256 createdAt)",
  "function isAlive(uint256 agentId) view returns (bool)",
  "function moveAgent(uint256 agentId, uint256 toLocation)",
  "function getAgentCount() view returns (uint256)",
  "function getAllAgentIds() view returns (uint256[])",
  "function agentOwner(uint256) view returns (address)",
  "function getAgentByName(address ownerAddr, string name) view returns (uint256)",
  "function getAgentsByOwner(address ownerAddr) view returns (uint256[])",
];

const ENTRY_TUPLE = "tuple(uint256 id, uint256 authorAgent, uint256 blockNumber, uint256 timestamp, uint8 importance, string category, string content, uint256[] relatedAgents)";

const AGENT_LEDGER_ABI = [
  `function write(uint256 agentId, uint8 importance, string category, string content, uint256[] relatedAgents) returns (uint256 entryId, uint256 used, uint256 capacity)`,
  `function readRecent(uint256 agentId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
  `function compact(uint256 agentId, uint256 count, uint8 importance, string category, string summaryContent) returns (uint256 summaryId, uint256 used, uint256 capacity)`,
];

const LOCATION_LEDGER_ABI = [
  `function getLocation(uint256) view returns (string, string, int32, int32)`,
  `function getAllLocationIds() view returns (uint256[])`,
  `function getAgentsAtLocation(uint256) view returns (uint256[])`,
  `function write(uint256 agentId, uint8 importance, string category, string content, uint256[] relatedAgents) returns (uint256 entryId, uint256 used, uint256 capacity)`,
  `function readRecent(uint256 locationId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
  `function compact(uint256 locationId, uint256 count, uint256 authorAgent, uint8 importance, string category, string summaryContent) returns (uint256 summaryId, uint256 used, uint256 capacity)`,
];

const INBOX_LEDGER_ABI = [
  `function write(uint256 fromAgent, uint256 toAgent, uint8 importance, string category, string content, uint256[] relatedAgents) returns (uint256 entryId, uint256 used, uint256 capacity)`,
  `function readRecent(uint256 agentId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
  `function readFrom(uint256 agentId, uint256 fromAgentId) view returns (${ENTRY_TUPLE}[])`,
  `function compact(uint256 agentId, uint256 count, uint8 importance, string category, string summaryContent) returns (uint256 summaryId, uint256 used, uint256 capacity)`,
];

const GAME_ENGINE_ABI = [
  "event AgentCreated(uint256 indexed agentId, bytes32 indexed hexKey, uint256 locationId)",
  "event HexClaimed(uint256 indexed agentId, bytes32 indexed hexKey, int32 q, int32 r, uint256 locationId)",
  "event HexLost(uint256 indexed agentId, bytes32 indexed hexKey)",
  "event Built(uint256 indexed agentId, bytes32 indexed hexKey, uint8 buildingType)",
  "event Harvested(bytes32 indexed hexKey, uint256 oreGained)",
  "event AttackResult(uint256 indexed attackerId, bytes32 indexed targetHexKey, uint256 attackPower, uint256 defensePower, bool success)",
  "function createAgent(string name, string personality, uint8[4] stats, address ownerAddr) returns (uint256 agentId, bytes32 hexKey)",
  "function harvest(uint256 agentId)",
  "function orePool(uint256 agentId) view returns (uint256)",
  "function build(uint256 agentId, bytes32 hexKey, uint8 buildingType)",
  "function attack(uint256 agentId, bytes32 targetHexKey, bytes32 sourceHexKey, uint256 arsenalSpend, uint256 oreSpend)",
  "function getScore(uint256 agentId) view returns (uint256)",
  "function getHex(bytes32 hexKey) view returns (uint256 ownerId, uint256 locationId, int32 q, int32 r, uint256 mineCount, uint256 arsenalCount, uint256 lastHarvest, uint256 reserve, uint256 happiness, uint256 happinessUpdatedAt)",
  "function getAgentHexKeys(uint256 agentId) view returns (bytes32[])",
  "function getAllHexKeys() view returns (bytes32[])",
  "function hexCount(uint256 agentId) view returns (uint256)",
  "function toKey(int32 q, int32 r) view returns (bytes32)",
  "function raid(uint256 agentId, bytes32 targetHexKey, uint256 arsenalSpend, uint256 oreSpend)",
  "function boostHappiness(uint256 agentId, bytes32 hexKey)",
  "event InciteResult(uint256 indexed agentId, bytes32 indexed targetHexKey, bool success, bool captured)",
  "function claimNeutral(uint256 agentId, bytes32 hexKey)",
  "function inciteRebellion(uint256 agentId, bytes32 targetHexKey)",
];

const ROUTER_ABI = [
  "function getAddresses() view returns (address registry, address agentLedger, address locationLedger, address inboxLedger, address gameEngine)",
];

// ──────────────────── Types ────────────────────

export interface ChainConfig {
  rpcUrl: string;
  privateKey: string;
  routerAddress: string;
}

export interface FormattedEntry {
  id: number;
  authorAgent: number;
  blockNumber: number;
  timestamp: number;
  importance: number;
  category: string;
  content: string;
  relatedAgents: number[];
}

export interface BoardRead {
  entries: FormattedEntry[];
  used: number;
  capacity: number;
}

export interface WriteResult {
  entryId: number;
  used: number;
  capacity: number;
  txHash: string;
}

// ──────────────────── ChainClient ────────────────────

export class ChainClient {
  provider: ethers.providers.JsonRpcProvider;
  signer: ethers.Wallet;
  registry: ethers.Contract = null!;
  agentLedger: ethers.Contract = null!;
  locationLedger: ethers.Contract = null!;
  inboxLedger: ethers.Contract = null!;
  gameEngine: ethers.Contract = null!;
  private _ready: Promise<void>;

  constructor(config: ChainConfig) {
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl, {
      name: "gravity-testnet",
      chainId: 7771625,
    });
    this.signer = new ethers.Wallet(config.privateKey, this.provider);

    const provider = this.provider;
    const signer = this.signer;
    this._ready = (async () => {
      const router = new ethers.Contract(config.routerAddress, ROUTER_ABI, provider);
      const [registryAddr, agentLedgerAddr, locationLedgerAddr, inboxLedgerAddr, engineAddr] =
        await router.getAddresses();
      this.registry = new ethers.Contract(registryAddr, AGENT_REGISTRY_ABI, signer);
      this.agentLedger = new ethers.Contract(agentLedgerAddr, AGENT_LEDGER_ABI, signer);
      this.locationLedger = new ethers.Contract(locationLedgerAddr, LOCATION_LEDGER_ABI, signer);
      this.inboxLedger = new ethers.Contract(inboxLedgerAddr, INBOX_LEDGER_ABI, signer);
      this.gameEngine = new ethers.Contract(engineAddr, GAME_ENGINE_ABI, signer);
    })();
  }

  async ready(): Promise<void> { await this._ready; }

  // ============ Helpers ============

  private formatEntry(e: any): FormattedEntry {
    return {
      id: Number(e.id), authorAgent: Number(e.authorAgent),
      blockNumber: Number(e.blockNumber), timestamp: Number(e.timestamp),
      importance: Number(e.importance), category: e.category,
      content: e.content, relatedAgents: e.relatedAgents.map((a: any) => Number(a)),
    };
  }

  private formatEntries(entries: any[]): FormattedEntry[] {
    return entries.map((e: any) => this.formatEntry(e));
  }

  // ============ Agent ============

  async createAgent(name: string, personality: string, stats: number[], ownerAddr: string) {
    const tx = await this.gameEngine.createAgent(name, personality, stats, ownerAddr);
    const receipt = await tx.wait();
    let agentId: string | null = null;
    let hexKey: string | null = null;
    const iface = this.gameEngine.interface;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed.name === "AgentCreated") {
          agentId = parsed.args.agentId.toString();
          hexKey = parsed.args.hexKey;
          break;
        }
      } catch {}
    }
    return { agentId, hexKey, txHash: receipt.transactionHash };
  }

  async findAgentByName(name: string, ownerAddr: string): Promise<number> {
    const id = Number(await this.registry.getAgentByName(ownerAddr, name));
    return id; // 0 = not found
  }

  async getAgentsByOwner(ownerAddr: string) {
    const ids: bigint[] = await this.registry.getAgentsByOwner(ownerAddr);
    return Promise.all(ids.map((id) => this.getAgent(Number(id))));
  }

  async getAgent(agentId: number) {
    const [name, personality, stats, location, createdAt] = await this.registry.getAgent(agentId);
    const score = await this.gameEngine.getScore(agentId);
    const hCount = await this.gameEngine.hexCount(agentId);
    const ore = Number(await this.gameEngine.orePool(agentId));
    return {
      id: agentId, name, personality,
      stats: stats.map((s: bigint) => Number(s)),
      location: Number(location),
      hexCount: Number(hCount),
      ore,
      score: Number(score),
      createdAt: Number(createdAt),
    };
  }

  async listAgents() {
    const ids: bigint[] = await this.registry.getAllAgentIds();
    return Promise.all(ids.map((id) => this.getAgent(Number(id))));
  }

  async moveAgent(agentId: number, toLocation: number) {
    const tx = await this.registry.moveAgent(agentId, toLocation);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  // ============ Hex / Economy ============

  async getHex(hexKey: string) {
    const [ownerId, locationId, q, r, mineCount, arsenalCount, lastHarvest, reserve, happiness, happinessUpdatedAt] =
      await this.gameEngine.getHex(hexKey);
    return {
      hexKey, ownerId: Number(ownerId), locationId: Number(locationId),
      q: Number(q), r: Number(r),
      mineCount: Number(mineCount), arsenalCount: Number(arsenalCount),
      lastHarvest: Number(lastHarvest),
      reserve: Number(reserve),
      happiness: Number(happiness), happinessUpdatedAt: Number(happinessUpdatedAt),
      usedSlots: Number(mineCount) + Number(arsenalCount), totalSlots: 6,
      defense: Number(arsenalCount) * 5,
      depleted: Number(reserve) === 0,
    };
  }

  async getMyHexes(agentId: number) {
    const keys: string[] = await this.gameEngine.getAgentHexKeys(agentId);
    const hexes = await Promise.all(keys.map((k) => this.getHex(k)));
    const ore = Number(await this.gameEngine.orePool(agentId));
    return { ore, hexes };
  }

  async harvest(agentId: number) {
    const tx = await this.gameEngine.harvest(agentId);
    const receipt = await tx.wait();
    let oreGained = 0;
    const iface = this.gameEngine.interface;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed.name === "Harvested") { oreGained = Number(parsed.args.oreGained); break; }
      } catch {}
    }
    const orePool = Number(await this.gameEngine.orePool(agentId));
    return { oreGained, orePool, txHash: receipt.transactionHash };
  }

  async build(agentId: number, hexKey: string, buildingType: number) {
    const tx = await this.gameEngine.build(agentId, hexKey, buildingType);
    const receipt = await tx.wait();
    const orePool = Number(await this.gameEngine.orePool(agentId));
    return { buildingType: buildingType === 1 ? "Mine" : "Arsenal", orePool, txHash: receipt.transactionHash };
  }

  async attack(agentId: number, targetHexKey: string, sourceHexKey: string, arsenalSpend: number, oreSpend: number) {
    const tx = await this.gameEngine.attack(agentId, targetHexKey, sourceHexKey, arsenalSpend, oreSpend);
    const receipt = await tx.wait();
    let result = { attackPower: 0, defensePower: 0, success: false };
    const iface = this.gameEngine.interface;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed.name === "AttackResult") {
          result = {
            attackPower: Number(parsed.args.attackPower),
            defensePower: Number(parsed.args.defensePower),
            success: parsed.args.success,
          };
          break;
        }
      } catch {}
    }
    return { ...result, txHash: receipt.transactionHash };
  }

  async getScore(agentId: number) { return Number(await this.gameEngine.getScore(agentId)); }

  async getScoreboard() {
    const ids: bigint[] = await this.registry.getAllAgentIds();
    const scores = await Promise.all(ids.map(async (id) => {
      const agentId = Number(id);
      const [name] = await this.registry.getAgent(agentId);
      const score = Number(await this.gameEngine.getScore(agentId));
      const hCount = Number(await this.gameEngine.hexCount(agentId));
      return { agentId, name, hexCount: hCount, score };
    }));
    return scores.sort((a, b) => b.score - a.score);
  }

  async raid(agentId: number, targetHexKey: string, arsenalSpend: number, oreSpend: number) {
    const tx = await this.gameEngine.raid(agentId, targetHexKey, arsenalSpend, oreSpend);
    const receipt = await tx.wait();
    let result = { attackPower: 0, defensePower: 0, success: false };
    const iface = this.gameEngine.interface;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed.name === "AttackResult") {
          result = {
            attackPower: Number(parsed.args.attackPower),
            defensePower: Number(parsed.args.defensePower),
            success: parsed.args.success,
          };
          break;
        }
      } catch {}
    }
    return { ...result, txHash: receipt.transactionHash };
  }

  async claimNeutral(agentId: number, hexKey: string) {
    const tx = await this.gameEngine.claimNeutral(agentId, hexKey);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  async inciteRebellion(agentId: number, targetHexKey: string) {
    const tx = await this.gameEngine.inciteRebellion(agentId, targetHexKey);
    const receipt = await tx.wait();
    let result = { success: false, captured: false };
    const iface = this.gameEngine.interface;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed.name === "InciteResult") {
          result = { success: parsed.args.success, captured: parsed.args.captured };
          break;
        }
      } catch {}
    }
    return { ...result, txHash: receipt.transactionHash };
  }

  async toKey(q: number, r: number): Promise<string> { return this.gameEngine.toKey(q, r); }

  // ============ Location Ledger ============

  async getWorld() {
    const [locationIds, hexKeys] = await Promise.all([
      this.locationLedger.getAllLocationIds() as Promise<bigint[]>,
      this.gameEngine.getAllHexKeys() as Promise<string[]>,
    ]);
    const [locations, hexes] = await Promise.all([
      Promise.all(locationIds.map(async (id) => {
        const [name, description, q, r] = await this.locationLedger.getLocation(Number(id));
        const agentIds: bigint[] = await this.locationLedger.getAgentsAtLocation(Number(id));
        return { id: Number(id), name, description, q: Number(q), r: Number(r), agents: agentIds.map(Number) };
      })),
      Promise.all(hexKeys.map((k) => this.getHex(k))),
    ]);
    return { locations, hexes };
  }

  async writeToLocation(agentId: number, importance: number, category: string, content: string, relatedAgents: number[]): Promise<WriteResult> {
    const tx = await this.locationLedger.write(agentId, importance, category, content, relatedAgents);
    const receipt = await tx.wait();
    return { entryId: 0, used: 0, capacity: 128, txHash: receipt.transactionHash };
  }

  async boostHappiness(agentId: number, hexKey: string) {
    const tx = await this.gameEngine.boostHappiness(agentId, hexKey);
    await tx.wait();
  }

  async readLocation(locationId: number, count: number): Promise<BoardRead> {
    const [entries, used, capacity] = await this.locationLedger.readRecent(locationId, count);
    return { entries: this.formatEntries(entries), used: Number(used), capacity: Number(capacity) };
  }

  async compactLocation(locationId: number, authorAgent: number, count: number, importance: number, category: string, summary: string) {
    const tx = await this.locationLedger.compact(locationId, count, authorAgent, importance, category, summary);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  async getNearbyAgents(agentId: number) {
    const agent = await this.getAgent(agentId);
    const ids: bigint[] = await this.locationLedger.getAgentsAtLocation(agent.location);
    const agents = [];
    for (const id of ids) {
      if (Number(id) !== agentId) agents.push(await this.getAgent(Number(id)));
    }
    return agents;
  }

  // ============ Agent Ledger (memories) ============

  async writeMemory(agentId: number, importance: number, category: string, content: string, relatedAgents: number[]): Promise<WriteResult> {
    const tx = await this.agentLedger.write(agentId, importance, category, content, relatedAgents);
    const receipt = await tx.wait();
    return { entryId: 0, used: 0, capacity: 64, txHash: receipt.transactionHash };
  }

  async readMemories(agentId: number, count: number): Promise<BoardRead> {
    const [entries, used, capacity] = await this.agentLedger.readRecent(agentId, count);
    return { entries: this.formatEntries(entries), used: Number(used), capacity: Number(capacity) };
  }

  async compactMemories(agentId: number, count: number, importance: number, category: string, summary: string) {
    const tx = await this.agentLedger.compact(agentId, count, importance, category, summary);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }

  // ============ Inbox Ledger ============

  async sendMessage(fromAgent: number, toAgent: number, importance: number, category: string, content: string, relatedAgents: number[]): Promise<WriteResult> {
    const tx = await this.inboxLedger.write(fromAgent, toAgent, importance, category, content, relatedAgents);
    const receipt = await tx.wait();
    return { entryId: 0, used: 0, capacity: 64, txHash: receipt.transactionHash };
  }

  async readInbox(agentId: number, count: number): Promise<BoardRead> {
    const [entries, used, capacity] = await this.inboxLedger.readRecent(agentId, count);
    return { entries: this.formatEntries(entries), used: Number(used), capacity: Number(capacity) };
  }

  async readInboxFrom(agentId: number, fromAgentId: number): Promise<FormattedEntry[]> {
    const entries = await this.inboxLedger.readFrom(agentId, fromAgentId);
    return this.formatEntries(entries);
  }

  async getConversation(agentA: number, agentB: number): Promise<FormattedEntry[]> {
    const [aToB, bToA] = await Promise.all([
      this.readInboxFrom(agentB, agentA), this.readInboxFrom(agentA, agentB),
    ]);
    return [...aToB, ...bToA].sort((a, b) => a.blockNumber - b.blockNumber || a.id - b.id);
  }

  async compactInbox(agentId: number, count: number, importance: number, category: string, summary: string) {
    const tx = await this.inboxLedger.compact(agentId, count, importance, category, summary);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }
}

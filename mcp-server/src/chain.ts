// Chain interaction layer — unified ledger architecture
import { ethers } from "ethers";

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

// Shared Entry struct ABI fragment (same for all three ledgers)
const ENTRY_TUPLE = "tuple(uint256 id, uint256 authorAgent, uint256 blockNumber, uint256 timestamp, uint8 importance, string category, string content, uint256[] relatedAgents)";

const AGENT_LEDGER_ABI = [
  `function write(uint256 agentId, uint8 importance, string category, string content, uint256[] relatedAgents) returns (uint256 entryId, uint256 used, uint256 capacity)`,
  `function readRecent(uint256 agentId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
  `function compact(uint256 agentId, uint256 count, uint8 importance, string category, string summaryContent) returns (uint256 summaryId, uint256 used, uint256 capacity)`,
];

const LOCATION_LEDGER_ABI = [
  `function createLocation(string name, string description, int32 q, int32 r) returns (uint256)`,
  `function getLocation(uint256 locationId) view returns (string name, string description, int32 q, int32 r)`,
  `function getAllLocationIds() view returns (uint256[])`,
  `function getAgentsAtLocation(uint256 locationId) view returns (uint256[])`,
  `function write(uint256 agentId, uint8 importance, string category, string content, uint256[] relatedAgents) returns (uint256 entryId, uint256 used, uint256 capacity)`,
  `function readRecent(uint256 locationId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
  `function compact(uint256 locationId, uint256 count, uint256 authorAgent, uint8 importance, string category, string summaryContent) returns (uint256 summaryId, uint256 used, uint256 capacity)`,
  `function advanceTick()`,
  `function currentTick() view returns (uint256)`,
];

const INBOX_LEDGER_ABI = [
  `function write(uint256 fromAgent, uint256 toAgent, uint8 importance, string category, string content, uint256[] relatedAgents) returns (uint256 entryId, uint256 used, uint256 capacity)`,
  `function readRecent(uint256 agentId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
  `function readFrom(uint256 agentId, uint256 fromAgentId) view returns (${ENTRY_TUPLE}[])`,
  `function compact(uint256 agentId, uint256 count, uint8 importance, string category, string summaryContent) returns (uint256 summaryId, uint256 used, uint256 capacity)`,
];

const ROUTER_ABI = [
  "function getAddresses() view returns (address registry, address agentLedger, address locationLedger, address inboxLedger)",
];

export interface ChainConfig {
  rpcUrl: string;
  privateKey: string;
  routerAddress: string;
}

// Formatted entry returned to MCP tools
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

export class ChainClient {
  provider: ethers.providers.JsonRpcProvider;
  signer: ethers.Wallet;
  registry: ethers.Contract = null!;
  agentLedger: ethers.Contract = null!;
  locationLedger: ethers.Contract = null!;
  inboxLedger: ethers.Contract = null!;
  private _ready: Promise<void>;

  constructor(config: ChainConfig) {
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.privateKey, this.provider);

    const provider = this.provider;
    const signer = this.signer;
    this._ready = (async () => {
      const router = new ethers.Contract(config.routerAddress, ROUTER_ABI, provider);
      const [registryAddr, agentLedgerAddr, locationLedgerAddr, inboxLedgerAddr] = await router.getAddresses();
      this.registry = new ethers.Contract(registryAddr, AGENT_REGISTRY_ABI, signer);
      this.agentLedger = new ethers.Contract(agentLedgerAddr, AGENT_LEDGER_ABI, signer);
      this.locationLedger = new ethers.Contract(locationLedgerAddr, LOCATION_LEDGER_ABI, signer);
      this.inboxLedger = new ethers.Contract(inboxLedgerAddr, INBOX_LEDGER_ABI, signer);
    })();
  }

  /** Wait for router resolution to complete */
  async ready(): Promise<void> {
    await this._ready;
  }

  // ============ Shared helpers ============

  private formatEntry(e: any): FormattedEntry {
    return {
      id: Number(e.id),
      authorAgent: Number(e.authorAgent),
      blockNumber: Number(e.blockNumber),
      timestamp: Number(e.timestamp),
      importance: Number(e.importance),
      category: e.category,
      content: e.content,
      relatedAgents: e.relatedAgents.map((a: any) => Number(a)),
    };
  }

  private formatEntries(entries: any[]): FormattedEntry[] {
    return entries.map((e: any) => this.formatEntry(e));
  }

  // ============ Agent Operations ============

  async createAgent(name: string, personality: string, stats: number[], location: number, ownerAddr: string) {
    const tx = await this.registry.createAgent(name, personality, stats, location, ownerAddr);
    const receipt = await tx.wait();
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
      id: agentId, name, personality,
      stats: stats.map((s: bigint) => Number(s)),
      location: Number(location), gold: Number(gold), createdAt: Number(createdAt),
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

  // ============ Agent Ledger (memories) ============

  async writeMemory(agentId: number, importance: number, category: string, content: string, relatedAgents: number[]): Promise<WriteResult> {
    const tx = await this.agentLedger.write(agentId, importance, category, content, relatedAgents);
    const receipt = await tx.wait();
    // Parse return values from event or receipt
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

  // ============ Location Ledger ============

  async getWorld() {
    const locationIds: bigint[] = await this.locationLedger.getAllLocationIds();
    const locations = await Promise.all(locationIds.map(async (id) => {
      const [name, description, q, r] = await this.locationLedger.getLocation(Number(id));
      const agentIds: bigint[] = await this.locationLedger.getAgentsAtLocation(Number(id));
      return {
        id: Number(id), name, description,
        q: Number(q), r: Number(r),
        agents: agentIds.map((a: bigint) => Number(a)),
      };
    }));
    const tick = await this.locationLedger.currentTick();
    return { tick: Number(tick), locations };
  }

  async writeToLocation(agentId: number, importance: number, category: string, content: string, relatedAgents: number[]): Promise<WriteResult> {
    const tx = await this.locationLedger.write(agentId, importance, category, content, relatedAgents);
    const receipt = await tx.wait();
    return { entryId: 0, used: 0, capacity: 128, txHash: receipt.transactionHash };
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

  async advanceTick() {
    const tx = await this.locationLedger.advanceTick();
    const receipt = await tx.wait();
    const tick = await this.locationLedger.currentTick();
    return { tick: Number(tick), txHash: receipt.transactionHash };
  }

  // ============ Inbox Ledger (DMs) ============

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
      this.readInboxFrom(agentB, agentA),  // A sent to B
      this.readInboxFrom(agentA, agentB),  // B sent to A
    ]);
    return [...aToB, ...bToA].sort((a, b) => a.blockNumber - b.blockNumber || a.id - b.id);
  }

  async compactInbox(agentId: number, count: number, importance: number, category: string, summary: string) {
    const tx = await this.inboxLedger.compact(agentId, count, importance, category, summary);
    const receipt = await tx.wait();
    return { txHash: receipt.transactionHash };
  }
}

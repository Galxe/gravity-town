// Shared ABI fragments for all contracts

export const ENTRY_TUPLE =
  'tuple(uint256 id, uint256 authorAgent, uint256 blockNumber, uint256 timestamp, uint8 importance, string category, string content, uint256[] relatedAgents)';

export const ROUTER_ABI = [
  'function getAddresses() view returns (address, address, address, address, address)',
];

export const REGISTRY_ABI = [
  'function getAgent(uint256) view returns (string, string, uint8[4], uint256, uint256)',
  'function getAllAgentIds() view returns (uint256[])',
  // Events
  'event AgentCreated(uint256 indexed agentId, string name, address indexed owner)',
  'event AgentRemoved(uint256 indexed agentId)',
  'event AgentMoved(uint256 indexed agentId, uint256 fromLocation, uint256 toLocation)',
];

export const GAME_ENGINE_ABI = [
  'function getScore(uint256) view returns (uint256)',
  'function hexCount(uint256) view returns (uint256)',
  'function getAgentHexKeys(uint256) view returns (bytes32[])',
  'function getAllHexKeys() view returns (bytes32[])',
  'function getHex(bytes32) view returns (uint256 ownerId, uint256 locationId, int32 q, int32 r, uint256 mineCount, uint256 arsenalCount, uint256 lastHarvest, uint256 reserve, uint256 happiness, uint256 happinessUpdatedAt)',
  'function orePool(uint256) view returns (uint256)',
  // Events
  'event AgentCreated(uint256 indexed agentId, bytes32 indexed hexKey, uint256 locationId)',
  'event Built(uint256 indexed agentId, bytes32 indexed hexKey, uint8 buildingType)',
  'event Harvested(uint256 indexed agentId, uint256 oreGained)',
  'event AttackResult(uint256 indexed attackerId, bytes32 indexed targetHexKey, uint256 attackPower, uint256 defensePower, bool success)',
  'event HexCaptured(uint256 indexed newOwner, bytes32 indexed hexKey, uint256 indexed oldOwner)',
  'event HexRebelled(bytes32 indexed hexKey, uint256 indexed oldOwner)',
];

export const AGENT_LEDGER_ABI = [
  `function readRecent(uint256 agentId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
  'event EntryWritten(uint256 indexed entryId, uint256 indexed agentId)',
  'event Compacted(uint256 indexed agentId, uint256 freedSlots, uint256 summaryId)',
];

export const LOCATION_LEDGER_ABI = [
  `function getLocation(uint256) view returns (string, string, int32, int32)`,
  `function getAllLocationIds() view returns (uint256[])`,
  `function getAgentsAtLocation(uint256) view returns (uint256[])`,
  `function readRecent(uint256 locationId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
  'event LocationCreated(uint256 indexed locationId, string name, int32 q, int32 r)',
  'event EntryWritten(uint256 indexed entryId, uint256 indexed locationId, uint256 indexed agentId)',
  'event Compacted(uint256 indexed locationId, uint256 freedSlots, uint256 summaryId)',
  'event TickAdvanced(uint256 newTick)',
];

export const INBOX_LEDGER_ABI = [
  `function readRecent(uint256 agentId, uint256 count) view returns (${ENTRY_TUPLE}[] entries, uint256 used, uint256 capacity)`,
  'event EntryWritten(uint256 indexed entryId, uint256 indexed fromAgent, uint256 indexed toAgent)',
  'event Compacted(uint256 indexed agentId, uint256 freedSlots, uint256 summaryId)',
];

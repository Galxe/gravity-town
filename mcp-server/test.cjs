const { ethers } = require('ethers');
const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');

const REGISTRY_ADDR = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const WORLD_ADDR    = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const MEMORY_ADDR   = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';

const REGISTRY_ABI = [
  'function getAgent(uint256 agentId) view returns (string name, string personality, uint8[4] stats, uint256 location, uint256 gold, uint256 createdAt)',
  'function getAgentCount() view returns (uint256)',
  'function getAllAgentIds() view returns (uint256[])',
];

const WORLD_ABI = [
  'function getLocation(uint256 locationId) view returns (string name, string description, string[] availableActions)',
  'function getAllLocationIds() view returns (uint256[])',
  'function getAgentsAtLocation(uint256 locationId) view returns (uint256[])',
  'function getRecentGlobalActions(uint256 count) view returns (tuple(uint256 agentId, uint256 locationId, string action, string result, uint256 timestamp)[])',
  'function currentTick() view returns (uint256)',
];

const MEMORY_ABI = [
  'function getRecentMemories(uint256 agentId, uint256 count) view returns (tuple(uint256 id, uint256 agentId, uint256 timestamp, uint8 importance, string category, string content, uint256[] relatedAgents)[])',
  'function memoryCount(uint256) view returns (uint256)',
];

const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, provider);
const world = new ethers.Contract(WORLD_ADDR, WORLD_ABI, provider);
const memoryContract = new ethers.Contract(MEMORY_ADDR, MEMORY_ABI, provider);

(async () => {
  try {
    console.log("Checking tick...");
    const tick = await world.currentTick();
    console.log('Tick:', tick.toString());
    
    console.log("Checking locations...");
    const ids = await world.getAllLocationIds();
    console.log('Location IDs:', ids.map(i => i.toString()));
    for (const id of ids) {
      const loc = await world.getLocation(id);
      const agentIds = await world.getAgentsAtLocation(id);
    }
    
    console.log("Checking agents...");
    const agentIds = await registry.getAllAgentIds();
    console.log('Agent IDs:', agentIds.map(i => i.toString()));
    
    console.log("Checking actions...");
    const logs = await world.getRecentGlobalActions(20);
    console.log("Action logs length:", logs.length);
    
    console.log("ALL SUCCESS!");
  } catch (e) {
    console.error("FAILED:", e);
  }
})();

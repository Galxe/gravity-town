const { ethers } = require('ethers');
const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
const WORLD_ABI = [
  'function getAllLocationIds() view returns (uint256[])',
  'function getLocation(uint256) view returns (string,string,string[])',
  'function currentTick() view returns (uint256)',
  'function getAgentsAtLocation(uint256) view returns (uint256[])'
];
const world = new ethers.Contract('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512', WORLD_ABI, provider);

(async () => {
  try {
    const ids = await world.getAllLocationIds();
    console.log('Location IDs:', ids.map(i => i.toString()));
    const tick = await world.currentTick();
    console.log('Tick:', tick.toString());
    const loc = await world.getLocation(ids[0]);
    console.log('Location 1:', loc);
    const agents = await world.getAgentsAtLocation(ids[0]);
    console.log('Agents at location 1:', agents);
  } catch (e) {
    console.error(e);
  }
})();

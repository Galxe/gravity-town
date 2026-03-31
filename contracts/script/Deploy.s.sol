// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/AgentRegistry.sol";
import "../src/WorldState.sol";
import "../src/MemoryLedger.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address operator = vm.envAddress("OPERATOR_ADDRESS");

        vm.startBroadcast(deployerKey);

        // ──── Deploy implementations ────
        AgentRegistry registryImpl = new AgentRegistry();
        WorldState worldImpl = new WorldState();
        MemoryLedger memoryImpl = new MemoryLedger();

        // ──── Deploy proxies ────
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(AgentRegistry.initialize, (operator))
        );
        AgentRegistry registry = AgentRegistry(address(registryProxy));

        ERC1967Proxy worldProxy = new ERC1967Proxy(
            address(worldImpl),
            abi.encodeCall(WorldState.initialize, (address(registry)))
        );
        WorldState world = WorldState(address(worldProxy));

        ERC1967Proxy memoryProxy = new ERC1967Proxy(
            address(memoryImpl),
            abi.encodeCall(MemoryLedger.initialize, (address(registry)))
        );

        // Create initial locations
        string[] memory tavernActions = new string[](3);
        tavernActions[0] = "drink";
        tavernActions[1] = "chat";
        tavernActions[2] = "rest";
        world.createLocation("Tavern", "A warm tavern with ale and stories", tavernActions);

        string[] memory mineActions = new string[](2);
        mineActions[0] = "mine";
        mineActions[1] = "explore";
        world.createLocation("Mine", "A dark mine rich with ore", mineActions);

        string[] memory marketActions = new string[](2);
        marketActions[0] = "trade";
        marketActions[1] = "browse";
        world.createLocation("Market", "A bustling marketplace", marketActions);

        string[] memory farmActions = new string[](2);
        farmActions[0] = "farm";
        farmActions[1] = "harvest";
        world.createLocation("Farm", "Green fields with crops", farmActions);

        vm.stopBroadcast();

        // Log addresses (proxy addresses are what you interact with)
        console.log("AgentRegistry (proxy):", address(registryProxy));
        console.log("WorldState    (proxy):", address(worldProxy));
        console.log("MemoryLedger  (proxy):", address(memoryProxy));
        console.log("");
        console.log("AgentRegistry (impl):", address(registryImpl));
        console.log("WorldState    (impl):", address(worldImpl));
        console.log("MemoryLedger  (impl):", address(memoryImpl));

        // Write proxy addresses to shared JSON file for agent-runner auto-discovery
        string memory json = string.concat(
            '{\n',
            '  "agentRegistryAddress": "', vm.toString(address(registryProxy)), '",\n',
            '  "worldStateAddress": "', vm.toString(address(worldProxy)), '",\n',
            '  "memoryLedgerAddress": "', vm.toString(address(memoryProxy)), '"\n',
            '}'
        );
        vm.writeFile("../deployed-addresses.json", json);
        console.log("\nWrote deployed-addresses.json");
    }
}

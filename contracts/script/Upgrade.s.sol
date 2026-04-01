// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/WorldState.sol";
import "../src/MemoryLedger.sol";

/// @notice Upgrade all three contracts in-place (proxy addresses unchanged)
contract UpgradeScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address registryProxy = vm.envAddress("AGENT_REGISTRY_ADDRESS");
        address worldProxy = vm.envAddress("WORLD_STATE_ADDRESS");
        address memoryProxy = vm.envAddress("MEMORY_LEDGER_ADDRESS");

        vm.startBroadcast(deployerKey);

        // Deploy new implementations
        AgentRegistry newRegistry = new AgentRegistry();
        WorldState newWorld = new WorldState();
        MemoryLedger newMemory = new MemoryLedger();

        // Upgrade proxies to new implementations
        AgentRegistry(registryProxy).upgradeToAndCall(address(newRegistry), "");
        WorldState(worldProxy).upgradeToAndCall(address(newWorld), "");
        MemoryLedger(memoryProxy).upgradeToAndCall(address(newMemory), "");

        vm.stopBroadcast();

        console.log("Upgraded AgentRegistry impl:", address(newRegistry));
        console.log("Upgraded WorldState    impl:", address(newWorld));
        console.log("Upgraded MemoryLedger  impl:", address(newMemory));
        console.log("\nProxy addresses unchanged.");
    }
}

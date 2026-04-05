// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/AgentLedger.sol";
import "../src/LocationLedger.sol";
import "../src/InboxLedger.sol";
import "../src/GameEngine.sol";

contract UpgradeScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address registryProxy = vm.envAddress("AGENT_REGISTRY_ADDRESS");
        address agentLedgerProxy = vm.envAddress("AGENT_LEDGER_ADDRESS");
        address locationLedgerProxy = vm.envAddress("LOCATION_LEDGER_ADDRESS");
        address inboxLedgerProxy = vm.envAddress("INBOX_LEDGER_ADDRESS");
        address engineProxy = vm.envAddress("GAME_ENGINE_ADDRESS");

        vm.startBroadcast(deployerKey);

        AgentRegistry(registryProxy).upgradeToAndCall(address(new AgentRegistry()), "");
        AgentLedger(agentLedgerProxy).upgradeToAndCall(address(new AgentLedger()), "");
        LocationLedger(locationLedgerProxy).upgradeToAndCall(address(new LocationLedger()), "");
        InboxLedger(inboxLedgerProxy).upgradeToAndCall(address(new InboxLedger()), "");
        GameEngine(engineProxy).upgradeToAndCall(address(new GameEngine()), "");

        vm.stopBroadcast();
    }
}

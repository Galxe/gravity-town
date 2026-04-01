// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/AgentLedger.sol";
import "../src/LocationLedger.sol";
import "../src/InboxLedger.sol";

/// @notice Upgrade all contracts in-place (proxy addresses unchanged)
contract UpgradeScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address registryProxy = vm.envAddress("AGENT_REGISTRY_ADDRESS");
        address agentLedgerProxy = vm.envAddress("AGENT_LEDGER_ADDRESS");
        address locationLedgerProxy = vm.envAddress("LOCATION_LEDGER_ADDRESS");
        address inboxLedgerProxy = vm.envAddress("INBOX_LEDGER_ADDRESS");

        vm.startBroadcast(deployerKey);

        AgentRegistry newRegistry = new AgentRegistry();
        AgentLedger newAgentLedger = new AgentLedger();
        LocationLedger newLocationLedger = new LocationLedger();
        InboxLedger newInboxLedger = new InboxLedger();

        AgentRegistry(registryProxy).upgradeToAndCall(address(newRegistry), "");
        AgentLedger(agentLedgerProxy).upgradeToAndCall(address(newAgentLedger), "");
        LocationLedger(locationLedgerProxy).upgradeToAndCall(address(newLocationLedger), "");
        InboxLedger(inboxLedgerProxy).upgradeToAndCall(address(newInboxLedger), "");

        vm.stopBroadcast();

        console.log("Upgraded AgentRegistry   impl:", address(newRegistry));
        console.log("Upgraded AgentLedger     impl:", address(newAgentLedger));
        console.log("Upgraded LocationLedger  impl:", address(newLocationLedger));
        console.log("Upgraded InboxLedger     impl:", address(newInboxLedger));
        console.log("\nProxy addresses unchanged.");
    }
}

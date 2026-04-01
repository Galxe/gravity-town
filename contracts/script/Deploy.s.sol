// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/AgentRegistry.sol";
import "../src/AgentLedger.sol";
import "../src/LocationLedger.sol";
import "../src/InboxLedger.sol";
import "../src/Router.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address operator = vm.envAddress("OPERATOR_ADDRESS");

        vm.startBroadcast(deployerKey);

        // ──── Deploy implementations ────
        AgentRegistry registryImpl = new AgentRegistry();
        AgentLedger agentLedgerImpl = new AgentLedger();
        LocationLedger locationLedgerImpl = new LocationLedger();
        InboxLedger inboxLedgerImpl = new InboxLedger();
        Router routerImpl = new Router();

        // ──── Deploy proxies ────
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(AgentRegistry.initialize, (operator))
        );
        AgentRegistry registry = AgentRegistry(address(registryProxy));

        ERC1967Proxy agentLedgerProxy = new ERC1967Proxy(
            address(agentLedgerImpl),
            abi.encodeCall(AgentLedger.initialize, (address(registry)))
        );

        ERC1967Proxy locationLedgerProxy = new ERC1967Proxy(
            address(locationLedgerImpl),
            abi.encodeCall(LocationLedger.initialize, (address(registry)))
        );
        LocationLedger locationLedger = LocationLedger(address(locationLedgerProxy));

        ERC1967Proxy inboxLedgerProxy = new ERC1967Proxy(
            address(inboxLedgerImpl),
            abi.encodeCall(InboxLedger.initialize, (address(registry)))
        );

        ERC1967Proxy routerProxy = new ERC1967Proxy(
            address(routerImpl),
            abi.encodeCall(Router.initialize, (
                address(registryProxy),
                address(agentLedgerProxy),
                address(locationLedgerProxy),
                address(inboxLedgerProxy)
            ))
        );

        // ──── Create initial locations (hex coordinates) ────
        locationLedger.createLocation("Tavern", "A warm tavern with ale and stories", 0, 0);
        locationLedger.createLocation("Mine", "A dark mine rich with ore", 1, -1);
        locationLedger.createLocation("Market", "A bustling marketplace", 0, 1);
        locationLedger.createLocation("Farm", "Green fields with crops", -1, 0);

        vm.stopBroadcast();

        console.log("Router          (proxy):", address(routerProxy));
        console.log("AgentRegistry   (proxy):", address(registryProxy));
        console.log("AgentLedger     (proxy):", address(agentLedgerProxy));
        console.log("LocationLedger  (proxy):", address(locationLedgerProxy));
        console.log("InboxLedger     (proxy):", address(inboxLedgerProxy));

        // Only write the router address — everything else is resolved on-chain
        string memory json = string.concat(
            '{\n',
            '  "routerAddress": "', vm.toString(address(routerProxy)), '"\n',
            '}'
        );
        vm.writeFile("../deployed-addresses.json", json);
        console.log("Router:", address(routerProxy));
    }
}

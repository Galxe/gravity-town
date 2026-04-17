// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/Router.sol";
import "../src/AgentRegistry.sol";
import "../src/AgentLedger.sol";
import "../src/LocationLedger.sol";
import "../src/InboxLedger.sol";
import "../src/EvaluationLedger.sol";
import "../src/GameEngine.sol";

/// @notice Upgrade all implementations behind existing proxies.
///         Only requires ROUTER_ADDRESS - resolves everything else on-chain.
///         If EvaluationLedger doesn't exist yet, deploys a new proxy for it.
contract UpgradeScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address routerProxy = vm.envAddress("ROUTER_ADDRESS");

        // Read addresses via low-level call to handle both old (5-return) and new (6-return) Router
        address registryProxy;
        address agentLedgerProxy;
        address locationLedgerProxy;
        address inboxLedgerProxy;
        address engineProxy;
        address evalLedgerProxy;

        // Try the new 6-return getAddresses first
        (bool ok, bytes memory data) = routerProxy.staticcall(abi.encodeWithSignature("getAddresses()"));
        require(ok, "getAddresses() failed");

        if (data.length >= 192) {
            // New Router: 6 addresses
            (registryProxy, agentLedgerProxy, locationLedgerProxy, inboxLedgerProxy, engineProxy, evalLedgerProxy)
                = abi.decode(data, (address, address, address, address, address, address));
        } else {
            // Old Router: 5 addresses - EvaluationLedger missing
            (registryProxy, agentLedgerProxy, locationLedgerProxy, inboxLedgerProxy, engineProxy)
                = abi.decode(data, (address, address, address, address, address));
        }

        console.log("Router:          ", routerProxy);
        console.log("AgentRegistry:   ", registryProxy);
        console.log("AgentLedger:     ", agentLedgerProxy);
        console.log("LocationLedger:  ", locationLedgerProxy);
        console.log("InboxLedger:     ", inboxLedgerProxy);
        console.log("GameEngine:      ", engineProxy);
        console.log("EvaluationLedger:", evalLedgerProxy);

        vm.startBroadcast(deployerKey);

        // 1. Upgrade Router first (to add evaluationLedger slot if missing)
        Router(routerProxy).upgradeToAndCall(address(new Router()), "");

        // 2. Deploy EvaluationLedger proxy if it doesn't exist
        if (evalLedgerProxy == address(0)) {
            console.log("EvaluationLedger not found - deploying new proxy...");
            EvaluationLedger evalImpl = new EvaluationLedger();
            ERC1967Proxy evalProxy = new ERC1967Proxy(
                address(evalImpl),
                abi.encodeCall(EvaluationLedger.initialize, (registryProxy))
            );
            evalLedgerProxy = address(evalProxy);
            Router(routerProxy).setEvaluationLedger(evalLedgerProxy);
            console.log("EvaluationLedger (new):", evalLedgerProxy);
        } else {
            EvaluationLedger(evalLedgerProxy).upgradeToAndCall(address(new EvaluationLedger()), "");
        }

        // 3. Upgrade remaining contracts
        AgentRegistry(registryProxy).upgradeToAndCall(address(new AgentRegistry()), "");
        AgentLedger(agentLedgerProxy).upgradeToAndCall(address(new AgentLedger()), "");
        LocationLedger(locationLedgerProxy).upgradeToAndCall(address(new LocationLedger()), "");
        InboxLedger(inboxLedgerProxy).upgradeToAndCall(address(new InboxLedger()), "");
        GameEngine(engineProxy).upgradeToAndCall(address(new GameEngine()), "");

        // 4. Wire up new contracts if needed (setAgentLedger, setEvaluationLedger on GameEngine)
        GameEngine engine = GameEngine(engineProxy);
        // Only set if not already wired
        (bool hasEval,) = engineProxy.staticcall(abi.encodeWithSignature("evaluationLedger()"));
        if (hasEval) {
            (bool okEval, bytes memory evalData) = engineProxy.staticcall(abi.encodeWithSignature("evaluationLedger()"));
            if (okEval && evalData.length >= 32) {
                address currentEval = abi.decode(evalData, (address));
                if (currentEval == address(0)) {
                    engine.setEvaluationLedger(evalLedgerProxy);
                    console.log("Wired EvaluationLedger on GameEngine");
                }
            }
        }

        // Initialize World Bible if not yet done
        (bool hasWb, bytes memory wbData) = engineProxy.staticcall(abi.encodeWithSignature("worldBibleLocationId()"));
        if (hasWb && wbData.length >= 32) {
            uint256 wbLocId = abi.decode(wbData, (uint256));
            if (wbLocId == 0) {
                engine.initWorldBible();
                console.log("Initialized World Bible");
            }
        }

        vm.stopBroadcast();

        console.log("All contracts upgraded successfully");
    }
}

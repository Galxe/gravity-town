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
import "../src/GTreasury.sol";
import "../src/CardLedger.sol";
import "../src/ArenaEngine.sol";

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

        // 5. GTreasury: deploy fresh proxy if router slot is unset, else upgrade.
        address treasuryProxy;
        (bool okTreasury, bytes memory treasuryData) = routerProxy.staticcall(abi.encodeWithSignature("gTreasury()"));
        if (okTreasury && treasuryData.length >= 32) {
            treasuryProxy = abi.decode(treasuryData, (address));
        }

        if (treasuryProxy == address(0)) {
            console.log("GTreasury not found - deploying new proxy...");
            GTreasury treasuryImpl = new GTreasury();
            ERC1967Proxy newTreasury = new ERC1967Proxy(
                address(treasuryImpl),
                abi.encodeCall(GTreasury.initialize, (registryProxy))
            );
            treasuryProxy = address(newTreasury);
            Router(routerProxy).setGTreasury(treasuryProxy);
            console.log("GTreasury        (new):", treasuryProxy);
        } else {
            GTreasury(treasuryProxy).upgradeToAndCall(address(new GTreasury()), "");
            console.log("GTreasury upgraded:", treasuryProxy);
        }

        // 6. CardLedger: deploy fresh proxy if router slot is unset, else upgrade.
        address cardLedgerProxy;
        (bool okCards, bytes memory cardData) = routerProxy.staticcall(abi.encodeWithSignature("cardLedger()"));
        if (okCards && cardData.length >= 32) {
            cardLedgerProxy = abi.decode(cardData, (address));
        }

        if (cardLedgerProxy == address(0)) {
            console.log("CardLedger not found - deploying new proxy...");
            CardLedger cardImpl = new CardLedger();
            ERC1967Proxy newCards = new ERC1967Proxy(
                address(cardImpl),
                abi.encodeCall(CardLedger.initialize, (registryProxy, treasuryProxy))
            );
            cardLedgerProxy = address(newCards);
            Router(routerProxy).setCardLedger(cardLedgerProxy);
            console.log("CardLedger       (new):", cardLedgerProxy);
        } else {
            CardLedger(cardLedgerProxy).upgradeToAndCall(address(new CardLedger()), "");
            console.log("CardLedger upgraded:", cardLedgerProxy);
        }
        AgentRegistry(registryProxy).addOperator(cardLedgerProxy);

        // 7. ArenaEngine: deploy fresh proxy if router slot is unset, else upgrade.
        //    Same shape as the EvaluationLedger backfill above.
        address arenaProxy;
        (bool okArena, bytes memory arenaData) = routerProxy.staticcall(abi.encodeWithSignature("arenaEngine()"));
        if (okArena && arenaData.length >= 32) {
            arenaProxy = abi.decode(arenaData, (address));
        }

        if (arenaProxy == address(0)) {
            console.log("ArenaEngine not found - deploying new proxy...");
            ArenaEngine arenaImpl = new ArenaEngine();
            ERC1967Proxy newArena = new ERC1967Proxy(
                address(arenaImpl),
                abi.encodeCall(ArenaEngine.initialize, (
                    registryProxy,
                    engineProxy,
                    evalLedgerProxy,
                    treasuryProxy,
                    cardLedgerProxy
                ))
            );
            arenaProxy = address(newArena);
            Router(routerProxy).setArenaEngine(arenaProxy);
            // Arena needs to mint cards, spend/credit G, and write evaluations.
            AgentRegistry(registryProxy).addOperator(arenaProxy);
            console.log("ArenaEngine      (new):", arenaProxy);
        } else {
            ArenaEngine(arenaProxy).upgradeToAndCall(address(new ArenaEngine()), "");
            ArenaEngine(arenaProxy).setGTreasury(treasuryProxy);
            ArenaEngine(arenaProxy).setCardLedger(cardLedgerProxy);
            AgentRegistry(registryProxy).addOperator(arenaProxy);
            console.log("ArenaEngine upgraded:", arenaProxy);
        }
        CardLedger(cardLedgerProxy).setArenaEngine(arenaProxy);

        // 8. Seed the market once, after all operators and links exist.
        if (!ArenaEngine(arenaProxy).marketSeeded()) {
            address operator = AgentRegistry(registryProxy).operator();
            bytes32 seedName = keccak256(bytes("MarketSeed"));
            uint256 seedAgentId = AgentRegistry(registryProxy).namedAgents(operator, seedName);
            if (seedAgentId == 0) {
                uint8[4] memory seedStats = [uint8(5), 5, 5, 5];
                (seedAgentId, ) = engine.createAgent("MarketSeed", "arena market maker", seedStats, operator);
            }
            ArenaEngine(arenaProxy).bootstrapMarket(seedAgentId);
            console.log("Bootstrapped arena market with seed agent:", seedAgentId);
        }

        vm.stopBroadcast();

        console.log("All contracts upgraded successfully");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/AgentRegistry.sol";
import "../src/AgentLedger.sol";
import "../src/LocationLedger.sol";
import "../src/InboxLedger.sol";
import "../src/EvaluationLedger.sol";
import "../src/GameEngine.sol";
import "../src/GTreasury.sol";
import "../src/CardLedger.sol";
import "../src/ArenaEngine.sol";
import "../src/Router.sol";

contract DeployScript is Script {
    uint256 constant GRAVITY_MAINNET_CHAIN_ID = 127001;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address operator = vm.envAddress("OPERATOR_ADDRESS");

        vm.startBroadcast(deployerKey);

        // ──── Deploy implementations ────
        AgentRegistry registryImpl         = new AgentRegistry();
        AgentLedger agentLedgerImpl        = new AgentLedger();
        LocationLedger locationLedgerImpl  = new LocationLedger();
        InboxLedger inboxLedgerImpl        = new InboxLedger();
        EvaluationLedger evalLedgerImpl    = new EvaluationLedger();
        Router routerImpl                  = new Router();

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

        ERC1967Proxy evalLedgerProxy = new ERC1967Proxy(
            address(evalLedgerImpl),
            abi.encodeCall(EvaluationLedger.initialize, (address(registry)))
        );

        // ──── Deploy GameEngine (needs registry + locationLedger) ────
        GameEngine engineImpl = new GameEngine();
        ERC1967Proxy engineProxy = new ERC1967Proxy(
            address(engineImpl),
            abi.encodeCall(GameEngine.initialize, (address(registry), address(locationLedger)))
        );
        GameEngine engine = GameEngine(address(engineProxy));

        // ──── Deploy Arena G treasury + persistent card ledger ────
        GTreasury treasuryImpl = new GTreasury();
        ERC1967Proxy treasuryProxy = new ERC1967Proxy(
            address(treasuryImpl),
            abi.encodeCall(GTreasury.initialize, (address(registry)))
        );

        CardLedger cardLedgerImpl = new CardLedger();
        ERC1967Proxy cardLedgerProxy = new ERC1967Proxy(
            address(cardLedgerImpl),
            abi.encodeCall(CardLedger.initialize, (address(registry), address(treasuryProxy)))
        );
        CardLedger cardLedger = CardLedger(address(cardLedgerProxy));

        // ──── Deploy Router ────
        ERC1967Proxy routerProxy = new ERC1967Proxy(
            address(routerImpl),
            abi.encodeCall(Router.initialize, (
                address(registryProxy),
                address(agentLedgerProxy),
                address(locationLedgerProxy),
                address(inboxLedgerProxy),
                address(engineProxy),
                address(evalLedgerProxy)
            ))
        );

        // ──── Grant operators on Registry ────
        registry.addOperator(address(engine));
        registry.addOperator(address(cardLedgerProxy));

        // ──── Set ledgers on GameEngine ────
        engine.setAgentLedger(address(agentLedgerProxy));
        engine.setEvaluationLedger(address(evalLedgerProxy));

        // ──── Deploy ArenaEngine (side system on top of main world) ────
        ArenaEngine arenaImpl = new ArenaEngine();
        ERC1967Proxy arenaProxy = new ERC1967Proxy(
            address(arenaImpl),
            abi.encodeCall(ArenaEngine.initialize, (
                address(registry),
                address(engine),
                address(evalLedgerProxy),
                address(treasuryProxy),
                address(cardLedgerProxy)
            ))
        );
        // Arena needs to mint cards, spend/credit G, and write evaluations.
        registry.addOperator(address(arenaProxy));
        cardLedger.setArenaEngine(address(arenaProxy));
        Router(address(routerProxy)).setArenaEngine(address(arenaProxy));
        Router(address(routerProxy)).setGTreasury(address(treasuryProxy));
        Router(address(routerProxy)).setCardLedger(address(cardLedgerProxy));

        // Mainnet runs a full-backing G economy: no free faucet, G is withdrawable.
        // bootstrapMarket faucet-mints unbacked G, so it is skipped on mainnet; the
        // treasury is switched to withdraw mode instead. Testnet/anvil keep the faucet
        // and seeded market.
        uint256 seedAgentId = 0;
        if (block.chainid == GRAVITY_MAINNET_CHAIN_ID) {
            // faucet OFF first — setWithdrawEnabled requires !faucetEnabled.
            GTreasury(address(treasuryProxy)).setFaucetEnabled(false);
            GTreasury(address(treasuryProxy)).setWithdrawEnabled(true);
        } else {
            uint8[4] memory seedStats = [uint8(5), 5, 5, 5];
            (seedAgentId, ) = engine.createAgent("MarketSeed", "arena market maker", seedStats, operator);
            ArenaEngine(address(arenaProxy)).bootstrapMarket(seedAgentId);
        }

        // ──── Initialize World Bible ────
        engine.initWorldBible();

        vm.stopBroadcast();

        console.log("Router           (proxy):", address(routerProxy));
        console.log("AgentRegistry    (proxy):", address(registryProxy));
        console.log("AgentLedger      (proxy):", address(agentLedgerProxy));
        console.log("LocationLedger   (proxy):", address(locationLedgerProxy));
        console.log("InboxLedger      (proxy):", address(inboxLedgerProxy));
        console.log("EvaluationLedger (proxy):", address(evalLedgerProxy));
        console.log("GameEngine       (proxy):", address(engineProxy));
        console.log("ArenaEngine      (proxy):", address(arenaProxy));
        console.log("GTreasury        (proxy):", address(treasuryProxy));
        console.log("CardLedger       (proxy):", address(cardLedgerProxy));

        string memory json = string.concat(
            '{\n',
            '  "routerAddress": "', vm.toString(address(routerProxy)), '",\n',
            '  "agentRegistry": "', vm.toString(address(registryProxy)), '",\n',
            '  "agentLedger": "', vm.toString(address(agentLedgerProxy)), '",\n',
            '  "locationLedger": "', vm.toString(address(locationLedgerProxy)), '",\n',
            '  "inboxLedger": "', vm.toString(address(inboxLedgerProxy)), '",\n',
            '  "evaluationLedger": "', vm.toString(address(evalLedgerProxy)), '",\n',
            '  "gameEngine": "', vm.toString(address(engineProxy)), '",\n',
            '  "arenaEngine": "', vm.toString(address(arenaProxy)), '",\n',
            '  "gTreasury": "', vm.toString(address(treasuryProxy)), '",\n',
            '  "cardLedger": "', vm.toString(address(cardLedgerProxy)), '",\n',
            '  "marketSeedAgentId": "', vm.toString(seedAgentId), '"\n',
            '}'
        );
        vm.writeFile("../deployed-addresses.json", json);
    }
}

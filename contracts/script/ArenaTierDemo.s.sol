// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/Router.sol";
import "../src/GameEngine.sol";
import "../src/ArenaEngine.sol";
import "../src/GTreasury.sol";

/// @title ArenaTierDemo — LOCAL demo seeder (not for production).
/// @notice Creates three agents, funds them into Bronze / Silver / Gold via the
///         GTreasury faucet, gives each a one-unit bench, and submits them so the
///         `/arena` leaderboard renders the tier badges + G column. Resolves every
///         address from the Router (pass ROUTER_ADDR) — no file reads.
///
///         Run (local anvil):
///           ROUTER_ADDR=0x... PRIVATE_KEY=0x... \
///           forge script script/ArenaTierDemo.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
contract ArenaTierDemoScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(deployerKey);
        address routerAddr = vm.envAddress("ROUTER_ADDR");

        ( , , , , address engineAddr, , address arenaAddr) = Router(routerAddr).getAddressesV2();
        GameEngine engine = GameEngine(engineAddr);
        ArenaEngine arena = ArenaEngine(arenaAddr);
        GTreasury gt = arena.gTreasury();

        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        uint256[3] memory gAmounts = [uint256(50), uint256(500), uint256(5000)];
        string[3] memory names = ["BronzeBot", "SilverBot", "GoldBot"];

        vm.startBroadcast(deployerKey);
        for (uint256 i = 0; i < 3; i++) {
            (uint256 aid, ) = engine.createAgent(names[i], "demo", stats, me);
            gt.fundAgentG(aid, gAmounts[i]);
            uint256 cardId = arena.buy(aid, 1); // Mineworker — buy mints to inventory
            arena.placeCard(aid, cardId, 0);    // place it on the bench
            arena.submit(aid);
            console.log(names[i], "-> agentId", aid);
        }
        vm.stopBroadcast();

        console.log("Bronze pop:", arena.tierPopulation(ArenaEngine.Tier.Bronze));
        console.log("Silver pop:", arena.tierPopulation(ArenaEngine.Tier.Silver));
        console.log("Gold   pop:", arena.tierPopulation(ArenaEngine.Tier.Gold));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/GameEngine.sol";
import "../src/ArenaEngine.sol";
import "../src/GTreasury.sol";

interface IRouterMin {
    function gameEngine() external view returns (address);
    function arenaEngine() external view returns (address);
}

/// @notice Seed the Arena on a FRESH local/dev chain with a varied roster:
///         12 named agents, 4 in each G-tier (Bronze / Silver / Gold), each with
///         a full 5-unit bench (buy card → place on slot). Submits everyone, runs
///         per-tier matchmaking, and settles the matches.
///
/// Assumes a freshly deployed chain. To reseed, restart anvil + redeploy first.
///
/// Usage:
///   NO_PROXY=127.0.0.1,localhost \
///   PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
///   ROUTER_ADDRESS=<router> \
///   forge script script/SeedArena.s.sol --rpc-url http://127.0.0.1:8545 --broadcast -v
contract SeedArena is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address router = vm.envAddress("ROUTER_ADDRESS");
        address owner = vm.addr(deployerKey);

        GameEngine engine = GameEngine(IRouterMin(router).gameEngine());
        ArenaEngine arena = ArenaEngine(IRouterMin(router).arenaEngine());
        GTreasury gt = arena.gTreasury();

        // 4 agents per tier. G is funded so the post-purchase balance (after a
        // ~20G bench) sits inside the intended band, with spread within each tier
        // so the leaderboard's G column varies.
        //   Bronze < 100 · Silver 100-999 · Gold >= 1000
        string[12] memory names = [
            "Ash", "Bram", "Cael", "Dorn",      // Bronze
            "Edda", "Finn", "Gwen", "Hale",     // Silver
            "Iris", "Juno", "Kane", "Lux"       // Gold
        ];
        uint256[12] memory gFund = [
            uint256(60), 80, 100, 110,          // Bronze
            200, 350, 500, 800,                 // Silver
            1300, 2600, 5000, 9000              // Gold
        ];
        uint8[4] memory stats = [uint8(5), 5, 5, 5];

        vm.startBroadcast(deployerKey);

        for (uint256 k = 0; k < names.length; k++) {
            (uint256 agentId, ) = engine.createAgent(
                names[k],
                "seeded arena fighter",
                stats,
                owner
            );
            gt.fundAgentG(agentId, gFund[k]);

            uint8[5] memory bench = _benchFor(k);
            for (uint8 s = 0; s < 5; s++) {
                if (bench[s] != 0) {
                    uint256 cardId = arena.buy(agentId, bench[s]); // mint to inventory
                    arena.placeCard(agentId, cardId, s);           // place on bench
                }
            }
            arena.submit(agentId);
        }

        // Pair + settle within each tier (4 ghosts → 2 matches per tier).
        uint256 startMatch = arena.nextMatchId();
        arena.runMatchmaking(ArenaEngine.Tier.Bronze);
        arena.runMatchmaking(ArenaEngine.Tier.Silver);
        arena.runMatchmaking(ArenaEngine.Tier.Gold);
        uint256 endMatch = arena.nextMatchId();

        for (uint256 m = startMatch; m < endMatch; m++) {
            arena.settleMatch(m);
        }

        vm.stopBroadcast();

        console.log("Arena seeded. Agents created:", names.length);
        console.log("Matches created & settled:", endMatch - startMatch);
    }

    /// @dev Six distinct 5-unit lineups (unit types 1-12), cycled across agents.
    function _benchFor(uint256 i) internal pure returns (uint8[5] memory b) {
        uint256 r = i % 6;
        if (r == 0) {
            b = [uint8(4), 5, 6, 1, 2];
        } else if (r == 1) {
            b = [uint8(7), 8, 2, 3, 1];
        } else if (r == 2) {
            b = [uint8(1), 2, 3, 4, 5];
        } else if (r == 3) {
            b = [uint8(10), 6, 8, 2, 3];
        } else if (r == 4) {
            b = [uint8(9), 3, 5, 1, 7];
        } else {
            b = [uint8(11), 2, 7, 4, 6];
        }
    }
}

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

/// @notice Seed the Arena on a FRESH local/dev chain so the frontend has data.
///         Creates named agents spread across all three G-tiers, gives each a
///         full 5-unit bench (buy card → place on slot), submits them, runs
///         tier matchmaking, and settles the matches.
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

        string[6] memory names = ["Vex", "Rook", "Mira", "Nova", "Kael", "Zara"];
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        // G funded per agent. After spending ~20G on a 5-card bench the remaining
        // balance lands two agents in each tier: Bronze(<100), Silver(100-999),
        // Gold(>=1000). Thresholds come from the contract; these are chosen to
        // sit comfortably inside each band post-purchase.
        uint256[6] memory gFund = [uint256(120), 120, 700, 700, 6000, 6000];

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

        // Pair + settle within each tier.
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

    /// @dev Distinct 5-unit lineups (unit types 1-12) so battles differ.
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

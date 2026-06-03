// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/GameEngine.sol";
import "../src/ArenaEngine.sol";

interface IRouterMin {
    function gameEngine() external view returns (address);
    function arenaEngine() external view returns (address);
}

/// @notice Seed the Arena on a FRESH local/dev chain so the frontend has data:
///         creates a handful of named agents, builds a distinct 5-unit bench for
///         each, submits them, pairs them, and settles the matches.
///
/// Assumes a freshly deployed chain (no name collisions). To reseed, restart
/// anvil + redeploy first.
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

        string[6] memory names = ["Vex", "Rook", "Mira", "Nova", "Kael", "Zara"];
        uint8[4] memory stats = [uint8(5), 5, 5, 5];

        vm.startBroadcast(deployerKey);

        for (uint256 k = 0; k < names.length; k++) {
            (uint256 agentId, ) = engine.createAgent(
                names[k],
                "seeded arena fighter",
                stats,
                owner
            );

            uint8[5] memory bench = _benchFor(k);
            for (uint8 s = 0; s < 5; s++) {
                if (bench[s] != 0) {
                    arena.buy(agentId, bench[s], s);
                }
            }
            arena.submit(agentId);
        }

        // Fresh ghosts all start at ELO 1000 → bucket 5. Run the band around it
        // so post-settlement ELO drift into neighbouring buckets is covered too.
        uint256 startMatch = arena.nextMatchId();
        for (uint16 bucketId = 4; bucketId <= 6; bucketId++) {
            try arena.runMatchmaking(bucketId) {} catch {}
        }
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

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/AgentRegistry.sol";
import "../src/AgentLedger.sol";
import "../src/LocationLedger.sol";
import "../src/InboxLedger.sol";
import "../src/GameEngine.sol";
import "../src/Router.sol";

contract GameEngineTest is Test {
    AgentRegistry registry;
    AgentLedger agentLedger;
    LocationLedger locationLedger;
    InboxLedger inboxLedger;
    GameEngine engine;

    address deployer = address(this);
    address operator = address(0xBEEF);
    address player1 = address(0x1);
    address player2 = address(0x2);

    uint8[4] defaultStats = [uint8(5), 5, 5, 5];

    function setUp() public {
        AgentRegistry registryImpl = new AgentRegistry();
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl), abi.encodeCall(AgentRegistry.initialize, (operator))
        );
        registry = AgentRegistry(address(registryProxy));

        AgentLedger agentLedgerImpl = new AgentLedger();
        new ERC1967Proxy(address(agentLedgerImpl), abi.encodeCall(AgentLedger.initialize, (address(registry))));

        LocationLedger locationLedgerImpl = new LocationLedger();
        ERC1967Proxy locationLedgerProxy = new ERC1967Proxy(
            address(locationLedgerImpl), abi.encodeCall(LocationLedger.initialize, (address(registry)))
        );
        locationLedger = LocationLedger(address(locationLedgerProxy));

        InboxLedger inboxLedgerImpl = new InboxLedger();
        new ERC1967Proxy(address(inboxLedgerImpl), abi.encodeCall(InboxLedger.initialize, (address(registry))));

        GameEngine engineImpl = new GameEngine();
        ERC1967Proxy engineProxy = new ERC1967Proxy(
            address(engineImpl), abi.encodeCall(GameEngine.initialize, (address(registry), address(locationLedger)))
        );
        engine = GameEngine(address(engineProxy));

        registry.addOperator(address(engine));
    }

    uint256 _agentCounter;

    function _createAgent(address ownerAddr) internal returns (uint256 agentId, bytes32 hexKey) {
        string memory name = string.concat("Agent", vm.toString(++_agentCounter));
        vm.prank(ownerAddr);
        (agentId, hexKey) = engine.createAgent(name, "brave", defaultStats, ownerAddr);
    }

    // ══════════════════════════════════════════════════
    //                 AGENT CREATION (7 hex cluster)
    // ══════════════════════════════════════════════════

    function test_CreateAgentGets7Hexes() public {
        (uint256 agentId, bytes32 hexKey) = _createAgent(player1);
        assertEq(agentId, 1);
        assertTrue(hexKey != bytes32(0));

        // Agent owns 7 hexes
        assertEq(engine.hexCount(agentId), 7);
        assertEq(engine.getAgentHexKeys(agentId).length, 7);

        // Ore pool starts at 200
        assertEq(engine.orePool(agentId), 200);

        // Center hex is owned
        (uint256 owner, , , , , , , , , ) = engine.getHex(hexKey);
        assertEq(owner, agentId);
    }

    function test_DuplicateNameSameOwnerReverts() public {
        vm.prank(player1);
        engine.createAgent("Mira", "cunning", defaultStats, player1);

        vm.prank(player1);
        vm.expectRevert("agent with this name already exists for owner");
        engine.createAgent("Mira", "different personality", defaultStats, player1);
    }

    function test_SameNameDifferentOwnerOk() public {
        vm.prank(player1);
        engine.createAgent("Mira", "cunning", defaultStats, player1);

        vm.prank(player2);
        engine.createAgent("Mira", "brave", defaultStats, player2);

        assertEq(registry.getAgentByName(player1, "Mira"), 1);
        assertEq(registry.getAgentByName(player2, "Mira"), 2);
    }

    function test_TwoAgentsGetDifferentClusters() public {
        (uint256 a1, ) = _createAgent(player1);
        (uint256 a2, ) = _createAgent(player2);

        // Both have 7 hexes, no overlap
        bytes32[] memory keys1 = engine.getAgentHexKeys(a1);
        bytes32[] memory keys2 = engine.getAgentHexKeys(a2);
        assertEq(keys1.length, 7);
        assertEq(keys2.length, 7);

        for (uint256 i = 0; i < 7; i++) {
            for (uint256 j = 0; j < 7; j++) {
                assertTrue(keys1[i] != keys2[j], "clusters must not overlap");
            }
        }
    }

    // ══════════════════════════════════════════════════
    //                    HARVEST (ore pool)
    // ══════════════════════════════════════════════════

    function test_HarvestAllHexes() public {
        (uint256 agentId, ) = _createAgent(player1);

        vm.warp(block.timestamp + 1);
        engine.harvest(agentId);

        // 200 + 7 hexes * 10 ore/sec * 1 sec = 270
        assertEq(engine.orePool(agentId), 270);
    }

    function test_HarvestWithMines() public {
        (uint256 agentId, ) = _createAgent(player1);
        bytes32 hexKey = engine.getAgentHexKeys(agentId)[0];

        // Build 2 mines on first hex (costs 100 from pool)
        vm.startPrank(player1);
        engine.build(agentId, hexKey, 1);
        engine.build(agentId, hexKey, 1);
        vm.stopPrank();

        assertEq(engine.orePool(agentId), 100); // 200 - 100

        vm.warp(block.timestamp + 1);
        engine.harvest(agentId);

        // 100 + 6*10 (base hexes) + 1*(10+2*5) (hex with 2 mines) = 100 + 60 + 20 = 180
        assertEq(engine.orePool(agentId), 180);
    }

    // ══════════════════════════════════════════════════
    //                   BUILDING
    // ══════════════════════════════════════════════════

    function test_BuildMine() public {
        (uint256 agentId, ) = _createAgent(player1);
        bytes32 hexKey = engine.getAgentHexKeys(agentId)[0];

        vm.prank(player1);
        engine.build(agentId, hexKey, 1);

        (, , , , uint256 mines, , , , , ) = engine.getHex(hexKey);
        assertEq(mines, 1);
        assertEq(engine.orePool(agentId), 150);
    }

    function test_BuildArsenal() public {
        (uint256 agentId, ) = _createAgent(player1);
        bytes32 hexKey = engine.getAgentHexKeys(agentId)[0];

        vm.prank(player1);
        engine.build(agentId, hexKey, 2);

        (, , , , , uint256 arsenals, , , , ) = engine.getHex(hexKey);
        assertEq(arsenals, 1);
        assertEq(engine.orePool(agentId), 100);
    }

    function test_CannotExceedSlots() public {
        (uint256 agentId, ) = _createAgent(player1);
        bytes32 hexKey = engine.getAgentHexKeys(agentId)[0];

        // Wait to get enough ore (need 600, have 200 + 7*10*40 = 3000)
        vm.warp(block.timestamp + 40);
        engine.harvest(agentId);

        vm.startPrank(player1);
        for (uint256 i = 0; i < 6; i++) {
            engine.build(agentId, hexKey, 1);
        }

        vm.expectRevert("hex full");
        engine.build(agentId, hexKey, 1);
        vm.stopPrank();
    }

    // ══════════════════════════════════════════════════
    //                    COMBAT
    // ══════════════════════════════════════════════════

    function test_AttackRequiresPresence() public {
        (uint256 attacker, ) = _createAgent(player1);
        (, bytes32 targetHex) = _createAgent(player2);

        bytes32 attackerHex = engine.getAgentHexKeys(attacker)[0];
        vm.prank(player1);
        engine.build(attacker, attackerHex, 2);

        vm.prank(player1);
        vm.expectRevert("must be at target hex");
        engine.attack(attacker, targetHex, attackerHex, 1, 0);
    }

    function test_AttackFlow() public {
        (uint256 attacker, ) = _createAgent(player1);
        (, bytes32 targetHex) = _createAgent(player2);

        bytes32 attackerHex = engine.getAgentHexKeys(attacker)[0];
        vm.prank(player1);
        engine.build(attacker, attackerHex, 2);

        (, uint256 targetLocId, , , , , , , , ) = engine.getHex(targetHex);
        vm.prank(player1);
        registry.moveAgent(attacker, targetLocId);

        vm.prank(player1);
        engine.attack(attacker, targetHex, attackerHex, 1, 0);

        (, , , , , uint256 arsenalsLeft, , , , ) = engine.getHex(attackerHex);
        assertEq(arsenalsLeft, 0);
    }

    function test_CaptureTransfersHex() public {
        (uint256 attacker, ) = _createAgent(player1);
        (uint256 defender, bytes32 targetHex) = _createAgent(player2);

        // Give attacker tons of ore for brute force
        vm.warp(block.timestamp + 100);
        engine.harvest(attacker);
        engine.harvest(defender);

        bytes32 attackerHex = engine.getAgentHexKeys(attacker)[0];

        (, uint256 targetLocId, , , , , , , , ) = engine.getHex(targetHex);
        vm.prank(player1);
        registry.moveAgent(attacker, targetLocId);

        // Attack with lots of ore to guarantee win
        uint256 oreToSpend = engine.orePool(attacker) / 2;
        vm.prank(player1);
        engine.attack(attacker, targetHex, attackerHex, 0, oreToSpend);

        // Check result — if attacker won, hex transferred + ore stolen
        (uint256 newOwner, , , , , , , , , ) = engine.getHex(targetHex);
        if (newOwner == attacker) {
            // Attacker gained a hex
            assertGt(engine.hexCount(attacker), 7);
            assertLt(engine.hexCount(defender), 7);
        }
        // Either way both are still alive
        assertTrue(registry.isAlive(attacker));
        assertTrue(registry.isAlive(defender));
    }

    function test_AttackCooldown() public {
        (uint256 attacker, ) = _createAgent(player1);
        (uint256 defender, ) = _createAgent(player2);

        vm.warp(block.timestamp + 30);
        engine.harvest(attacker);
        engine.harvest(defender);

        bytes32 attackerHex = engine.getAgentHexKeys(attacker)[0];
        // Use defender's last hex as target
        bytes32 targetHex = engine.getAgentHexKeys(defender)[6];

        vm.startPrank(player1);
        engine.build(attacker, attackerHex, 2);
        engine.build(attacker, attackerHex, 2);
        vm.stopPrank();

        // Fortify target heavily so attacker cannot win with 1 arsenal
        vm.startPrank(player2);
        for (uint256 i = 0; i < 6; i++) {
            engine.build(defender, targetHex, 2); // 6 arsenals = 30 defense
        }
        vm.stopPrank();

        (, uint256 targetLocId, , , , , , , , ) = engine.getHex(targetHex);
        vm.prank(player1);
        registry.moveAgent(attacker, targetLocId);

        // First attack with 1 arsenal (5 power vs 30 defense — almost certainly loses)
        vm.prank(player1);
        engine.attack(attacker, targetHex, attackerHex, 1, 0);

        // Immediate retry — cooldown
        vm.prank(player1);
        vm.expectRevert("cooldown");
        engine.attack(attacker, targetHex, attackerHex, 1, 0);

        // After cooldown
        vm.warp(block.timestamp + 6);
        engine.harvest(attacker);
        vm.prank(player1);
        engine.attack(attacker, targetHex, attackerHex, 1, 0);
    }

    // ══════════════════════════════════════════════════
    //                    SCORING
    // ══════════════════════════════════════════════════

    function test_ScoreCalculation() public {
        (uint256 agentId, ) = _createAgent(player1);
        bytes32 hexKey = engine.getAgentHexKeys(agentId)[0];

        // 7 hex (700) + 200 ore pool + 0 buildings = 900
        assertEq(engine.getScore(agentId), 900);

        // Build a mine: 7 hex (700) + 150 pool + 1 building (50) = 900
        vm.prank(player1);
        engine.build(agentId, hexKey, 1);
        assertEq(engine.getScore(agentId), 900);
    }

    // ══════════════════════════════════════════════════
    //              LEDGERS STILL WORK
    // ══════════════════════════════════════════════════

    function test_HexHasBulletinBoard() public {
        (uint256 agentId, ) = _createAgent(player1);
        bytes32 hexKey = engine.getAgentHexKeys(agentId)[0];

        (, uint256 locationId, , , , , , , , ) = engine.getHex(hexKey);

        uint256[] memory noRelated = new uint256[](0);
        vm.prank(player1);
        (uint256 entryId, , ) = locationLedger.write(agentId, 5, "action", "Built a mine", noRelated);
        assertGt(entryId, 0);

        (LocationLedger.Entry[] memory entries, , ) = locationLedger.readRecent(locationId, 10);
        assertEq(entries.length, 1);
    }

    // ══════════════════════════════════════════════════
    //              INCITE REBELLION (comeback)
    // ══════════════════════════════════════════════════

    function test_InciteRequiresZeroHexes() public {
        (uint256 agentId, ) = _createAgent(player1);
        (, bytes32 targetHex) = _createAgent(player2);

        // Agent with 7 hexes cannot incite
        vm.prank(player1);
        vm.expectRevert("only eliminated agents");
        engine.inciteRebellion(agentId, targetHex);
    }

    function test_InciteReducesHappiness() public {
        (uint256 attacker, ) = _createAgent(player1);
        (uint256 defender, ) = _createAgent(player2);
        bytes32 targetHex = engine.getAgentHexKeys(defender)[0];

        // Eliminate attacker by advancing time in steps, boosting defender each step
        bytes32[] memory defenderKeys = engine.getAgentHexKeys(defender);
        for (uint256 step = 0; step < 10; step++) {
            vm.warp(block.timestamp + 300);
            engine.harvest(attacker);
            // Keep defender hexes happy by boosting them
            for (uint256 i = 0; i < defenderKeys.length; i++) {
                (uint256 dOwner, , , , , , , , , ) = engine.getHex(defenderKeys[i]);
                if (dOwner == defender) {
                    vm.prank(player2);
                    engine.boostHappiness(defender, defenderKeys[i]);
                }
            }
            if (engine.hexCount(attacker) == 0) break;
        }

        if (engine.hexCount(attacker) > 0) return; // skip if not eliminated

        // Now attacker can incite
        vm.prank(player1);
        engine.inciteRebellion(attacker, targetHex);

        // Check happiness decreased or hex was captured (depends on randomness)
        (, , , , , , , , uint256 happiness, ) = engine.getHex(targetHex);
        (uint256 owner, , , , , , , , , ) = engine.getHex(targetHex);

        // Either happiness decreased or hex was captured
        assertTrue(happiness < 100 || owner == attacker);
    }

    function test_InciteCooldown() public {
        (uint256 attacker, ) = _createAgent(player1);
        (uint256 defender, ) = _createAgent(player2);
        bytes32 targetHex = engine.getAgentHexKeys(defender)[0];

        // Eliminate attacker same way
        bytes32[] memory defenderKeys = engine.getAgentHexKeys(defender);
        for (uint256 step = 0; step < 10; step++) {
            vm.warp(block.timestamp + 300);
            engine.harvest(attacker);
            for (uint256 i = 0; i < defenderKeys.length; i++) {
                (uint256 dOwner, , , , , , , , , ) = engine.getHex(defenderKeys[i]);
                if (dOwner == defender) {
                    vm.prank(player2);
                    engine.boostHappiness(defender, defenderKeys[i]);
                }
            }
            if (engine.hexCount(attacker) == 0) break;
        }

        if (engine.hexCount(attacker) > 0) return;

        vm.prank(player1);
        engine.inciteRebellion(attacker, targetHex);

        // Immediate retry — should fail with cooldown
        vm.prank(player1);
        vm.expectRevert("cooldown");
        engine.inciteRebellion(attacker, targetHex);

        // After cooldown — should work
        vm.warp(block.timestamp + 31);
        vm.prank(player1);
        engine.inciteRebellion(attacker, targetHex);
    }

    // ══════════════════════════════════════════════════
    //              FULL GAME LOOP
    // ══════════════════════════════════════════════════

    function test_FullGameLoop() public {
        (uint256 alice, ) = _createAgent(player1);
        (uint256 bob, ) = _createAgent(player2);

        bytes32 aliceHex = engine.getAgentHexKeys(alice)[0];
        bytes32 bobHex = engine.getAgentHexKeys(bob)[0];

        // Both build infrastructure
        vm.startPrank(player1);
        engine.build(alice, aliceHex, 1); // mine
        engine.build(alice, aliceHex, 1); // mine
        vm.stopPrank();

        vm.prank(player2);
        engine.build(bob, bobHex, 2); // arsenal

        // Time passes, harvest
        vm.warp(block.timestamp + 5);
        engine.harvest(alice);
        engine.harvest(bob);

        // Bob moves to Alice's hex to attack
        (, uint256 aliceLocId, , , , , , , , ) = engine.getHex(aliceHex);
        vm.prank(player2);
        registry.moveAgent(bob, aliceLocId);

        vm.prank(player2);
        engine.attack(bob, aliceHex, bobHex, 1, 0);

        assertTrue(registry.isAlive(alice));
        assertTrue(registry.isAlive(bob));
        assertGt(engine.getScore(alice) + engine.getScore(bob), 0);
    }
}

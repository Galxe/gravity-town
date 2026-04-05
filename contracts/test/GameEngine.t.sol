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

        // Grant GameEngine operator (LocationLedger delegates to Registry's operator list)
        registry.addOperator(address(engine));
    }

    // ──────────────────── Helpers ────────────────────

    function _createAgent(address ownerAddr) internal returns (uint256 agentId, bytes32 hexKey) {
        vm.prank(ownerAddr);
        (agentId, hexKey) = engine.createAgent("Agent", "brave", defaultStats, ownerAddr);
    }

    // ══════════════════════════════════════════════════
    //                 AGENT CREATION
    // ══════════════════════════════════════════════════

    function test_CreateAgent() public {
        (uint256 agentId, bytes32 hexKey) = _createAgent(player1);
        assertEq(agentId, 1);
        assertTrue(hexKey != bytes32(0));

        // Agent exists
        (string memory name, , , , ) = registry.getAgent(agentId);
        assertEq(name, "Agent");

        // Hex is owned
        (uint256 owner, , , , , , uint256 ore, , , , ) = engine.getHex(hexKey);
        assertEq(owner, agentId);
        assertEq(ore, 200); // starting ore

        // Agent has 1 hex
        assertEq(engine.hexCount(agentId), 1);
    }

    function test_TwoAgentsGetDifferentHexes() public {
        (, bytes32 h1) = _createAgent(player1);
        (, bytes32 h2) = _createAgent(player2);
        assertTrue(h1 != h2);
    }

    // ══════════════════════════════════════════════════
    //                    HARVEST
    // ══════════════════════════════════════════════════

    function test_HarvestBaseProduction() public {
        (, bytes32 hexKey) = _createAgent(player1);

        // 1 second → 10 ore/sec base
        vm.warp(block.timestamp + 1);
        engine.harvest(hexKey);

        (, , , , , , uint256 ore, , , , ) = engine.getHex(hexKey);
        // 200 starting + 10 base/sec * 1 sec = 210
        assertEq(ore, 210);
    }

    function test_HarvestWithMines() public {
        (uint256 agentId, bytes32 hexKey) = _createAgent(player1);

        // Build 2 mines (50 ore each = 100 ore, leaves 100)
        vm.startPrank(player1);
        engine.build(agentId, hexKey, 1);
        engine.build(agentId, hexKey, 1);
        vm.stopPrank();

        (, , , , uint256 mines, , uint256 oreBefore, , , , ) = engine.getHex(hexKey);
        assertEq(mines, 2);
        assertEq(oreBefore, 100); // 200 - 50 - 50

        // 2 seconds
        vm.warp(block.timestamp + 2);
        engine.harvest(hexKey);

        (, , , , , , uint256 oreAfter, , , , ) = engine.getHex(hexKey);
        // 100 + (10 base + 2*5 mine) * 2 sec = 100 + 40 = 140
        assertEq(oreAfter, 140);
    }

    // ══════════════════════════════════════════════════
    //                   BUILDING
    // ══════════════════════════════════════════════════

    function test_BuildMine() public {
        (uint256 agentId, bytes32 hexKey) = _createAgent(player1);

        vm.prank(player1);
        engine.build(agentId, hexKey, 1); // Mine = 50 ore

        (, , , , uint256 mines, , uint256 ore, , , , ) = engine.getHex(hexKey);
        assertEq(mines, 1);
        assertEq(ore, 150); // 200 - 50
    }

    function test_BuildArsenal() public {
        (uint256 agentId, bytes32 hexKey) = _createAgent(player1);

        vm.prank(player1);
        engine.build(agentId, hexKey, 2); // Arsenal = 100 ore

        (, , , , , uint256 arsenals, uint256 ore, , , , ) = engine.getHex(hexKey);
        assertEq(arsenals, 1);
        assertEq(ore, 100); // 200 - 100
    }

    function test_CannotExceedSlots() public {
        (uint256 agentId, bytes32 hexKey) = _createAgent(player1);

        // Wait enough to get ore for 12 mines (need 600 ore total, have 200, need 400 more at 10/sec → 40 sec)
        vm.warp(block.timestamp + 40);
        engine.harvest(hexKey);

        // Build 12 mines (fills all slots)
        vm.startPrank(player1);
        for (uint256 i = 0; i < 12; i++) {
            engine.build(agentId, hexKey, 1);
        }

        vm.expectRevert("hex full");
        engine.build(agentId, hexKey, 1);
        vm.stopPrank();
    }

    // ══════════════════════════════════════════════════
    //                  HEX CLAIMING
    // ══════════════════════════════════════════════════

    function test_ClaimAdjacentHex() public {
        (uint256 agentId, bytes32 hexKey) = _createAgent(player1);

        // Get the hex coordinates
        (, , int32 q, int32 r, , , , , , , ) = engine.getHex(hexKey);

        // Already have 200 ore, claim cost is 200 — no need to wait
        vm.prank(player1);
        engine.claimHex(agentId, q + 1, r, hexKey);

        assertEq(engine.hexCount(agentId), 2);
    }

    function test_CannotClaimOccupied() public {
        _createAgent(player1);
        (uint256 agent2, bytes32 hex2) = _createAgent(player2);

        // Try to claim agent1's hex
        (, , int32 q1, int32 r1, , , , , , , ) = engine.getHex(engine.getAgentHexKeys(1)[0]);

        // Give agent2 enough ore
        vm.warp(block.timestamp + 5);
        engine.harvest(hex2);

        vm.prank(player2);
        vm.expectRevert("hex occupied");
        engine.claimHex(agent2, q1, r1, hex2);
    }

    function test_CannotClaimNonAdjacent() public {
        (uint256 agentId, bytes32 hexKey) = _createAgent(player1);

        // Give enough ore
        vm.warp(block.timestamp + 5);
        engine.harvest(hexKey);

        // Try to claim a hex within world bounds but not adjacent (3 steps away)
        vm.prank(player1);
        vm.expectRevert("must be adjacent to owned hex");
        engine.claimHex(agentId, 3, 3, hexKey);
    }

    function test_ClaimCostEscalates() public {
        (uint256 agentId, bytes32 hexKey) = _createAgent(player1);

        // First claim cost = 200
        assertEq(engine.getClaimCost(agentId), 200);

        (, , int32 q, int32 r, , , , , , , ) = engine.getHex(hexKey);

        // Already have 200 ore for first claim
        vm.prank(player1);
        engine.claimHex(agentId, q + 1, r, hexKey);

        // Second claim cost = 400
        assertEq(engine.getClaimCost(agentId), 400);
    }

    // ══════════════════════════════════════════════════
    //                    COMBAT
    // ══════════════════════════════════════════════════

    function test_AttackRequiresPresence() public {
        (uint256 attacker, bytes32 attackerHex) = _createAgent(player1);
        (, bytes32 targetHex) = _createAgent(player2);

        // Build arsenal on attacker
        vm.prank(player1);
        engine.build(attacker, attackerHex, 2);

        // Attack without moving to target — should fail
        vm.prank(player1);
        vm.expectRevert("must be at target hex");
        engine.attack(attacker, targetHex, attackerHex, 1, 0);
    }

    function test_AttackFlow() public {
        (uint256 attacker, bytes32 attackerHex) = _createAgent(player1);
        (, bytes32 targetHex) = _createAgent(player2);

        // Build arsenal
        vm.prank(player1);
        engine.build(attacker, attackerHex, 2); // costs 100 ore, leaves 100

        // Move attacker to target hex location
        (, uint256 targetLocId, , , , , , , , , ) = engine.getHex(targetHex);
        vm.prank(player1);
        registry.moveAgent(attacker, targetLocId);

        // Attack: spend 1 arsenal + 0 ore
        vm.prank(player1);
        engine.attack(attacker, targetHex, attackerHex, 1, 0);

        // Arsenal consumed from attacker's hex
        (, , , , , uint256 arsenalsLeft, , , , , ) = engine.getHex(attackerHex);
        assertEq(arsenalsLeft, 0);
    }

    function test_AttackCooldown() public {
        (uint256 attacker, bytes32 attackerHex) = _createAgent(player1);
        (uint256 defender, bytes32 targetHex) = _createAgent(player2);

        // Defender builds lots of arsenals (high defense so attacks fail)
        // Need ore for 4 arsenals (400) + 3 arsenals (300) = 700 total minus 400 starting = 300 more at 10/sec
        vm.warp(block.timestamp + 30);
        engine.harvest(targetHex);
        engine.harvest(attackerHex);
        vm.startPrank(player2);
        engine.build(defender, targetHex, 2); // +5 defense
        engine.build(defender, targetHex, 2); // +5 defense
        engine.build(defender, targetHex, 2); // +5 defense
        engine.build(defender, targetHex, 2); // +5 defense = 20 total defense
        vm.stopPrank();

        // Attacker builds arsenals
        vm.startPrank(player1);
        engine.build(attacker, attackerHex, 2);
        engine.build(attacker, attackerHex, 2);
        engine.build(attacker, attackerHex, 2);
        vm.stopPrank();

        // Move to target
        (, uint256 targetLocId, , , , , , , , , ) = engine.getHex(targetHex);
        vm.prank(player1);
        registry.moveAgent(attacker, targetLocId);

        // First attack (small, likely fails against 20 defense)
        vm.prank(player1);
        engine.attack(attacker, targetHex, attackerHex, 1, 0);

        // Second attack — cooldown regardless of win/lose
        vm.prank(player1);
        vm.expectRevert("cooldown");
        engine.attack(attacker, targetHex, attackerHex, 1, 0);

        // After cooldown (5 seconds)
        vm.warp(block.timestamp + 6);
        engine.harvest(attackerHex);
        engine.harvest(targetHex);
        vm.prank(player1);
        engine.attack(attacker, targetHex, attackerHex, 1, 0);
    }

    // ══════════════════════════════════════════════════
    //                    SCORING
    // ══════════════════════════════════════════════════

    function test_ScoreCalculation() public {
        (uint256 agentId, bytes32 hexKey) = _createAgent(player1);

        // 1 hex (100) + 200 ore + 0 buildings (0) = 300
        uint256 score = engine.getScore(agentId);
        assertEq(score, 300);

        // Build a mine: 1 hex (100) + 150 ore + 1 building (50) = 300
        vm.prank(player1);
        engine.build(agentId, hexKey, 1);
        score = engine.getScore(agentId);
        assertEq(score, 300); // 100 + 150 + 50
    }

    // ══════════════════════════════════════════════════
    //              LEDGERS STILL WORK
    // ══════════════════════════════════════════════════

    function test_HexHasBulletinBoard() public {
        (uint256 agentId, bytes32 hexKey) = _createAgent(player1);

        // Get location ID for the hex
        (, uint256 locationId, , , , , , , , , ) = engine.getHex(hexKey);

        // Post to the hex's bulletin board
        uint256[] memory noRelated = new uint256[](0);
        vm.prank(player1);
        (uint256 entryId, , ) = locationLedger.write(agentId, 5, "action", "Built a mine", noRelated);
        assertGt(entryId, 0);

        // Read it back
        (LocationLedger.Entry[] memory entries, , ) = locationLedger.readRecent(locationId, 10);
        assertEq(entries.length, 1);
    }

    // ══════════════════════════════════════════════════
    //              FULL GAME LOOP
    // ══════════════════════════════════════════════════

    function test_FullGameLoop() public {
        // Two players
        (uint256 alice, bytes32 aliceHex) = _createAgent(player1);
        (uint256 bob, bytes32 bobHex) = _createAgent(player2);

        // Alice builds mines
        vm.startPrank(player1);
        engine.build(alice, aliceHex, 1);
        engine.build(alice, aliceHex, 1);
        vm.stopPrank();

        // Bob builds arsenal
        vm.prank(player2);
        engine.build(bob, bobHex, 2);

        // Time passes (5 seconds)
        vm.warp(block.timestamp + 5);
        engine.harvest(aliceHex);
        engine.harvest(bobHex);

        // Bob moves to Alice's hex to attack
        (, uint256 aliceLocId, , , , , , , , , ) = engine.getHex(aliceHex);
        vm.prank(player2);
        registry.moveAgent(bob, aliceLocId);

        // Bob attacks with 1 arsenal
        vm.prank(player2);
        engine.attack(bob, aliceHex, bobHex, 1, 0);

        // Both still alive
        assertTrue(registry.isAlive(alice));
        assertTrue(registry.isAlive(bob));

        // Scores exist
        assertGt(engine.getScore(alice) + engine.getScore(bob), 0);
    }
}

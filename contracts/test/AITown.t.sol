// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/AgentRegistry.sol";
import "../src/WorldState.sol";
import "../src/MemoryLedger.sol";

contract AITownTest is Test {
    AgentRegistry registry;
    WorldState world;
    MemoryLedger memory_ledger;

    address deployer = address(this);
    address operator = address(0xBEEF);
    address player1 = address(0x1);

    function setUp() public {
        // Deploy through UUPS proxies (same as production deploy)
        AgentRegistry registryImpl = new AgentRegistry();
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(AgentRegistry.initialize, (operator))
        );
        registry = AgentRegistry(address(registryProxy));

        WorldState worldImpl = new WorldState();
        ERC1967Proxy worldProxy = new ERC1967Proxy(
            address(worldImpl),
            abi.encodeCall(WorldState.initialize, (address(registry)))
        );
        world = WorldState(address(worldProxy));

        MemoryLedger ledgerImpl = new MemoryLedger();
        ERC1967Proxy ledgerProxy = new ERC1967Proxy(
            address(ledgerImpl),
            abi.encodeCall(MemoryLedger.initialize, (address(registry)))
        );
        memory_ledger = MemoryLedger(address(ledgerProxy));
    }

    // ============ Upgrade Tests ============

    function test_CannotReinitialize() public {
        vm.expectRevert();
        registry.initialize(operator);

        vm.expectRevert();
        world.initialize(address(registry));

        vm.expectRevert();
        memory_ledger.initialize(address(registry));
    }

    function test_OnlyOwnerCanUpgrade() public {
        AgentRegistry newImpl = new AgentRegistry();

        // player1 is not owner — should revert
        vm.prank(player1);
        vm.expectRevert();
        registry.upgradeToAndCall(address(newImpl), "");

        // deployer (this) is owner — should succeed
        registry.upgradeToAndCall(address(newImpl), "");
    }

    function test_UpgradePreservesState() public {
        // Create an agent
        vm.prank(operator);
        uint8[4] memory stats = [uint8(8), 5, 3, 6];
        registry.createAgent("Li Blacksmith", "hardworking", stats, 1, player1);

        // Verify state
        (string memory name1, , , , uint256 gold1,) = registry.getAgent(1);
        assertEq(name1, "Li Blacksmith");
        assertEq(gold1, 100);

        // Upgrade to new implementation
        AgentRegistry newImpl = new AgentRegistry();
        registry.upgradeToAndCall(address(newImpl), "");

        // State is preserved
        (string memory name2, , , , uint256 gold2,) = registry.getAgent(1);
        assertEq(name2, "Li Blacksmith");
        assertEq(gold2, 100);
    }

    // ============ AgentRegistry Tests ============

    function test_CreateAgent() public {
        vm.prank(operator);
        uint8[4] memory stats = [uint8(8), 5, 3, 6];
        uint256 id = registry.createAgent("Li Blacksmith", "hardworking and quiet", stats, 1, player1);

        assertEq(id, 1);
        (string memory name, string memory personality, uint8[4] memory s, uint256 loc, uint256 gold,) = registry.getAgent(1);
        assertEq(name, "Li Blacksmith");
        assertEq(personality, "hardworking and quiet");
        assertEq(s[0], 8);
        assertEq(loc, 1);
        assertEq(gold, 100);
    }

    function test_MoveAgent() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Test", "test", stats, 1, player1);

        registry.moveAgent(1, 3);
        (, , , uint256 loc, ,) = registry.getAgent(1);
        assertEq(loc, 3);
        vm.stopPrank();
    }

    function test_TransferGold() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("A", "a", stats, 1, player1);
        registry.createAgent("B", "b", stats, 1, player1);

        registry.transferGold(1, 2, 30);

        (, , , , uint256 goldA,) = registry.getAgent(1);
        (, , , , uint256 goldB,) = registry.getAgent(2);
        assertEq(goldA, 70);
        assertEq(goldB, 130);
        vm.stopPrank();
    }

    function test_TransferGold_InsufficientFails() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("A", "a", stats, 1, player1);
        registry.createAgent("B", "b", stats, 1, player1);

        vm.expectRevert("insufficient gold");
        registry.transferGold(1, 2, 200);
        vm.stopPrank();
    }

    function test_OnlyOperatorCanCreate() public {
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        vm.prank(player1);
        vm.expectRevert("not authorized");
        registry.createAgent("Rogue", "bad", stats, 1, player1);
    }

    // ============ WorldState Tests ============

    function test_CreateLocation() public {
        vm.prank(operator);
        string[] memory actions = new string[](3);
        actions[0] = "mine";
        actions[1] = "rest";
        actions[2] = "explore";
        uint256 locId = world.createLocation("Mine", "A dark mine", actions);

        assertEq(locId, 1);
        (string memory name, string memory desc, string[] memory acts) = world.getLocation(1);
        assertEq(name, "Mine");
        assertEq(desc, "A dark mine");
        assertEq(acts.length, 3);
        assertEq(acts[0], "mine");
    }

    function test_PerformAction() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Miner", "likes mining", stats, 1, player1);

        string[] memory actions = new string[](1);
        actions[0] = "mine";
        world.createLocation("Mine", "A dark mine", actions);

        world.performAction(1, "mine", "Found 3 iron ores");

        WorldState.ActionLog[] memory logs = world.getRecentActions(1, 10);
        assertEq(logs.length, 1);
        assertEq(logs[0].agentId, 1);
        assertEq(keccak256(bytes(logs[0].action)), keccak256(bytes("mine")));
        assertEq(keccak256(bytes(logs[0].result)), keccak256(bytes("Found 3 iron ores")));
        vm.stopPrank();
    }

    function test_ActionLogRingBuffer() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Worker", "works hard", stats, 1, player1);
        string[] memory actions = new string[](1);
        actions[0] = "work";
        world.createLocation("Workshop", "A workshop", actions);

        for (uint256 i = 0; i < 140; i++) {
            world.performAction(1, "work", string(abi.encodePacked("result-", vm.toString(i))));
        }

        WorldState.ActionLog[] memory logs = world.getRecentActions(1, 200);
        assertEq(logs.length, 128);
        assertEq(keccak256(bytes(logs[0].result)), keccak256(bytes("result-12")));
        assertEq(keccak256(bytes(logs[127].result)), keccak256(bytes("result-139")));
        vm.stopPrank();
    }

    function test_GetAgentsAtLocation() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("A", "a", stats, 1, player1);
        registry.createAgent("B", "b", stats, 2, player1);
        registry.createAgent("C", "c", stats, 1, player1);

        string[] memory actions = new string[](0);
        world.createLocation("Tavern", "A cozy tavern", actions);
        world.createLocation("Farm", "Green fields", actions);

        uint256[] memory atTavern = world.getAgentsAtLocation(1);
        assertEq(atTavern.length, 2);
        assertEq(atTavern[0], 1);
        assertEq(atTavern[1], 3);

        uint256[] memory atFarm = world.getAgentsAtLocation(2);
        assertEq(atFarm.length, 1);
        assertEq(atFarm[0], 2);
        vm.stopPrank();
    }

    // ============ MemoryLedger Tests ============

    function test_AddAndRecallMemory() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Thinker", "philosophical", stats, 1, player1);

        uint256[] memory related = new uint256[](0);
        memory_ledger.addMemory(1, 5, "reflection", "The sunset was beautiful today", related);
        memory_ledger.addMemory(1, 8, "discovery", "Found a secret passage in the mine", related);

        MemoryLedger.Memory[] memory mems = memory_ledger.getRecentMemories(1, 2);
        assertEq(mems.length, 2);
        assertEq(mems[1].importance, 8);
        assertEq(keccak256(bytes(mems[1].category)), keccak256(bytes("discovery")));
        vm.stopPrank();
    }

    function test_MemoryRingBufferOverflow() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Busy", "very active", stats, 1, player1);

        uint256[] memory related = new uint256[](0);
        for (uint256 i = 0; i < 70; i++) {
            memory_ledger.addMemory(1, 5, "event", string(abi.encodePacked("memory-", vm.toString(i))), related);
        }

        assertEq(memory_ledger.memoryCount(1), 64);

        MemoryLedger.Memory[] memory mems = memory_ledger.getRecentMemories(1, 64);
        assertEq(mems.length, 64);
        assertEq(keccak256(bytes(mems[0].content)), keccak256(bytes("memory-6")));
        assertEq(keccak256(bytes(mems[63].content)), keccak256(bytes("memory-69")));
        vm.stopPrank();
    }

    function test_CompressMemories() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Learner", "curious", stats, 1, player1);

        uint256[] memory related = new uint256[](0);
        for (uint256 i = 0; i < 10; i++) {
            memory_ledger.addMemory(1, uint8(3 + (i % 5)), "event", string(abi.encodePacked("mem-", vm.toString(i))), related);
        }
        assertEq(memory_ledger.memoryCount(1), 10);

        memory_ledger.compressMemories(1, 5, "Summary of first 5 events", 8, "reflection");

        assertEq(memory_ledger.memoryCount(1), 6);

        MemoryLedger.Memory[] memory mems = memory_ledger.getRecentMemories(1, 6);
        assertEq(keccak256(bytes(mems[0].content)), keccak256(bytes("Summary of first 5 events")));
        assertEq(mems[0].importance, 8);
        assertEq(keccak256(bytes(mems[5].content)), keccak256(bytes("mem-9")));
        vm.stopPrank();
    }

    function test_CompressMemories_TooFewFails() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Test", "test", stats, 1, player1);

        uint256[] memory related = new uint256[](0);
        memory_ledger.addMemory(1, 5, "event", "hello", related);

        vm.expectRevert("must compress at least 2");
        memory_ledger.compressMemories(1, 1, "summary", 5, "reflection");
        vm.stopPrank();
    }

    function test_ImportantMemories() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Trader", "shrewd", stats, 1, player1);

        uint256[] memory related = new uint256[](0);
        memory_ledger.addMemory(1, 2, "trade", "Sold an apple", related);
        memory_ledger.addMemory(1, 9, "event", "The king visited the town!", related);
        memory_ledger.addMemory(1, 3, "social", "Chatted with a stranger", related);

        MemoryLedger.Memory[] memory important = memory_ledger.getImportantMemories(1, 5);
        assertEq(important.length, 1);
        assertEq(important[0].importance, 9);
        vm.stopPrank();
    }

    function test_SharedMemories() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Alice", "friendly", stats, 1, player1);
        registry.createAgent("Bob", "grumpy", stats, 1, player1);

        uint256[] memory related = new uint256[](1);
        related[0] = 2;
        memory_ledger.addMemory(1, 7, "social", "Traded a sword with Bob for 50 gold", related);

        uint256[] memory noRelated = new uint256[](0);
        memory_ledger.addMemory(1, 3, "reflection", "I like this town", noRelated);

        MemoryLedger.Memory[] memory shared = memory_ledger.getSharedMemories(1, 2);
        assertEq(shared.length, 1);
        assertEq(keccak256(bytes(shared[0].content)), keccak256(bytes("Traded a sword with Bob for 50 gold")));
        vm.stopPrank();
    }

    function test_MemoryByCategory() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Explorer", "adventurous", stats, 1, player1);

        uint256[] memory related = new uint256[](0);
        memory_ledger.addMemory(1, 5, "discovery", "Found a cave", related);
        memory_ledger.addMemory(1, 3, "social", "Met a traveler", related);
        memory_ledger.addMemory(1, 7, "discovery", "Found ancient ruins", related);

        MemoryLedger.Memory[] memory discoveries = memory_ledger.getMemoriesByCategory(1, "discovery");
        assertEq(discoveries.length, 2);
        vm.stopPrank();
    }

    function test_InvalidImportanceFails() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Test", "test", stats, 1, player1);

        uint256[] memory related = new uint256[](0);
        vm.expectRevert("importance must be 1-10");
        memory_ledger.addMemory(1, 0, "test", "bad memory", related);
        vm.stopPrank();
    }

    function test_MemoryCapacityQuery() public view {
        assertEq(memory_ledger.memoryCapacity(), 64);
    }

    // ============ Integration Test ============

    function test_FullGameLoop() public {
        vm.startPrank(operator);

        string[] memory tavernActions = new string[](2);
        tavernActions[0] = "drink";
        tavernActions[1] = "chat";
        world.createLocation("Tavern", "A warm tavern with ale", tavernActions);

        string[] memory mineActions = new string[](2);
        mineActions[0] = "mine";
        mineActions[1] = "explore";
        world.createLocation("Mine", "A dark mine full of ore", mineActions);

        uint8[4] memory smithStats = [uint8(8), 4, 3, 5];
        registry.createAgent("Li Blacksmith", "hardworking, quiet, skilled craftsman", smithStats, 2, player1);

        uint8[4] memory hunterStats = [uint8(6), 5, 7, 6];
        registry.createAgent("Wang Hunter", "adventurous, talkative, good tracker", hunterStats, 1, player1);

        world.performAction(1, "mine", "Mined 5 iron ores, found a gem");
        uint256[] memory noRelated = new uint256[](0);
        memory_ledger.addMemory(1, 4, "trade", "Mined 5 iron ores today", noRelated);
        registry.addGold(1, 20);

        registry.moveAgent(1, 1);

        uint256[] memory atTavern = world.getAgentsAtLocation(1);
        assertEq(atTavern.length, 2);

        uint256[] memory relatedToB = new uint256[](1);
        relatedToB[0] = 2;
        memory_ledger.addMemory(1, 7, "social", "Met Wang Hunter at the tavern. Traded a sword for 50 gold.", relatedToB);

        uint256[] memory relatedToA = new uint256[](1);
        relatedToA[0] = 1;
        memory_ledger.addMemory(2, 7, "social", "Met Li Blacksmith at the tavern. Bought a fine sword for 50 gold.", relatedToA);

        registry.transferGold(2, 1, 50);

        (, , , , uint256 goldSmith,) = registry.getAgent(1);
        (, , , , uint256 goldHunter,) = registry.getAgent(2);
        assertEq(goldSmith, 170);
        assertEq(goldHunter, 50);

        MemoryLedger.Memory[] memory shared = memory_ledger.getSharedMemories(1, 2);
        assertEq(shared.length, 2);

        world.advanceTick();
        assertEq(world.currentTick(), 1);

        vm.stopPrank();
    }
}

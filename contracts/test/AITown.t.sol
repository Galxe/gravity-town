// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/AgentRegistry.sol";
import "../src/AgentLedger.sol";
import "../src/LocationLedger.sol";
import "../src/InboxLedger.sol";
import "../src/Router.sol";

contract AITownTest is Test {
    AgentRegistry registry;
    AgentLedger agentLedger;
    LocationLedger locationLedger;
    InboxLedger inboxLedger;
    Router router;

    address deployer = address(this);
    address operator = address(0xBEEF);
    address player1 = address(0x1);
    address player2 = address(0x2);

    function setUp() public {
        // Deploy implementations
        AgentRegistry registryImpl = new AgentRegistry();
        AgentLedger agentLedgerImpl = new AgentLedger();
        LocationLedger locationLedgerImpl = new LocationLedger();
        InboxLedger inboxLedgerImpl = new InboxLedger();
        Router routerImpl = new Router();

        // Deploy proxies
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(AgentRegistry.initialize, (operator))
        );
        registry = AgentRegistry(address(registryProxy));

        ERC1967Proxy agentLedgerProxy = new ERC1967Proxy(
            address(agentLedgerImpl),
            abi.encodeCall(AgentLedger.initialize, (address(registry)))
        );
        agentLedger = AgentLedger(address(agentLedgerProxy));

        ERC1967Proxy locationLedgerProxy = new ERC1967Proxy(
            address(locationLedgerImpl),
            abi.encodeCall(LocationLedger.initialize, (address(registry)))
        );
        locationLedger = LocationLedger(address(locationLedgerProxy));

        ERC1967Proxy inboxLedgerProxy = new ERC1967Proxy(
            address(inboxLedgerImpl),
            abi.encodeCall(InboxLedger.initialize, (address(registry)))
        );
        inboxLedger = InboxLedger(address(inboxLedgerProxy));

        ERC1967Proxy routerProxy = new ERC1967Proxy(
            address(routerImpl),
            abi.encodeCall(Router.initialize, (
                address(registryProxy),
                address(agentLedgerProxy),
                address(locationLedgerProxy),
                address(inboxLedgerProxy)
            ))
        );
        router = Router(address(routerProxy));

        // Create initial locations
        locationLedger.createLocation("Tavern", "A warm tavern", 0, 0);
        locationLedger.createLocation("Mine", "A dark mine", 1, -1);
    }

    // ============ Upgrade Tests ============

    function test_CannotReinitialize() public {
        vm.expectRevert();
        registry.initialize(operator);

        vm.expectRevert();
        agentLedger.initialize(address(registry));

        vm.expectRevert();
        locationLedger.initialize(address(registry));

        vm.expectRevert();
        inboxLedger.initialize(address(registry));
    }

    function test_OnlyOwnerCanUpgrade() public {
        AgentRegistry newImpl = new AgentRegistry();
        vm.prank(player1);
        vm.expectRevert();
        registry.upgradeToAndCall(address(newImpl), "");

        // deployer (this) is owner — should succeed
        registry.upgradeToAndCall(address(newImpl), "");
    }

    function test_UpgradePreservesState() public {
        vm.prank(operator);
        uint8[4] memory stats = [uint8(8), 5, 3, 6];
        registry.createAgent("Li Blacksmith", "hardworking", stats, 1, player1);

        (string memory name1, , , , uint256 gold1,) = registry.getAgent(1);
        assertEq(name1, "Li Blacksmith");
        assertEq(gold1, 100);

        AgentRegistry newImpl = new AgentRegistry();
        registry.upgradeToAndCall(address(newImpl), "");

        (string memory name2, , , , uint256 gold2,) = registry.getAgent(1);
        assertEq(name2, "Li Blacksmith");
        assertEq(gold2, 100);
    }

    // ============ Router Tests ============

    function test_RouterResolvesAddresses() public view {
        (address r, address al, address ll, address il) = router.getAddresses();
        assertEq(r, address(registry));
        assertEq(al, address(agentLedger));
        assertEq(ll, address(locationLedger));
        assertEq(il, address(inboxLedger));
    }

    // ============ AgentRegistry Tests ============

    function test_CreateAgent() public {
        vm.prank(operator);
        uint8[4] memory stats = [uint8(8), 5, 3, 6];
        uint256 id = registry.createAgent("Li Blacksmith", "hardworking", stats, 1, player1);

        assertEq(id, 1);
        (string memory name, string memory personality, uint8[4] memory s, uint256 loc, uint256 gold,) = registry.getAgent(1);
        assertEq(name, "Li Blacksmith");
        assertEq(personality, "hardworking");
        assertEq(s[0], 8);
        assertEq(loc, 1);
        assertEq(gold, 100);
    }

    function test_MoveAgent() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Test", "test", stats, 1, player1);
        registry.moveAgent(1, 2);
        (, , , uint256 loc, ,) = registry.getAgent(1);
        assertEq(loc, 2);
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

    function test_AddGoldEmitsEvent() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("A", "a", stats, 1, player1);

        vm.expectEmit(true, false, false, true);
        emit AgentRegistry.GoldAdded(1, 50);
        registry.addGold(1, 50);

        (, , , , uint256 gold,) = registry.getAgent(1);
        assertEq(gold, 150);
        vm.stopPrank();
    }

    function test_AnyoneCanCreateAgent() public {
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        vm.prank(player1);
        uint256 agentId = registry.createAgent("Player Agent", "friendly", stats, 1, player1);
        assertEq(registry.agentOwner(agentId), player1);
    }

    function test_AgentOwnerCanControl() public {
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        vm.prank(player1);
        uint256 agentId = registry.createAgent("Owned", "test", stats, 1, player1);
        vm.prank(player1);
        registry.moveAgent(agentId, 2);
    }

    function test_NonOwnerCannotControl() public {
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        vm.prank(player1);
        uint256 agentId = registry.createAgent("Owned", "test", stats, 1, player1);
        vm.prank(player2);
        vm.expectRevert("not authorized");
        registry.moveAgent(agentId, 2);
    }

    function test_RemoveAgent() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("A", "a", stats, 1, player1);
        registry.createAgent("B", "b", stats, 1, player1);

        registry.removeAgent(1);
        assertEq(registry.getAgentCount(), 1);

        vm.expectRevert("agent does not exist");
        registry.getAgent(1);
        vm.stopPrank();
    }

    // ============ AgentLedger Tests ============

    function test_WriteAndReadMemory() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Thinker", "philosophical", stats, 1, player1);

        uint256[] memory related = new uint256[](0);
        agentLedger.write(1, 5, "reflection", "The sunset was beautiful", related);
        agentLedger.write(1, 8, "discovery", "Found a secret passage", related);

        (RingLedger.Entry[] memory entries, uint256 used, uint256 capacity) = agentLedger.readRecent(1, 2);
        assertEq(entries.length, 2);
        assertEq(used, 2);
        assertEq(capacity, 64);
        assertEq(entries[1].importance, 8);
        vm.stopPrank();
    }

    function test_CompactMemories() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Learner", "curious", stats, 1, player1);

        uint256[] memory related = new uint256[](0);
        for (uint256 i = 0; i < 10; i++) {
            agentLedger.write(1, uint8(3 + (i % 5)), "event", string(abi.encodePacked("mem-", vm.toString(i))), related);
        }

        (, uint256 usedBefore,) = agentLedger.readRecent(1, 0);
        assertEq(usedBefore, 10);

        agentLedger.compact(1, 5, 8, "reflection", "Summary of first 5 events");

        (, uint256 usedAfter,) = agentLedger.readRecent(1, 0);
        assertEq(usedAfter, 6);
        vm.stopPrank();
    }

    // ============ LocationLedger Tests ============

    function test_CreateLocation() public {
        (string memory name, string memory desc, int32 q, int32 r) = locationLedger.getLocation(1);
        assertEq(name, "Tavern");
        assertEq(desc, "A warm tavern");
        assertEq(q, 0);
        assertEq(r, 0);
    }

    function test_WriteToLocationBoard() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Miner", "likes mining", stats, 2, player1);

        uint256[] memory related = new uint256[](0);
        locationLedger.write(1, 5, "action", "Mining copper ore", related);

        (RingLedger.Entry[] memory entries, uint256 used,) = locationLedger.readRecent(2, 10);
        assertEq(entries.length, 1);
        assertEq(used, 1);
        assertEq(entries[0].authorAgent, 1);
        vm.stopPrank();
    }

    function test_GetAgentsAtLocation() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("A", "a", stats, 1, player1);
        registry.createAgent("B", "b", stats, 2, player1);
        registry.createAgent("C", "c", stats, 1, player1);

        uint256[] memory atTavern = locationLedger.getAgentsAtLocation(1);
        assertEq(atTavern.length, 2);

        uint256[] memory atMine = locationLedger.getAgentsAtLocation(2);
        assertEq(atMine.length, 1);
        vm.stopPrank();
    }

    function test_AdvanceTick() public {
        locationLedger.advanceTick();
        assertEq(locationLedger.currentTick(), 1);
    }

    // ============ InboxLedger Tests ============

    function test_SendAndReadMessage() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Alice", "friendly", stats, 1, player1);
        registry.createAgent("Bob", "grumpy", stats, 2, player1);

        uint256[] memory related = new uint256[](1);
        related[0] = 2;
        inboxLedger.write(1, 2, 5, "chat", "Hey Bob!", related);

        (RingLedger.Entry[] memory entries, uint256 used,) = inboxLedger.readRecent(2, 10);
        assertEq(entries.length, 1);
        assertEq(used, 1);
        assertEq(entries[0].authorAgent, 1);
        vm.stopPrank();
    }

    function test_ReadInboxFrom() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Alice", "friendly", stats, 1, player1);
        registry.createAgent("Bob", "grumpy", stats, 2, player1);
        registry.createAgent("Charlie", "quiet", stats, 1, player1);

        uint256[] memory related = new uint256[](0);
        inboxLedger.write(1, 2, 5, "chat", "Hello from Alice", related);
        inboxLedger.write(3, 2, 5, "chat", "Hello from Charlie", related);
        inboxLedger.write(1, 2, 5, "chat", "Another from Alice", related);

        RingLedger.Entry[] memory fromAlice = inboxLedger.readFrom(2, 1);
        assertEq(fromAlice.length, 2);
        vm.stopPrank();
    }

    function test_CannotMessageSelf() public {
        vm.startPrank(operator);
        uint8[4] memory stats = [uint8(5), 5, 5, 5];
        registry.createAgent("Alice", "friendly", stats, 1, player1);

        uint256[] memory related = new uint256[](0);
        vm.expectRevert("cannot message self");
        inboxLedger.write(1, 1, 5, "chat", "Hi me", related);
        vm.stopPrank();
    }

    // ============ Integration Test ============

    function test_FullGameLoop() public {
        vm.startPrank(operator);

        // Create agents
        uint8[4] memory smithStats = [uint8(8), 4, 3, 5];
        registry.createAgent("Li Blacksmith", "hardworking", smithStats, 2, player1);

        uint8[4] memory hunterStats = [uint8(6), 5, 7, 6];
        registry.createAgent("Wang Hunter", "adventurous", hunterStats, 1, player1);

        // Li mines and records memory
        uint256[] memory noRelated = new uint256[](0);
        locationLedger.write(1, 5, "action", "Mined 5 iron ores", noRelated);
        agentLedger.write(1, 4, "trade", "Mined 5 iron ores today", noRelated);
        registry.addGold(1, 20);

        // Li moves to tavern
        registry.moveAgent(1, 1);
        uint256[] memory atTavern = locationLedger.getAgentsAtLocation(1);
        assertEq(atTavern.length, 2);

        // They trade — social memories
        uint256[] memory relatedToB = new uint256[](1);
        relatedToB[0] = 2;
        agentLedger.write(1, 7, "social", "Met Wang Hunter, traded a sword for 50 gold", relatedToB);

        // DM each other
        inboxLedger.write(1, 2, 5, "chat", "Nice trading with you!", noRelated);
        inboxLedger.write(2, 1, 5, "chat", "Likewise! Great sword.", noRelated);

        // Transfer gold
        registry.transferGold(2, 1, 50);
        (, , , , uint256 goldSmith,) = registry.getAgent(1);
        (, , , , uint256 goldHunter,) = registry.getAgent(2);
        assertEq(goldSmith, 170); // 100 + 20 + 50
        assertEq(goldHunter, 50); // 100 - 50

        // Advance tick
        locationLedger.advanceTick();
        assertEq(locationLedger.currentTick(), 1);

        vm.stopPrank();
    }
}

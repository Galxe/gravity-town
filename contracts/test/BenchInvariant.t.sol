// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/AgentRegistry.sol";
import "../src/LocationLedger.sol";
import "../src/EvaluationLedger.sol";
import "../src/GameEngine.sol";
import "../src/GTreasury.sol";
import "../src/CardLedger.sol";
import "../src/ArenaEngine.sol";

contract BenchInvariantTest is Test {
    AgentRegistry registry;
    LocationLedger locationLedger;
    EvaluationLedger evalLedger;
    GameEngine engine;
    GTreasury treasury;
    CardLedger cards;
    ArenaEngine arena;

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

        LocationLedger locImpl = new LocationLedger();
        ERC1967Proxy locProxy = new ERC1967Proxy(
            address(locImpl), abi.encodeCall(LocationLedger.initialize, (address(registry)))
        );
        locationLedger = LocationLedger(address(locProxy));

        EvaluationLedger evalImpl = new EvaluationLedger();
        ERC1967Proxy evalProxy = new ERC1967Proxy(
            address(evalImpl), abi.encodeCall(EvaluationLedger.initialize, (address(registry)))
        );
        evalLedger = EvaluationLedger(address(evalProxy));

        GameEngine engineImpl = new GameEngine();
        ERC1967Proxy engineProxy = new ERC1967Proxy(
            address(engineImpl), abi.encodeCall(GameEngine.initialize, (address(registry), address(locationLedger)))
        );
        engine = GameEngine(address(engineProxy));
        registry.addOperator(address(engine));
        engine.setEvaluationLedger(address(evalLedger));

        GTreasury treasuryImpl = new GTreasury();
        ERC1967Proxy treasuryProxy = new ERC1967Proxy(
            address(treasuryImpl), abi.encodeCall(GTreasury.initialize, (address(registry)))
        );
        treasury = GTreasury(address(treasuryProxy));

        CardLedger cardsImpl = new CardLedger();
        ERC1967Proxy cardsProxy = new ERC1967Proxy(
            address(cardsImpl), abi.encodeCall(CardLedger.initialize, (address(registry), address(treasury)))
        );
        cards = CardLedger(address(cardsProxy));

        ArenaEngine arenaImpl = new ArenaEngine();
        ERC1967Proxy arenaProxy = new ERC1967Proxy(
            address(arenaImpl),
            abi.encodeCall(ArenaEngine.initialize, (
                address(registry),
                address(engine),
                address(evalLedger),
                address(treasury),
                address(cards)
            ))
        );
        arena = ArenaEngine(address(arenaProxy));

        registry.addOperator(address(arena));
        registry.addOperator(address(cards));
        cards.setArenaEngine(address(arena));
    }

    function _createAgent(address ownerAddr) internal returns (uint256 agentId) {
        vm.prank(ownerAddr);
        (agentId, ) = engine.createAgent("Hero", "brave", defaultStats, ownerAddr);
        treasury.fundAgentG(agentId, 500);
    }

    function test_buy_spends_g_mints_card_into_inventory_without_touching_bench_or_ore() public {
        uint256 aid = _createAgent(player1);
        uint256 oreBefore = engine.orePool(aid);

        vm.prank(player1);
        uint256 cardId = arena.buy(aid, 1);

        assertEq(treasury.gBalance(aid), 497);
        assertEq(engine.orePool(aid), oreBefore);

        (uint8[5] memory bench, , , , bool exists) = arena.getGhost(aid);
        uint256[5] memory cardIds = arena.getGhostCards(aid);
        assertTrue(exists);
        assertEq(bench[0], 0);
        assertEq(cardIds[0], 0);

        uint256[] memory owned = cards.getOwnedCards(aid);
        assertEq(owned.length, 1);
        assertEq(owned[0], cardId);

        CardLedger.Card memory card = cards.getCard(cardId);
        assertEq(card.ownerAgent, aid);
        assertEq(card.unitType, 1);
    }

    function test_place_card_moves_inventory_card_to_bench() public {
        uint256 aid = _createAgent(player1);

        vm.prank(player1);
        uint256 cardId = arena.buy(aid, 1);

        vm.prank(player1);
        arena.placeCard(aid, cardId, 0);

        (uint8[5] memory bench, , , , ) = arena.getGhost(aid);
        uint256[5] memory cardIds = arena.getGhostCards(aid);
        assertEq(bench[0], 1);
        assertEq(cardIds[0], cardId);
        assertTrue(arena.isCardOnBench(aid, cardId));
        assertEq(cards.getCard(cardId).ownerAgent, aid);
        assertEq(cards.getOwnedCards(aid).length, 1);
    }

    function test_remove_card_clears_bench_and_keeps_inventory_without_refund() public {
        uint256 aid = _createAgent(player1);

        vm.prank(player1);
        uint256 cardId = arena.buy(aid, 1);

        vm.startPrank(player1);
        arena.placeCard(aid, cardId, 0);
        uint256 gBefore = treasury.gBalance(aid);
        arena.removeCard(aid, 0);
        vm.stopPrank();

        (uint8[5] memory bench, , , , ) = arena.getGhost(aid);
        uint256[5] memory cardIds = arena.getGhostCards(aid);
        assertEq(treasury.gBalance(aid), gBefore);
        assertEq(bench[0], 0);
        assertEq(cardIds[0], 0);
        assertFalse(arena.isCardOnBench(aid, cardId));
        assertEq(cards.getCard(cardId).ownerAgent, aid);
        assertEq(cards.getOwnedCards(aid).length, 1);
    }

    function test_can_buy_into_inventory_when_bench_is_full() public {
        uint256 aid = _createAgent(player1);

        vm.startPrank(player1);
        for (uint8 i = 0; i < 5; i++) {
            uint256 cardId = arena.buy(aid, i + 1);
            arena.placeCard(aid, cardId, i);
        }
        uint256 extraCardId = arena.buy(aid, 10);
        vm.stopPrank();

        (uint8[5] memory bench, , , , ) = arena.getGhost(aid);
        uint256[5] memory cardIds = arena.getGhostCards(aid);
        for (uint8 i = 0; i < 5; i++) {
            assertEq(bench[i], i + 1);
            assertGt(cardIds[i], 0);
        }
        assertEq(cards.getCard(extraCardId).ownerAgent, aid);
        assertEq(cards.getOwnedCards(aid).length, 6);
    }

    function test_market_bought_card_can_be_placed_on_bench() public {
        uint256 seller = _createAgent(player1);
        uint256 buyer = _createAgent(player2);

        vm.startPrank(player1);
        uint256 cardId = arena.buy(seller, 10);
        cards.listCard(seller, cardId, 100);
        vm.stopPrank();

        vm.prank(player2);
        cards.buyListed(buyer, cardId, 100);

        vm.prank(player2);
        arena.placeCard(buyer, cardId, 2);

        (uint8[5] memory bench, , , , ) = arena.getGhost(buyer);
        uint256[5] memory cardIds = arena.getGhostCards(buyer);
        assertEq(bench[2], 10);
        assertEq(cardIds[2], cardId);
        assertEq(cards.getCard(cardId).ownerAgent, buyer);
    }

    function test_listed_card_cannot_be_placed_on_bench() public {
        uint256 aid = _createAgent(player1);

        vm.startPrank(player1);
        uint256 cardId = arena.buy(aid, 1);
        cards.listCard(aid, cardId, 100);
        vm.expectRevert("card listed");
        arena.placeCard(aid, cardId, 0);
        vm.stopPrank();
    }

    function test_move_swaps_card_ids_with_units_and_overlays() public {
        uint256 aid = _createAgent(player1);

        vm.startPrank(player1);
        uint256 card0 = arena.buy(aid, 1);
        arena.placeCard(aid, card0, 0);
        uint256 card2 = arena.buy(aid, 2);
        arena.placeCard(aid, card2, 2);
        arena.move(aid, 0, 2);
        vm.stopPrank();

        (uint8[5] memory bench, , , , ) = arena.getGhost(aid);
        uint256[5] memory cardIds = arena.getGhostCards(aid);
        assertEq(bench[0], 2);
        assertEq(bench[2], 1);
        assertEq(cardIds[0], card2);
        assertEq(cardIds[2], card0);
    }

    function test_card_on_bench_cannot_be_listed() public {
        uint256 aid = _createAgent(player1);

        vm.prank(player1);
        uint256 cardId = arena.buy(aid, 1);

        vm.prank(player1);
        arena.placeCard(aid, cardId, 0);

        vm.prank(player1);
        vm.expectRevert("card on bench");
        cards.listCard(aid, cardId, 100);
    }

    function test_submit_reverts_if_bench_card_owner_is_corrupted() public {
        uint256 aid = _createAgent(player1);
        uint256 other = _createAgent(player2);

        vm.prank(player1);
        uint256 cardId = arena.buy(aid, 1);

        vm.prank(player1);
        arena.placeCard(aid, cardId, 0);

        bytes32 base = keccak256(abi.encode(cardId, uint256(4)));
        vm.store(address(cards), bytes32(uint256(base) + 2), bytes32(other));

        vm.prank(player1);
        vm.expectRevert("card owner mismatch");
        arena.submit(aid);
    }

    function test_bootstrap_market_funds_seed_and_lists_representative_cards_once() public {
        vm.prank(player1);
        (uint256 seedAgentId, ) = engine.createAgent("Seed", "market", defaultStats, player1);

        arena.bootstrapMarket(seedAgentId);

        assertEq(treasury.gBalance(seedAgentId), 500);

        uint256[] memory owned = cards.getOwnedCards(seedAgentId);
        assertEq(owned.length, 7);

        CardLedger.Listing[] memory listings = cards.getActiveListings(0, 10);
        assertEq(listings.length, 7);
        for (uint256 i = 0; i < listings.length; i++) {
            assertTrue(listings[i].active);
            CardLedger.Card memory card = cards.getCard(listings[i].cardId);
            assertEq(card.ownerAgent, seedAgentId);
            assertTrue(listings[i].askPriceG < _unitCost(card.unitType));
        }

        vm.expectRevert("already seeded");
        arena.bootstrapMarket(seedAgentId);
    }

    function _unitCost(uint8 unitType) internal pure returns (uint16) {
        if (unitType <= 3) return 3;
        if (unitType <= 6) return 4;
        if (unitType <= 9) return 5;
        return 6;
    }
}

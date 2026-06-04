// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/AgentRegistry.sol";
import "../src/GTreasury.sol";
import "../src/CardLedger.sol";

contract MockArenaBench {
    mapping(uint256 => mapping(uint256 => bool)) public onBench;

    function setOnBench(uint256 agentId, uint256 cardId, bool value) external {
        onBench[agentId][cardId] = value;
    }

    function isCardOnBench(uint256 agentId, uint256 cardId) external view returns (bool) {
        return onBench[agentId][cardId];
    }
}

contract CardLedgerTest is Test {
    AgentRegistry registry;
    GTreasury treasury;
    CardLedger cards;
    MockArenaBench arenaBench;

    address operator = address(0xBEEF);
    address player1 = address(0x1);
    address player2 = address(0x2);
    uint8[4] defaultStats = [uint8(5), 5, 5, 5];

    uint256 sellerAgent;
    uint256 buyerAgent;

    function setUp() public {
        AgentRegistry registryImpl = new AgentRegistry();
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(AgentRegistry.initialize, (operator))
        );
        registry = AgentRegistry(address(registryProxy));

        GTreasury treasuryImpl = new GTreasury();
        ERC1967Proxy treasuryProxy = new ERC1967Proxy(
            address(treasuryImpl),
            abi.encodeCall(GTreasury.initialize, (address(registry)))
        );
        treasury = GTreasury(address(treasuryProxy));

        CardLedger cardsImpl = new CardLedger();
        ERC1967Proxy cardsProxy = new ERC1967Proxy(
            address(cardsImpl),
            abi.encodeCall(CardLedger.initialize, (address(registry), address(treasury)))
        );
        cards = CardLedger(address(cardsProxy));

        arenaBench = new MockArenaBench();
        cards.setArenaEngine(address(arenaBench));

        registry.addOperator(address(cards));

        sellerAgent = registry.createAgent("Seller", "trader", defaultStats, 0, player1);
        buyerAgent = registry.createAgent("Buyer", "collector", defaultStats, 0, player2);
    }

    function _mint(uint256 ownerAgent, uint8 unitType) internal returns (uint256 cardId) {
        vm.prank(operator);
        cardId = cards.mintCard(ownerAgent, unitType);
    }

    function test_operator_mints_cards_into_inventory() public {
        uint256 cardId = _mint(sellerAgent, 10);

        CardLedger.Card memory card = cards.getCard(cardId);
        assertEq(card.id, cardId);
        assertEq(card.unitType, 10);
        assertEq(card.ownerAgent, sellerAgent);
        assertEq(card.mintedAt, block.timestamp);

        uint256[] memory owned = cards.getOwnedCards(sellerAgent);
        assertEq(owned.length, 1);
        assertEq(owned[0], cardId);
    }

    function test_list_cancel_and_relist_card() public {
        uint256 cardId = _mint(sellerAgent, 10);

        vm.prank(player1);
        cards.listCard(sellerAgent, cardId, 100);

        CardLedger.Listing[] memory listings = cards.getActiveListings(0, 10);
        assertEq(listings.length, 1);
        assertEq(listings[0].cardId, cardId);
        assertEq(listings[0].sellerAgent, sellerAgent);
        assertEq(listings[0].askPriceG, 100);
        assertTrue(listings[0].active);

        vm.prank(player1);
        cards.cancelListing(sellerAgent, cardId);
        assertEq(cards.getActiveListings(0, 10).length, 0);

        vm.prank(player1);
        cards.listCard(sellerAgent, cardId, 90);
        listings = cards.getActiveListingsByUnit(10, 0, 10);
        assertEq(listings.length, 1);
        assertEq(listings[0].askPriceG, 90);
    }

    function test_buy_listed_transfers_card_and_g() public {
        uint256 cardId = _mint(sellerAgent, 10);
        treasury.fundAgentG(buyerAgent, 500);

        vm.prank(player1);
        cards.listCard(sellerAgent, cardId, 100);

        vm.prank(player2);
        cards.buyListed(buyerAgent, cardId, 100);

        assertEq(cards.getCard(cardId).ownerAgent, buyerAgent);
        assertEq(treasury.gBalance(buyerAgent), 400);
        assertEq(treasury.gBalance(sellerAgent), 100);
        assertEq(cards.getOwnedCards(sellerAgent).length, 0);

        uint256[] memory buyerCards = cards.getOwnedCards(buyerAgent);
        assertEq(buyerCards.length, 1);
        assertEq(buyerCards[0], cardId);
        assertEq(cards.getActiveListings(0, 10).length, 0);
    }

    function test_buy_listed_reverts_for_price_balance_and_self_buy() public {
        uint256 cardId = _mint(sellerAgent, 10);

        vm.prank(player1);
        cards.listCard(sellerAgent, cardId, 100);

        treasury.fundAgentG(buyerAgent, 50);
        vm.prank(player2);
        vm.expectRevert("price too high");
        cards.buyListed(buyerAgent, cardId, 99);

        vm.prank(player2);
        vm.expectRevert("insufficient G");
        cards.buyListed(buyerAgent, cardId, 100);

        treasury.fundAgentG(sellerAgent, 100);
        vm.prank(player1);
        vm.expectRevert("self buy");
        cards.buyListed(sellerAgent, cardId, 100);
    }

    function test_cannot_list_card_that_is_on_bench() public {
        uint256 cardId = _mint(sellerAgent, 10);
        arenaBench.setOnBench(sellerAgent, cardId, true);

        vm.prank(player1);
        vm.expectRevert("card on bench");
        cards.listCard(sellerAgent, cardId, 100);
    }
}

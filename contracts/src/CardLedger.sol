// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";
import "./GTreasury.sol";
import "./UnitCatalog.sol";

interface IArenaBench {
    function isCardOnBench(uint256 agentId, uint256 cardId) external view returns (bool);
}

/// @title CardLedger — persistent Arena card inventory and secondary market.
contract CardLedger is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct Card {
        uint256 id;
        uint8 unitType;
        uint256 ownerAgent;
        uint256 mintedAt;
    }

    struct Listing {
        uint256 cardId;
        uint256 sellerAgent;
        uint256 askPriceG;
        uint64 listedAt;
        bool active;
    }

    AgentRegistry public registry;
    GTreasury public gTreasury;
    IArenaBench public arenaEngine;
    uint256 public nextCardId;

    mapping(uint256 => Card) internal _cards;
    mapping(uint256 => Listing) internal _listings;
    mapping(uint256 => uint256[]) internal _ownedCards;
    mapping(uint256 => uint256) internal _ownedIndexPlusOne;
    uint256[] internal _listedCardIds;
    mapping(uint256 => bool) internal _wasListed;

    event CardMinted(uint256 indexed cardId, uint256 indexed ownerAgent, uint8 unitType);
    event CardListed(uint256 indexed cardId, uint256 indexed sellerAgent, uint256 askPriceG);
    event ListingCancelled(uint256 indexed cardId, uint256 indexed sellerAgent);
    event ListedCardBought(uint256 indexed cardId, uint256 indexed sellerAgent, uint256 indexed buyerAgent, uint256 priceG);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _registry, address _gTreasury) public initializer {
        __Ownable_init(msg.sender);
        registry = AgentRegistry(_registry);
        gTreasury = GTreasury(_gTreasury);
        nextCardId = 1;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    modifier onlyOperator() {
        require(registry.isOperator(msg.sender), "not operator");
        _;
    }

    modifier canControlAgent(uint256 agentId) {
        require(registry.isOperator(msg.sender) || msg.sender == registry.agentOwner(agentId), "not authorized");
        _;
    }

    function setArenaEngine(address _arenaEngine) external onlyOwner {
        arenaEngine = IArenaBench(_arenaEngine);
    }

    function mintCard(uint256 ownerAgent, uint8 unitType) external onlyOperator returns (uint256 cardId) {
        require(UnitCatalog.exists(unitType), "invalid unit type");
        cardId = nextCardId++;
        _cards[cardId] = Card({
            id: cardId,
            unitType: unitType,
            ownerAgent: ownerAgent,
            mintedAt: block.timestamp
        });
        _addOwnedCard(ownerAgent, cardId);
        emit CardMinted(cardId, ownerAgent, unitType);
    }

    function listCard(uint256 agentId, uint256 cardId, uint256 askPriceG) external canControlAgent(agentId) {
        Card storage card = _existingCard(cardId);
        require(card.ownerAgent == agentId, "not card owner");
        require(askPriceG > 0, "bad price");
        require(address(arenaEngine) != address(0), "arena not set");
        require(!arenaEngine.isCardOnBench(agentId, cardId), "card on bench");

        Listing storage listing = _listings[cardId];
        listing.cardId = cardId;
        listing.sellerAgent = agentId;
        listing.askPriceG = askPriceG;
        listing.listedAt = uint64(block.timestamp);
        listing.active = true;

        if (!_wasListed[cardId]) {
            _listedCardIds.push(cardId);
            _wasListed[cardId] = true;
        }

        emit CardListed(cardId, agentId, askPriceG);
    }

    function cancelListing(uint256 agentId, uint256 cardId) external canControlAgent(agentId) {
        Listing storage listing = _listings[cardId];
        require(listing.active, "not listed");
        require(listing.sellerAgent == agentId, "not seller");
        listing.active = false;
        emit ListingCancelled(cardId, agentId);
    }

    function buyListed(uint256 buyerAgent, uint256 cardId, uint256 maxPriceG) external canControlAgent(buyerAgent) {
        Listing storage listing = _listings[cardId];
        require(listing.active, "not listed");
        require(listing.askPriceG <= maxPriceG, "price too high");
        require(listing.sellerAgent != buyerAgent, "self buy");

        Card storage card = _existingCard(cardId);
        require(card.ownerAgent == listing.sellerAgent, "seller mismatch");

        uint256 sellerAgent = listing.sellerAgent;
        uint256 price = listing.askPriceG;

        listing.active = false;
        gTreasury.spendG(buyerAgent, price, bytes32("market_buy"));
        gTreasury.creditG(sellerAgent, price, bytes32("market_sale"));

        _removeOwnedCard(sellerAgent, cardId);
        card.ownerAgent = buyerAgent;
        _addOwnedCard(buyerAgent, cardId);

        emit ListedCardBought(cardId, sellerAgent, buyerAgent, price);
    }

    function getCard(uint256 cardId) external view returns (Card memory) {
        return _existingCardView(cardId);
    }

    function getOwnedCards(uint256 agentId) external view returns (uint256[] memory) {
        return _ownedCards[agentId];
    }

    function getActiveListings(uint256 offset, uint256 limit) external view returns (Listing[] memory) {
        return _activeListings(offset, limit, 0);
    }

    function getActiveListingsByUnit(uint8 unitType, uint256 offset, uint256 limit) external view returns (Listing[] memory) {
        require(UnitCatalog.exists(unitType), "invalid unit type");
        return _activeListings(offset, limit, unitType);
    }

    function _activeListings(uint256 offset, uint256 limit, uint8 unitType) internal view returns (Listing[] memory) {
        uint256 skipped;
        uint256 count;
        uint256 max = _listedCardIds.length;
        Listing[] memory tmp = new Listing[](limit);
        for (uint256 i = 0; i < max && count < limit; i++) {
            uint256 cardId = _listedCardIds[i];
            Listing storage listing = _listings[cardId];
            if (!listing.active) continue;
            if (unitType != 0 && _cards[cardId].unitType != unitType) continue;
            if (skipped < offset) {
                skipped++;
                continue;
            }
            tmp[count++] = listing;
        }

        Listing[] memory result = new Listing[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = tmp[i];
        }
        return result;
    }

    function _existingCard(uint256 cardId) internal view returns (Card storage card) {
        card = _cards[cardId];
        require(card.id != 0, "card not found");
    }

    function _existingCardView(uint256 cardId) internal view returns (Card memory card) {
        card = _cards[cardId];
        require(card.id != 0, "card not found");
    }

    function _addOwnedCard(uint256 agentId, uint256 cardId) internal {
        _ownedCards[agentId].push(cardId);
        _ownedIndexPlusOne[cardId] = _ownedCards[agentId].length;
    }

    function _removeOwnedCard(uint256 agentId, uint256 cardId) internal {
        uint256 idx1 = _ownedIndexPlusOne[cardId];
        require(idx1 != 0, "not owned");
        uint256 idx = idx1 - 1;
        uint256[] storage owned = _ownedCards[agentId];
        uint256 lastIdx = owned.length - 1;
        if (idx != lastIdx) {
            uint256 moved = owned[lastIdx];
            owned[idx] = moved;
            _ownedIndexPlusOne[moved] = idx + 1;
        }
        owned.pop();
        delete _ownedIndexPlusOne[cardId];
    }
}

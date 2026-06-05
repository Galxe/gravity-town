// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";
import "./GameEngine.sol";
import "./EvaluationLedger.sol";
import "./GTreasury.sol";
import "./CardLedger.sol";
import "./AbilityLib.sol";
import "./UnitCatalog.sol";
import "./ArenaCombat.sol";

/// @title ArenaEngine — async ghost autobattler (SAP-style) layered on the main world.
/// @notice Players submit a 5-slot bench (a "ghost") that other agents fight against
///         asynchronously. G-tier matchmaking + deterministic view-only combat.
///         Arena uses G through GTreasury. Battle results are written as
///         evaluation entries on the loser.
contract ArenaEngine is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    // ──────────────────── External deps ────────────────────

    AgentRegistry public registry;
    GameEngine public gameEngine;
    EvaluationLedger public evaluationLedger;

    /// @notice G-balance tier. Source of truth = {_tierFor} (reads gTreasury).
    ///         Frontend/MCP MUST read _tierFor, never re-derive thresholds.
    enum Tier { Bronze, Silver, Gold }

    // ──────────────────── Tunables ────────────────────

    uint8   public constant SLOTS              = 5;
    uint8   public constant SHOP_SIZE          = 5;     // shop draws 5 candidates
    uint256 public constant ROLL_COST          = 1;     // G to refresh shop (in whole-G units)

    /// @notice wei of native G per 1 whole-G price unit. UnitCatalog costs and
    ///         ROLL_COST are small whole-G integers; gTreasury accounts in wei.
    ///         Multiply at the spend boundary so the catalog stays readable and
    ///         `uint16 unitCost` never overflows (3..6 whole-G, not 3e18..6e18).
    uint256 public constant WEI_PER_G          = 1e18;
    uint16  public constant DEFAULT_ELO        = 1000;  // new ghost start
    uint16  public constant ELO_BUCKET_SIZE    = 200;   // ELO band shown by getGhost (1000..1199 → 5)
    uint16  public constant ELO_K              = 32;    // standard K-factor

    // Default tier thresholds in G. Used when the runtime overrides
    // (tierSilverMinG / tierGoldMinG) are unset. Tunable via setTierThresholds.
    uint256 public constant DEFAULT_TIER_SILVER_MIN_G = 100 * WEI_PER_G;   // gBalance ≥ 100 G → Silver
    uint256 public constant DEFAULT_TIER_GOLD_MIN_G   = 1000 * WEI_PER_G;  // gBalance ≥ 1000 G → Gold
    uint32  public constant DEFAULT_TIER_PERIOD = 1800; // default tier matchmaking cooldown (overridable per tier)
    uint16  public constant MAX_TIER_POOL_SIZE = 256;   // submit cap per tier pool — bounds Fisher-Yates gas

    // ──────────────────── Ghost ────────────────────

    /// @dev Packed-ish ghost record. The 5-slot bench stores unit type ids;
    ///      static stats come from UnitCatalog. Frozen tracks "shop frozen"
    ///      bits — a 5-bit mask is enough for the spike (no real shop pool yet).
    ///      atkOverride/hpOverride hold persistent buy/sell ability buffs that
    ///      stack on top of the base UnitCatalog stats when the ghost goes into
    ///      battle. Without these the ability would re-fire and the +ATK / +HP
    ///      would be lost on every materialize.
    /// TODO: add `uint16 season` field before launching seasons (storage slot
    ///       already aligned).
    struct Ghost {
        uint8[SLOTS] bench;        // 0 == empty
        uint16       elo;
        uint64       lastUpdate;
        uint16       frozenMask;   // bit i set → shop slot i frozen across rolls
        uint64       shopSeed;     // rolled by `roll`
        bool         exists;
        int16[SLOTS] atkOverride;  // persistent +ATK from ON_BUY / ON_SELL
        int16[SLOTS] hpOverride;   // persistent +HP  from ON_BUY / ON_SELL
        uint256[SLOTS] cardIds;    // persistent cards backing occupied slots
    }

    mapping(uint256 => Ghost) internal _ghosts;

    // ──────────────────── Match ────────────────────

    /// @dev A Match records who fought + the seed used. Combat itself is
    ///      reconstructed view-only from the seed + the two snapshotted ghosts.
    ///      We snapshot both the bench AND the persistent stat overlays so the
    ///      buy/sell buffs survive into combat (and a later buy/sell can't
    ///      retroactively change a queued match).
    struct Match {
        uint256 attackerId;
        uint256 defenderId;
        uint8[SLOTS] attackerBench;
        uint8[SLOTS] defenderBench;
        int16[SLOTS] attackerAtkOverride;
        int16[SLOTS] attackerHpOverride;
        int16[SLOTS] defenderAtkOverride;
        int16[SLOTS] defenderHpOverride;
        uint64  seed;
        uint64  createdAt;
        bool    settled;
        uint256 winnerId; // set on settle
        uint256[SLOTS] attackerCardIds;
        uint256[SLOTS] defenderCardIds;
    }

    mapping(uint256 => Match) internal _matches;
    uint256 public nextMatchId;
    GTreasury public gTreasury;
    CardLedger public cardLedger;
    bool public marketSeeded;

    // ──────────────────── Tier matchmaking ────────────────────
    // One pool per tier (no ELO sub-buckets). Tier is snapshotted at submit and
    // locked until settle, so mid-cycle G changes don't move an in-flight ghost.

    /// @notice Submitted ghosts per tier. Public getter exposes length via array.
    mapping(Tier => uint256[]) internal tierPool;
    /// @dev O(1) removal helper: tierPoolIndexPlusOne[agentId] = index+1. 0 = not pooled.
    mapping(uint256 => uint256) internal tierPoolIndexPlusOne;
    /// @notice agentId → tier it submitted into (locked at submit). Read alongside
    ///         {isSubmitted} — Bronze(0) is also the "never submitted" zero value.
    mapping(uint256 => Tier) public submittedTier;
    /// @dev True while the agent currently sits in a tier pool (disambiguates Bronze=0).
    mapping(uint256 => bool) public isSubmitted;
    /// @notice agentId → active matchId (0 = none). Blocks withdraw once matched.
    mapping(uint256 => uint256) public activeMatchOf;
    /// @notice Per-tier keeper rate-limit. Last run timestamp.
    mapping(Tier => uint64) public lastTierMatchmakingAt;
    /// @notice Per-tier matchmaking cooldown override (0 = use DEFAULT_TIER_PERIOD).
    mapping(Tier => uint64) public tierMatchmakingPeriod;

    /// @notice Runtime tier-threshold overrides in G (0 = use the DEFAULT_* constant).
    ///         Owner-tunable via {setTierThresholds} so segments can be retuned in
    ///         operation without a contract upgrade. {tierThresholds} resolves the
    ///         effective values; {_tierFor} reads through it.
    uint256 public tierSilverMinG;
    uint256 public tierGoldMinG;

    /// @notice Opt-in: when true, settle auto-re-queues the ghost (re-snapshotting
    ///         tier from current G) instead of clearing it, so an agent keeps
    ///         laddering without a manual re-submit each round. Set per submit
    ///         (default false = one-shot). Cleared on withdraw / on full release.
    ///         (appended last for UUPS storage-layout safety.)
    mapping(uint256 => bool) public autoRequeue;

    // ──────────────────── Events ────────────────────

    event CardBought(uint256 indexed agentId, uint256 indexed cardId, uint8 unitType, uint16 cost);
    event CardPlaced(uint256 indexed agentId, uint256 indexed cardId, uint8 unitType, uint8 slot);
    event CardRemoved(uint256 indexed agentId, uint256 indexed cardId, uint8 unitType, uint8 slot);
    event UnitMoved(uint256 indexed agentId, uint8 fromSlot, uint8 toSlot);
    event ShopFrozen(uint256 indexed agentId, uint8 shopSlot, bool nowFrozen);
    event ShopRolled(uint256 indexed agentId, uint64 newSeed);

    event MatchCreated(uint256 indexed matchId, uint256 indexed attackerId, uint256 indexed defenderId, uint64 seed);
    event MatchSettled(uint256 indexed matchId, uint256 indexed winnerId, uint16 newWinnerElo, uint16 newLoserElo);

    // Tier matchmaking events.
    event GhostSubmitted(uint256 indexed agentId, Tier tier, uint16 elo, uint256 gAtSubmit);
    event SubmissionWithdrawn(uint256 indexed agentId, Tier tier);
    event MatchmadeInTier(Tier indexed tier, uint256 matchId, uint256 attacker, uint256 defender);
    event MatchmakingPeriodSet(Tier indexed tier, uint64 secs);
    event TierThresholdsSet(uint256 silverMinG, uint256 goldMinG);

    // ──────────────────── Init / Auth ────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address _registry,
        address _gameEngine,
        address _evaluationLedger,
        address _gTreasury,
        address _cardLedger
    ) public initializer {
        __Ownable_init(msg.sender);
        registry = AgentRegistry(_registry);
        gameEngine = GameEngine(_gameEngine);
        evaluationLedger = EvaluationLedger(_evaluationLedger);
        gTreasury = GTreasury(_gTreasury);
        cardLedger = CardLedger(_cardLedger);
        nextMatchId = 1;
    }

    function setEvaluationLedger(address _v) external onlyOwner { evaluationLedger = EvaluationLedger(_v); }
    function setGameEngine(address _v) external onlyOwner { gameEngine = GameEngine(_v); }
    function setGTreasury(address _v) external onlyOwner { gTreasury = GTreasury(_v); }
    function setCardLedger(address _v) external onlyOwner { cardLedger = CardLedger(_v); }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ──────────────────── Tier views ────────────────────

    /// @notice Canonical tier for an agent = f(current G balance). The ONLY source
    ///         of truth for Bronze/Silver/Gold — frontend and MCP must read this,
    ///         never re-implement the thresholds. Returns Bronze when gTreasury is
    ///         unset so the arena still functions before the G economy is wired.
    function _tierFor(uint256 agentId) public view returns (Tier) {
        if (address(gTreasury) == address(0)) return Tier.Bronze;
        uint256 g = gTreasury.gBalance(agentId);
        (uint256 silverMinG, uint256 goldMinG) = tierThresholds();
        if (g >= goldMinG) return Tier.Gold;
        if (g >= silverMinG) return Tier.Silver;
        return Tier.Bronze;
    }

    /// @notice Effective tier thresholds in G — the runtime override if set, else
    ///         the DEFAULT_* constants. Read this (or {_tierFor}) instead of the
    ///         constants so retuned segments stay consistent everywhere.
    function tierThresholds() public view returns (uint256 silverMinG, uint256 goldMinG) {
        silverMinG = tierSilverMinG == 0 ? DEFAULT_TIER_SILVER_MIN_G : tierSilverMinG;
        goldMinG   = tierGoldMinG   == 0 ? DEFAULT_TIER_GOLD_MIN_G   : tierGoldMinG;
    }

    /// @notice Retune the Bronze/Silver/Gold G boundaries in operation — no contract
    ///         upgrade needed. Frontend follows automatically (it reads {_tierFor}).
    ///         Requires 0 < silver < gold. To restore defaults, set 100 / 1000.
    function setTierThresholds(uint256 silverMinG, uint256 goldMinG) external onlyOwner {
        require(silverMinG > 0 && silverMinG < goldMinG, "bad thresholds");
        tierSilverMinG = silverMinG;
        tierGoldMinG = goldMinG;
        emit TierThresholdsSet(silverMinG, goldMinG);
    }

    /// @notice Batch tier + G balance for many agents in a single call. Lets the
    ///         leaderboard hydrate with ONE RPC instead of 2 per agent. Tier stays
    ///         canonical (computed on-chain via {_tierFor}); gBalance is 0 when the
    ///         G economy isn't wired yet — callers gate display on {gTreasury} != 0.
    function tierStates(uint256[] calldata agentIds)
        external
        view
        returns (uint8[] memory tiers, uint256[] memory gBalances)
    {
        uint256 n = agentIds.length;
        tiers = new uint8[](n);
        gBalances = new uint256[](n);
        bool hasGT = address(gTreasury) != address(0);
        for (uint256 i = 0; i < n; i++) {
            tiers[i] = uint8(_tierFor(agentIds[i]));
            gBalances[i] = hasGT ? gTreasury.gBalance(agentIds[i]) : 0;
        }
    }

    /// @notice Number of ghosts currently submitted in a tier's pool. (MCP uses this.)
    function tierPopulation(Tier tier) external view returns (uint256) {
        return tierPool[tier].length;
    }

    /// @notice Effective matchmaking cooldown for a tier (override or default).
    function effectiveTierPeriod(Tier tier) public view returns (uint64) {
        uint64 p = tierMatchmakingPeriod[tier];
        return p == 0 ? uint64(DEFAULT_TIER_PERIOD) : p;
    }

    function _isOperator(address addr) internal view returns (bool) {
        return addr == registry.operator() || registry.operators(addr) || addr == owner();
    }

    // TODO PR #2: support EOA-only players for ABCD-D (跨身份) — current
    //             check requires the caller to either be an operator or
    //             registered as the agent's owner.
    modifier canControlAgent(uint256 agentId) {
        require(
            _isOperator(msg.sender) || msg.sender == registry.agentOwner(agentId),
            "not authorized"
        );
        _;
    }

    // ══════════════════════════════════════════════════════════
    //                     5 PLAYER VERBS
    // ══════════════════════════════════════════════════════════

    /// @notice Buy a persistent card into inventory. It is not placed on the bench.
    function buy(uint256 agentId, uint8 unitType)
        external canControlAgent(agentId) returns (uint256 cardId)
    {
        require(UnitCatalog.exists(unitType), "invalid unit type");
        Ghost storage g = _getOrInitGhost(agentId);
        require(address(gTreasury) != address(0), "G treasury not set");
        require(address(cardLedger) != address(0), "card ledger not set");

        ( , , , uint16 unitCost, ) = UnitCatalog.getUnit(unitType);
        gTreasury.spendG(agentId, uint256(unitCost) * WEI_PER_G, bytes32("arena_buy"));
        cardId = cardLedger.mintCard(agentId, unitType);
        g.lastUpdate = uint64(block.timestamp);
        _assertGhostInvariant(agentId, g);

        emit CardBought(agentId, cardId, unitType, unitCost);
    }

    /// @notice Place an owned inventory card onto an empty bench slot.
    function placeCard(uint256 agentId, uint256 cardId, uint8 slot)
        external canControlAgent(agentId)
    {
        require(slot < SLOTS, "bad slot");
        Ghost storage g = _getOrInitGhost(agentId);
        require(g.bench[slot] == 0, "slot occupied");
        require(address(cardLedger) != address(0), "card ledger not set");
        require(!_isCardOnBench(agentId, cardId), "card on bench");
        require(!cardLedger.isListed(cardId), "card listed");

        CardLedger.Card memory card = cardLedger.getCard(cardId);
        require(card.ownerAgent == agentId, "not card owner");
        uint8 unitType = card.unitType;

        ( , , , , AbilityLib.Ability memory ability) = UnitCatalog.getUnit(unitType);
        g.bench[slot] = unitType;
        g.cardIds[slot] = cardId;
        g.lastUpdate = uint64(block.timestamp);

        // Buy-trigger abilities now fire when a card enters the bench, because
        // buying itself only moves the card into inventory.
        _applyBenchAbility(g, slot, ability, AbilityLib.TRIG_ON_BUY);
        _assertGhostInvariant(agentId, g);

        emit CardPlaced(agentId, cardId, unitType, slot);
    }

    /// @notice Remove a card from the bench back to inventory. No G is credited.
    function removeCard(uint256 agentId, uint8 slot)
        external canControlAgent(agentId)
    {
        require(slot < SLOTS, "bad slot");
        Ghost storage g = _getOrInitGhost(agentId);
        uint8 unitType = g.bench[slot];
        require(unitType != 0, "empty slot");
        uint256 cardId = g.cardIds[slot];
        _assertGhostInvariant(agentId, g);

        ( , , , , AbilityLib.Ability memory ability) = UnitCatalog.getUnit(unitType);
        _applyBenchAbility(g, slot, ability, AbilityLib.TRIG_ON_SELL);

        g.bench[slot] = 0;
        g.cardIds[slot] = 0;
        g.atkOverride[slot] = 0;
        g.hpOverride[slot] = 0;
        g.lastUpdate = uint64(block.timestamp);

        _assertGhostInvariant(agentId, g);

        emit CardRemoved(agentId, cardId, unitType, slot);
    }

    /// @notice Swap two bench positions. Either or both may be empty.
    ///         Persistent ATK/HP overlays travel with the unit — so a unit
    ///         that was buffed at slot 0 keeps its buffs when moved to slot 2.
    function move(uint256 agentId, uint8 fromSlot, uint8 toSlot)
        external canControlAgent(agentId)
    {
        require(fromSlot < SLOTS && toSlot < SLOTS, "bad slot");
        require(fromSlot != toSlot, "same slot");
        Ghost storage g = _getOrInitGhost(agentId);

        uint8 tmp = g.bench[fromSlot];
        g.bench[fromSlot] = g.bench[toSlot];
        g.bench[toSlot] = tmp;

        uint256 tmpCardId = g.cardIds[fromSlot];
        g.cardIds[fromSlot] = g.cardIds[toSlot];
        g.cardIds[toSlot] = tmpCardId;

        int16 tmpAtk = g.atkOverride[fromSlot];
        g.atkOverride[fromSlot] = g.atkOverride[toSlot];
        g.atkOverride[toSlot] = tmpAtk;

        int16 tmpHp = g.hpOverride[fromSlot];
        g.hpOverride[fromSlot] = g.hpOverride[toSlot];
        g.hpOverride[toSlot] = tmpHp;

        g.lastUpdate = uint64(block.timestamp);
        _assertGhostInvariant(agentId, g);

        emit UnitMoved(agentId, fromSlot, toSlot);
    }

    /// @notice Freeze a shop slot so the next `roll` won't replace it.
    ///         Spike-simplified: just sets a bit; the actual shop pool lives
    ///         off-chain (seed-derived), so this is informational for clients.
    function freeze(uint256 agentId, uint8 shopSlot)
        external canControlAgent(agentId)
    {
        require(shopSlot < SHOP_SIZE, "bad shop slot");
        Ghost storage g = _getOrInitGhost(agentId);
        uint16 bit = uint16(1) << shopSlot;
        g.frozenMask ^= bit;
        bool nowFrozen = (g.frozenMask & bit) != 0;
        emit ShopFrozen(agentId, shopSlot, nowFrozen);
    }

    /// @notice Refresh the shop seed. Costs ROLL_COST G.
    function roll(uint256 agentId)
        external canControlAgent(agentId)
    {
        Ghost storage g = _getOrInitGhost(agentId);
        require(address(gTreasury) != address(0), "G treasury not set");
        gTreasury.spendG(agentId, ROLL_COST * WEI_PER_G, bytes32("arena_roll"));

        uint64 newSeed = uint64(uint256(keccak256(abi.encode(
            block.prevrandao, agentId, block.timestamp, g.shopSeed
        ))));
        g.shopSeed = newSeed;
        g.lastUpdate = uint64(block.timestamp);
        emit ShopRolled(agentId, newSeed);
    }

    // ══════════════════════════════════════════════════════════
    //                     SUBMIT / BUCKETING
    // ══════════════════════════════════════════════════════════

    /// @notice Submit the ghost to the matchmaking pool (one-shot — falls out of the
    ///         pool after its next match settles). Idempotent while already pooled.
    function submit(uint256 agentId) external canControlAgent(agentId) {
        _submit(agentId, false);
    }

    /// @notice Submit with an explicit auto-requeue choice. `requeueOnSettle = true`
    ///         keeps the ghost laddering: after each match settles it is re-added to
    ///         the pool (tier re-snapshotted from current G) until you withdraw.
    ///         Toggleable — calling again updates the flag even while pooled.
    function submit(uint256 agentId, bool requeueOnSettle) external canControlAgent(agentId) {
        _submit(agentId, requeueOnSettle);
    }

    function _submit(uint256 agentId, bool requeueOnSettle) internal {
        Ghost storage g = _getOrInitGhost(agentId);
        _assertGhostInvariant(agentId, g);
        require(_hasAnyUnit(g), "empty bench");

        // The auto-requeue choice is honored even on an idempotent re-submit, so a
        // pooled player can flip it without leaving the pool.
        autoRequeue[agentId] = requeueOnSettle;

        // Snapshot G→tier and lock until settle. Idempotent while already pooled,
        // so a re-submit or a mid-cycle fundAgentG never moves an in-flight ghost
        // between tiers.
        if (!isSubmitted[agentId]) {
            Tier t = _tierFor(agentId);
            _addToTierPool(agentId, t);
            submittedTier[agentId] = t;
            isSubmitted[agentId] = true;
            uint256 gNow = address(gTreasury) == address(0) ? 0 : gTreasury.gBalance(agentId);
            emit GhostSubmitted(agentId, t, g.elo, gNow);
        }
    }

    /// @notice Pull a ghost out of its tier pool before it gets matched. Reverts
    ///         once an active match exists (`activeMatchOf != 0`) — the opponent is
    ///         entitled to the settle. No G is refunded (submit never charged any).
    function withdrawSubmission(uint256 agentId) external canControlAgent(agentId) {
        require(isSubmitted[agentId], "not submitted");
        require(activeMatchOf[agentId] == 0, "in active match");
        Tier t = submittedTier[agentId];
        _removeFromTierPool(agentId);
        isSubmitted[agentId] = false;
        delete submittedTier[agentId];
        delete autoRequeue[agentId];
        emit SubmissionWithdrawn(agentId, t);
    }

    function _addToTierPool(uint256 agentId, Tier t) internal {
        require(tierPool[t].length < MAX_TIER_POOL_SIZE, "tier pool full");
        tierPool[t].push(agentId);
        tierPoolIndexPlusOne[agentId] = tierPool[t].length; // index+1
    }

    /// @dev O(1) swap-pop removal from whatever tier pool the agent currently sits in.
    function _removeFromTierPool(uint256 agentId) internal {
        uint256 idx1 = tierPoolIndexPlusOne[agentId];
        if (idx1 == 0) return;
        uint256[] storage arr = tierPool[submittedTier[agentId]];
        uint256 i = idx1 - 1;
        uint256 last = arr.length - 1;
        if (i != last) {
            uint256 moved = arr[last];
            arr[i] = moved;
            tierPoolIndexPlusOne[moved] = i + 1;
        }
        arr.pop();
        delete tierPoolIndexPlusOne[agentId];
    }

    function _hasAnyUnit(Ghost storage g) internal view returns (bool) {
        for (uint8 i = 0; i < SLOTS; i++) {
            if (g.bench[i] != 0) return true;
        }
        return false;
    }

    /// @dev ELO band (elo / 200) surfaced by {getGhost} for display only — not a
    ///      matchmaking pool. Tier (G-based) matchmaking is the sole pairing path.
    function _bucketIdFor(uint16 elo) internal pure returns (uint16) {
        return elo / ELO_BUCKET_SIZE;
    }

    function _createMatch(uint256 attackerId, uint256 defenderId, uint256 seedMix) internal returns (uint256 mid) {
        mid = nextMatchId++;
        Match storage m = _matches[mid];
        m.attackerId = attackerId;
        m.defenderId = defenderId;
        m.attackerBench = _ghosts[attackerId].bench;
        m.defenderBench = _ghosts[defenderId].bench;
        m.attackerAtkOverride = _ghosts[attackerId].atkOverride;
        m.attackerHpOverride = _ghosts[attackerId].hpOverride;
        m.defenderAtkOverride = _ghosts[defenderId].atkOverride;
        m.defenderHpOverride = _ghosts[defenderId].hpOverride;
        m.attackerCardIds = _ghosts[attackerId].cardIds;
        m.defenderCardIds = _ghosts[defenderId].cardIds;
        m.seed = uint64(uint256(keccak256(abi.encode(seedMix, attackerId, defenderId))));
        m.createdAt = uint64(block.timestamp);
        // Lock both sides so they can't withdraw a now-committed submission.
        // Cleared on settle.
        activeMatchOf[attackerId] = mid;
        activeMatchOf[defenderId] = mid;
        emit MatchCreated(mid, attackerId, defenderId, m.seed);
    }

    // ══════════════════════════════════════════════════════════
    //                  TIER MATCHMAKING
    // ══════════════════════════════════════════════════════════

    /// @notice Pair up ghosts within a single G-tier pool. Permissionless (the
    ///         "owner-only" keeper label lives in the MCP layer), but rate-limited
    ///         to once per {effectiveTierPeriod} per tier. Matched ghosts leave the
    ///         pool and are locked via `activeMatchOf` until settle.
    function runMatchmaking(Tier tier) external returns (uint256 matchesCreated) {
        uint64 last = lastTierMatchmakingAt[tier];
        require(last == 0 || block.timestamp >= last + effectiveTierPeriod(tier), "rate limited");

        uint256[] storage pool = tierPool[tier];
        uint256 n = pool.length;
        if (n < 2) {
            lastTierMatchmakingAt[tier] = uint64(block.timestamp);
            return 0;
        }

        // Snapshot into memory and Fisher-Yates shuffle (don't churn storage).
        uint256[] memory ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) ids[i] = pool[i];

        // TODO: prevrandao is grindable — swap for VRF / commit-reveal before any
        //       prize pool rides on tier matchmaking. Demo-safe for now.
        uint256 seed = uint256(keccak256(abi.encode(
            block.prevrandao, uint8(tier), block.timestamp, n
        )));
        for (uint256 i = n - 1; i > 0; i--) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            uint256 j = seed % (i + 1);
            (ids[i], ids[j]) = (ids[j], ids[i]);
        }

        uint256 pairs = n / 2;
        for (uint256 k = 0; k < pairs; k++) {
            uint256 a = ids[2 * k];
            uint256 d = ids[2 * k + 1];
            uint256 mid = _createMatch(a, d, uint256(keccak256(abi.encode(seed, k))));
            // Matched ghosts leave the pool; they re-enter on next submit post-settle.
            _removeFromTierPool(a);
            _removeFromTierPool(d);
            emit MatchmadeInTier(tier, mid, a, d);
            matchesCreated++;
        }

        lastTierMatchmakingAt[tier] = uint64(block.timestamp);
    }

    /// @notice Override a tier's matchmaking cooldown (demo: drop to 60s). 0 resets
    ///         to {DEFAULT_TIER_PERIOD}. Owner-only — keeper cadence is operational.
    function setMatchmakingPeriod(Tier tier, uint64 secs) external onlyOwner {
        tierMatchmakingPeriod[tier] = secs;
        emit MatchmakingPeriodSet(tier, secs);
    }

    /// @dev Clear an agent's tier-submission state. Pool membership was already
    ///      dropped at match time; this releases the lock + per-round flags so the
    ///      next submit recomputes the tier fresh.
    function _clearTierSubmission(uint256 agentId) internal {
        activeMatchOf[agentId] = 0;
        isSubmitted[agentId] = false;
        delete submittedTier[agentId];
        delete tierPoolIndexPlusOne[agentId];
        delete autoRequeue[agentId];
    }

    /// @dev Post-settle release with opt-in auto-requeue (option B). Drops the match
    ///      lock, then — only if the agent opted in via {submit}(id, true) — re-snapshots
    ///      the tier from current G and re-adds the ghost to its pool so it keeps
    ///      laddering. Otherwise (or when the bench emptied / the pool is full) it
    ///      fully clears, so a one-shot submitter behaves exactly as before and
    ///      settlement can never revert.
    function _releaseAndRequeue(uint256 agentId) internal {
        activeMatchOf[agentId] = 0;
        Ghost storage g = _ghosts[agentId];
        Tier t = _tierFor(agentId);
        if (autoRequeue[agentId] && _hasAnyUnit(g) && tierPool[t].length < MAX_TIER_POOL_SIZE) {
            submittedTier[agentId] = t;
            isSubmitted[agentId] = true;
            _addToTierPool(agentId, t);
            uint256 gNow = address(gTreasury) == address(0) ? 0 : gTreasury.gBalance(agentId);
            emit GhostSubmitted(agentId, t, g.elo, gNow);
        } else {
            _clearTierSubmission(agentId);
        }
    }

    // ══════════════════════════════════════════════════════════
    //                     COMBAT SIMULATION
    // ══════════════════════════════════════════════════════════

    /// @notice Deterministic combat replay (view): full turn-by-turn trace + winner.
    ///         Combat logic lives in the {ArenaCombat} library (deployed separately
    ///         and linked) so ArenaEngine stays under the 24KB code-size limit.
    function simulateMatch(uint256 matchId)
        public view returns (ArenaCombat.Turn[] memory turns, uint256 winnerAgentId)
    {
        Match storage m = _matches[matchId];
        require(m.attackerId != 0, "no match");
        (turns, winnerAgentId) = ArenaCombat.simulateWithTrace(
            _sideOf(m, true), _sideOf(m, false), uint256(m.seed), m.attackerId, m.defenderId
        );
    }

    /// @notice Per-slot ATK/HP after buy/sell overlays AND all ON_START abilities
    ///         resolve — the true starting stats the combat trace runs on.
    function getInitialStats(uint256 matchId) external view returns (
        uint16[SLOTS] memory leftAtk,
        uint16[SLOTS] memory leftHp,
        uint16[SLOTS] memory rightAtk,
        uint16[SLOTS] memory rightHp
    ) {
        Match storage m = _matches[matchId];
        require(m.attackerId != 0, "no match");
        (leftAtk, leftHp, rightAtk, rightHp) = ArenaCombat.initialStats(
            _sideOf(m, true), _sideOf(m, false), uint256(m.seed)
        );
    }

    /// @dev Snapshot one side of a stored match into a combat Side (storage → memory).
    function _sideOf(Match storage m, bool attacker)
        internal view returns (ArenaCombat.Side memory s)
    {
        if (attacker) {
            s.bench = m.attackerBench;
            s.atkOverride = m.attackerAtkOverride;
            s.hpOverride = m.attackerHpOverride;
        } else {
            s.bench = m.defenderBench;
            s.atkOverride = m.defenderAtkOverride;
            s.hpOverride = m.defenderHpOverride;
        }
    }

    // ══════════════════════════════════════════════════════════
    //                     SETTLEMENT
    // ══════════════════════════════════════════════════════════

    /// @notice Apply the simulation result: ELO + evaluation ledger entry.
    ///         Anyone can call. Idempotent — settled matches revert.
    function settleMatch(uint256 matchId) external {
        Match storage m = _matches[matchId];
        require(m.attackerId != 0, "no match");
        require(!m.settled, "already settled");

        // Settle path skips the per-turn trace buffer — we only need the winner.
        uint256 winnerId = ArenaCombat.simulate(
            _sideOf(m, true), _sideOf(m, false), uint256(m.seed), m.attackerId, m.defenderId
        );
        uint256 loserId = winnerId == m.attackerId ? m.defenderId : m.attackerId;

        m.settled = true;
        m.winnerId = winnerId;

        // Release both sides. Agents that opted into auto-requeue (submit(id, true))
        // are re-added to the pool with their tier re-snapshotted from current G, so
        // the pool doesn't drain between rounds; one-shot submitters fall out and
        // must re-submit. Players opt out anytime via withdrawSubmission.
        _releaseAndRequeue(m.attackerId);
        _releaseAndRequeue(m.defenderId);

        // ELO update — Elo-style with K = 32, simplified expected score lookup
        // via a linear approx (good enough for spike — pure on-chain Elo with
        // real expected-score math needs fixed-point logistic which is
        // overkill here).
        (uint16 newWinElo, uint16 newLoseElo) = ArenaCombat.eloUpdate(_ghosts[winnerId].elo, _ghosts[loserId].elo);
        _setElo(winnerId, newWinElo);
        _setElo(loserId, newLoseElo);

        // Write evaluation entry on the loser's evaluation ledger — "you got beaten
        // by X". Rating 4 (slightly below mid) signals a defeat.
        if (address(evaluationLedger) != address(0)) {
            string memory content = "arena defeat";
            uint256[] memory related = new uint256[](1);
            related[0] = winnerId;
            evaluationLedger.write(loserId, winnerId, 4, "arena", content, related);
        }

        emit MatchSettled(matchId, winnerId, newWinElo, newLoseElo);
    }

    function _setElo(uint256 agentId, uint16 newElo) internal {
        _ghosts[agentId].elo = newElo;
    }

    // ══════════════════════════════════════════════════════════
    //                     INTERNALS
    // ══════════════════════════════════════════════════════════

    function _getOrInitGhost(uint256 agentId) internal returns (Ghost storage g) {
        g = _ghosts[agentId];
        if (!g.exists) {
            g.exists = true;
            g.elo = DEFAULT_ELO;
            g.lastUpdate = uint64(block.timestamp);
        }
    }

    /// @dev Pull bench + overlay arrays from storage into memory, dispatch the
    ///      ability through AbilityLib's bench-phase processor, and write the
    ///      mutated overlays back. Pure ADD_ATK / ADD_HP only — see
    ///      AbilityLib.applyBenchAbility for the supported effect/target set.
    function _applyBenchAbility(
        Ghost storage g,
        uint8 casterSlot,
        AbilityLib.Ability memory ability,
        uint8 expectedTrigger
    ) internal {
        if (ability.triggerEvent != expectedTrigger) return;
        uint8[SLOTS] memory bench = g.bench;
        int16[SLOTS] memory atkOv = g.atkOverride;
        int16[SLOTS] memory hpOv = g.hpOverride;
        (atkOv, hpOv) = AbilityLib.applyBenchAbility(
            bench, atkOv, hpOv, casterSlot, ability, expectedTrigger
        );
        g.atkOverride = atkOv;
        g.hpOverride = hpOv;
    }

    function _assertGhostInvariant(uint256 agentId, Ghost storage g) internal view {
        for (uint8 i = 0; i < SLOTS; i++) {
            uint8 unitType = g.bench[i];
            uint256 cardId = g.cardIds[i];
            require((unitType == 0) == (cardId == 0), "card/bench mismatch");
            if (cardId == 0) continue;
            require(address(cardLedger) != address(0), "card ledger not set");
            CardLedger.Card memory card = cardLedger.getCard(cardId);
            require(card.ownerAgent == agentId, "card owner mismatch");
            require(card.unitType == unitType, "card unit mismatch");
        }
    }

    /// @notice One-shot local/testnet market seed. Mints and lists representative cards.
    function bootstrapMarket(uint256 seedAgentId) external onlyOwner {
        require(!marketSeeded, "already seeded");
        require(address(gTreasury) != address(0), "G treasury not set");
        require(address(cardLedger) != address(0), "card ledger not set");
        // Faucet-gated: this is an unbacked free mint (credits G + lists cards),
        // so it can only run in faucet mode (testnet). In withdraw mode (mainnet)
        // it would break the full-backing invariant.
        require(gTreasury.faucetEnabled(), "faucet disabled");
        marketSeeded = true;

        gTreasury.creditG(seedAgentId, 500 * WEI_PER_G, bytes32("market_seed"));

        uint8[7] memory unitTypes = [uint8(1), 2, 4, 5, 8, 10, 11];
        for (uint8 i = 0; i < unitTypes.length; i++) {
            uint8 unitType = unitTypes[i];
            uint256 cardId = cardLedger.mintCard(seedAgentId, unitType);
            uint16 cost = UnitCatalog.cost(unitType);
            uint256 askPriceG = (cost > 1 ? uint256(cost) - 1 : uint256(cost)) * WEI_PER_G;
            cardLedger.listCard(seedAgentId, cardId, askPriceG);
        }
    }

    // ══════════════════════════════════════════════════════════
    //                     VIEWS
    // ══════════════════════════════════════════════════════════

    function getGhost(uint256 agentId) external view returns (
        uint8[SLOTS] memory bench,
        uint16 elo,
        uint16 bucketId,
        uint64 lastUpdate,
        bool exists
    ) {
        Ghost storage g = _ghosts[agentId];
        return (g.bench, g.elo, _bucketIdFor(g.elo), g.lastUpdate, g.exists);
    }

    function getGhostCards(uint256 agentId) external view returns (uint256[SLOTS] memory cardIds) {
        return _ghosts[agentId].cardIds;
    }

    function isCardOnBench(uint256 agentId, uint256 cardId) external view returns (bool) {
        return _isCardOnBench(agentId, cardId);
    }

    function _isCardOnBench(uint256 agentId, uint256 cardId) internal view returns (bool) {
        Ghost storage g = _ghosts[agentId];
        for (uint8 i = 0; i < SLOTS; i++) {
            if (g.cardIds[i] == cardId) return true;
        }
        return false;
    }

    function getMatch(uint256 matchId) external view returns (
        uint256 attackerId,
        uint256 defenderId,
        uint8[SLOTS] memory attackerBench,
        uint8[SLOTS] memory defenderBench,
        uint64 seed,
        uint64 createdAt,
        bool settled,
        uint256 winnerId
    ) {
        Match storage m = _matches[matchId];
        return (m.attackerId, m.defenderId, m.attackerBench, m.defenderBench,
                m.seed, m.createdAt, m.settled, m.winnerId);
    }


    /// @notice Preview the ELO change for a hypothetical (winner, loser) ELO pair.
    ///         Useful for clients to display "+X / -X" ahead of a settle, and for
    ///         tests to pin down the symmetric-K=32 contract.
    function previewEloUpdate(uint16 winnerElo, uint16 loserElo)
        external pure returns (uint16 newWinner, uint16 newLoser)
    {
        return ArenaCombat.eloUpdate(winnerElo, loserElo);
    }
}

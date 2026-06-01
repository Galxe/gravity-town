// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";
import "./GameEngine.sol";
import "./EvaluationLedger.sol";
import "./AbilityLib.sol";
import "./UnitCatalog.sol";

/// @title ArenaEngine — async ghost autobattler (SAP-style) layered on the main world.
/// @notice Players submit a 5-slot bench (a "ghost") that other agents fight against
///         asynchronously. ELO-bucketed matchmaking + deterministic view-only combat.
///         Ore is the only resource — bought via GameEngine.spendOre. Battle results
///         are written as evaluation entries on the loser.
contract ArenaEngine is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    // ──────────────────── External deps ────────────────────

    AgentRegistry public registry;
    GameEngine public gameEngine;
    EvaluationLedger public evaluationLedger;

    // ──────────────────── Tunables ────────────────────

    uint8   public constant SLOTS              = 5;
    uint8   public constant SHOP_SIZE          = 5;     // shop draws 5 candidates
    uint256 public constant ROLL_COST          = 1;     // ore to refresh shop
    uint16  public constant DEFAULT_ELO        = 1000;  // new ghost start
    uint16  public constant ELO_BUCKET_SIZE    = 200;   // 1000..1199 → bucket 5
    uint32  public constant MATCHMAKING_PERIOD = 1800;  // 30 minutes between bucket runs
    uint16  public constant ELO_K              = 32;    // standard K-factor

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
    }

    mapping(uint256 => Ghost) internal _ghosts;

    /// @notice bucketId = elo / ELO_BUCKET_SIZE.
    mapping(uint16 => uint256[]) public bucketGhosts;
    /// @dev O(1) removal helper: bucketIndex[agentId] = (bucketId, index+1). 0 = not in any bucket.
    mapping(uint256 => uint16) internal _bucketOf;
    mapping(uint256 => uint256) internal _indexOfPlusOne;

    /// @notice Last time we ran matchmaking on a bucket — keeper rate-limit.
    mapping(uint16 => uint64) public lastMatchmakingAt;

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
    }

    mapping(uint256 => Match) internal _matches;
    uint256 public nextMatchId;

    // ──────────────────── Events ────────────────────

    event GhostSubmitted(uint256 indexed agentId, uint16 elo, uint16 bucketId);
    event UnitBought(uint256 indexed agentId, uint8 unitType, uint8 slot, uint16 cost);
    event UnitSold(uint256 indexed agentId, uint8 slot, uint16 refund);
    event UnitMoved(uint256 indexed agentId, uint8 fromSlot, uint8 toSlot);
    event ShopFrozen(uint256 indexed agentId, uint8 shopSlot);
    event ShopRolled(uint256 indexed agentId, uint64 newSeed);

    event MatchCreated(uint256 indexed matchId, uint256 indexed attackerId, uint256 indexed defenderId, uint64 seed);
    event MatchSettled(uint256 indexed matchId, uint256 indexed winnerId, uint16 newWinnerElo, uint16 newLoserElo);
    event MatchmakingRan(uint16 indexed bucketId, uint256 matchesCreated);

    // ──────────────────── Init / Auth ────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address _registry,
        address _gameEngine,
        address _evaluationLedger
    ) public initializer {
        __Ownable_init(msg.sender);
        registry = AgentRegistry(_registry);
        gameEngine = GameEngine(_gameEngine);
        evaluationLedger = EvaluationLedger(_evaluationLedger);
        nextMatchId = 1;
    }

    function setEvaluationLedger(address _v) external onlyOwner { evaluationLedger = EvaluationLedger(_v); }
    function setGameEngine(address _v) external onlyOwner { gameEngine = GameEngine(_v); }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function _isOperator(address addr) internal view returns (bool) {
        return addr == registry.operator() || registry.operators(addr) || addr == owner();
    }

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

    /// @notice Buy a unit and place it in `toSlot` on your ghost.
    ///         Costs UnitCatalog.cost(unitType) ore — spent via GameEngine.
    function buy(uint256 agentId, uint8 unitType, uint8 toSlot)
        external canControlAgent(agentId)
    {
        require(UnitCatalog.exists(unitType), "invalid unit type");
        require(toSlot < SLOTS, "bad slot");

        Ghost storage g = _getOrInitGhost(agentId);
        require(g.bench[toSlot] == 0, "slot occupied");

        ( , , , uint16 unitCost, AbilityLib.Ability memory ability) = UnitCatalog.getUnit(unitType);
        gameEngine.spendOre(agentId, unitCost);

        g.bench[toSlot] = unitType;
        g.lastUpdate = uint64(block.timestamp);

        // Fire ON_BUY ability into the persistent bench stat overlay so
        // self / neighbor / all-ally buffs survive into the eventual battle.
        _applyBenchAbility(g, toSlot, ability, AbilityLib.TRIG_ON_BUY);

        emit UnitBought(agentId, unitType, toSlot, unitCost);
    }

    /// @notice Sell the unit at `slot`. Refunds 50% (rounded down) of original cost.
    function sell(uint256 agentId, uint8 slot)
        external canControlAgent(agentId)
    {
        require(slot < SLOTS, "bad slot");
        Ghost storage g = _getOrInitGhost(agentId);
        uint8 unitType = g.bench[slot];
        require(unitType != 0, "empty slot");

        ( , , , uint16 unitCost, AbilityLib.Ability memory ability) = UnitCatalog.getUnit(unitType);
        uint16 refund = unitCost / 2;

        // Fire ON_SELL ability BEFORE clearing the bench so neighbors/allies are
        // still present for targeting. The overlay for `slot` itself is then
        // cleared below — selling the unit removes its own persistent buffs.
        _applyBenchAbility(g, slot, ability, AbilityLib.TRIG_ON_SELL);

        g.bench[slot] = 0;
        g.atkOverride[slot] = 0;
        g.hpOverride[slot] = 0;
        g.lastUpdate = uint64(block.timestamp);

        if (refund > 0) {
            gameEngine.refundOre(agentId, refund);
        }

        emit UnitSold(agentId, slot, refund);
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

        int16 tmpAtk = g.atkOverride[fromSlot];
        g.atkOverride[fromSlot] = g.atkOverride[toSlot];
        g.atkOverride[toSlot] = tmpAtk;

        int16 tmpHp = g.hpOverride[fromSlot];
        g.hpOverride[fromSlot] = g.hpOverride[toSlot];
        g.hpOverride[toSlot] = tmpHp;

        g.lastUpdate = uint64(block.timestamp);

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
        g.frozenMask ^= uint16(1) << shopSlot;
        emit ShopFrozen(agentId, shopSlot);
    }

    /// @notice Refresh the shop seed. Costs ROLL_COST ore.
    function roll(uint256 agentId)
        external canControlAgent(agentId)
    {
        Ghost storage g = _getOrInitGhost(agentId);
        gameEngine.spendOre(agentId, ROLL_COST);

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

    /// @notice Submit the ghost to the matchmaking pool. Idempotent — re-submitting
    ///         simply confirms current state and ensures bucket membership.
    function submit(uint256 agentId) external canControlAgent(agentId) {
        Ghost storage g = _getOrInitGhost(agentId);
        require(_hasAnyUnit(g), "empty bench");

        uint16 bucketId = _bucketIdFor(g.elo);
        _addToBucket(agentId, bucketId);
        emit GhostSubmitted(agentId, g.elo, bucketId);
    }

    function _hasAnyUnit(Ghost storage g) internal view returns (bool) {
        for (uint8 i = 0; i < SLOTS; i++) {
            if (g.bench[i] != 0) return true;
        }
        return false;
    }

    function _bucketIdFor(uint16 elo) internal pure returns (uint16) {
        return elo / ELO_BUCKET_SIZE;
    }

    function _addToBucket(uint256 agentId, uint16 bucketId) internal {
        uint16 currentBucket = _bucketOf[agentId];
        uint256 idx = _indexOfPlusOne[agentId];
        if (idx != 0 && currentBucket == bucketId) {
            return; // already there
        }
        if (idx != 0) {
            _removeFromBucket(agentId);
        }
        bucketGhosts[bucketId].push(agentId);
        _bucketOf[agentId] = bucketId;
        _indexOfPlusOne[agentId] = bucketGhosts[bucketId].length; // index+1
    }

    function _removeFromBucket(uint256 agentId) internal {
        uint256 idx1 = _indexOfPlusOne[agentId];
        if (idx1 == 0) return;
        uint16 b = _bucketOf[agentId];
        uint256 i = idx1 - 1;
        uint256[] storage arr = bucketGhosts[b];
        uint256 last = arr.length - 1;
        if (i != last) {
            uint256 moved = arr[last];
            arr[i] = moved;
            _indexOfPlusOne[moved] = i + 1;
        }
        arr.pop();
        delete _indexOfPlusOne[agentId];
        delete _bucketOf[agentId];
    }

    // ══════════════════════════════════════════════════════════
    //                     MATCHMAKING
    // ══════════════════════════════════════════════════════════

    /// @notice Pair up ghosts in a bucket via shuffled Fisher-Yates. Anyone can call,
    ///         but only once per MATCHMAKING_PERIOD per bucket.
    function runMatchmaking(uint16 bucketId) external returns (uint256 matchesCreated) {
        uint64 last = lastMatchmakingAt[bucketId];
        require(last == 0 || block.timestamp >= last + MATCHMAKING_PERIOD, "rate limited");

        uint256[] storage pool = bucketGhosts[bucketId];
        uint256 n = pool.length;
        if (n < 2) {
            lastMatchmakingAt[bucketId] = uint64(block.timestamp);
            emit MatchmakingRan(bucketId, 0);
            return 0;
        }

        // Snapshot+shuffle into memory (don't reshuffle storage every cycle).
        uint256[] memory ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) ids[i] = pool[i];

        uint256 seed = uint256(keccak256(abi.encode(
            block.prevrandao, bucketId, block.timestamp, n
        )));
        for (uint256 i = n - 1; i > 0; i--) {
            seed = uint256(keccak256(abi.encode(seed, i)));
            uint256 j = seed % (i + 1);
            (ids[i], ids[j]) = (ids[j], ids[i]);
        }

        // Pair adjacent. If n is odd the last ghost sits out this cycle.
        uint256 pairs = n / 2;
        for (uint256 k = 0; k < pairs; k++) {
            uint256 a = ids[2 * k];
            uint256 d = ids[2 * k + 1];
            _createMatch(a, d, seed ^ uint256(k + 1));
            matchesCreated++;
        }

        lastMatchmakingAt[bucketId] = uint64(block.timestamp);
        emit MatchmakingRan(bucketId, matchesCreated);
    }

    function _createMatch(uint256 attackerId, uint256 defenderId, uint256 seedMix) internal {
        uint256 mid = nextMatchId++;
        Match storage m = _matches[mid];
        m.attackerId = attackerId;
        m.defenderId = defenderId;
        m.attackerBench = _ghosts[attackerId].bench;
        m.defenderBench = _ghosts[defenderId].bench;
        m.attackerAtkOverride = _ghosts[attackerId].atkOverride;
        m.attackerHpOverride = _ghosts[attackerId].hpOverride;
        m.defenderAtkOverride = _ghosts[defenderId].atkOverride;
        m.defenderHpOverride = _ghosts[defenderId].hpOverride;
        m.seed = uint64(uint256(keccak256(abi.encode(seedMix, attackerId, defenderId))));
        m.createdAt = uint64(block.timestamp);
        emit MatchCreated(mid, attackerId, defenderId, m.seed);
    }

    // ══════════════════════════════════════════════════════════
    //                     COMBAT SIMULATION
    // ══════════════════════════════════════════════════════════

    /// @dev A single attack action in the deterministic trace.
    struct Turn {
        uint8  attackerSide;   // 0 = match's attacker side, 1 = defender side
        uint8  attackerSlot;
        uint8  defenderSlot;
        uint16 damage;
        bool   defenderDied;
    }

    /// @notice Deterministic combat replay for a settled or unsettled match.
    ///         View-only — does not touch storage.
    function simulateMatch(uint256 matchId) public view returns (Turn[] memory turns, uint256 winnerAgentId) {
        Match storage m = _matches[matchId];
        require(m.attackerId != 0, "no match");

        AbilityLib.BattleState memory state = _buildBattleState(
            m.attackerBench, m.attackerAtkOverride, m.attackerHpOverride,
            m.defenderBench, m.defenderAtkOverride, m.defenderHpOverride,
            uint256(m.seed)
        );

        // ON_START for everyone (left then right)
        state = AbilityLib.triggerAllOnStart(state);

        // Allocate trace buffer — 5v5 with ability extensions plausibly under 64 turns.
        Turn[] memory buf = new Turn[](128);
        uint256 turnCount;

        // Combat loop: alternate hits between sides. Pick highest-ATK alive on each side;
        // defender always picks slot[0]-most-alive (front line). Tiebreak: lowest slot.
        // This matches the spike spec: "attack 大的先动, 左→右对位".
        uint8 active = AbilityLib.SIDE_LEFT;
        uint256 safety = 0;
        while (
            AbilityLib.sideHasLiving(state, AbilityLib.SIDE_LEFT) &&
            AbilityLib.sideHasLiving(state, AbilityLib.SIDE_RIGHT) &&
            safety < 200
        ) {
            safety++;
            (uint8 atkSlot, bool foundA) = _pickHighestAtk(state, active);
            uint8 enemy = active == AbilityLib.SIDE_LEFT ? AbilityLib.SIDE_RIGHT : AbilityLib.SIDE_LEFT;
            (uint8 defSlot, bool foundD) = _pickFrontline(state, enemy);
            if (!foundA || !foundD) break;

            AbilityLib.Unit memory aUnit = AbilityLib._unitAt(state, active, atkSlot);
            uint16 dmg = aUnit.atk;
            bool died = AbilityLib.dealCombatDamage(state, enemy, defSlot, dmg);

            if (turnCount < buf.length) {
                buf[turnCount++] = Turn({
                    attackerSide: active,
                    attackerSlot: atkSlot,
                    defenderSlot: defSlot,
                    damage: dmg,
                    defenderDied: died
                });
            }

            active = enemy;
        }

        bool leftAlive = AbilityLib.sideHasLiving(state, AbilityLib.SIDE_LEFT);
        bool rightAlive = AbilityLib.sideHasLiving(state, AbilityLib.SIDE_RIGHT);
        if (leftAlive && !rightAlive) {
            winnerAgentId = m.attackerId;
        } else if (!leftAlive && rightAlive) {
            winnerAgentId = m.defenderId;
        } else {
            // Draw → attacker loses tie (defender's pick of frontline is more stable
            // and we need a winner for ELO settlement). Spike judgment.
            winnerAgentId = m.defenderId;
        }

        // Copy trimmed buffer
        turns = new Turn[](turnCount);
        for (uint256 i = 0; i < turnCount; i++) turns[i] = buf[i];
    }

    function _buildBattleState(
        uint8[SLOTS] memory leftBench,
        int16[SLOTS] memory leftAtkOverride,
        int16[SLOTS] memory leftHpOverride,
        uint8[SLOTS] memory rightBench,
        int16[SLOTS] memory rightAtkOverride,
        int16[SLOTS] memory rightHpOverride,
        uint256 seed
    ) internal pure returns (AbilityLib.BattleState memory state) {
        for (uint8 i = 0; i < SLOTS; i++) {
            state.left[i] = _materialize(leftBench[i], leftAtkOverride[i], leftHpOverride[i]);
            state.right[i] = _materialize(rightBench[i], rightAtkOverride[i], rightHpOverride[i]);
        }
        state.seed = seed;
    }

    function _materialize(uint8 unitType, int16 atkOverride, int16 hpOverride)
        internal pure returns (AbilityLib.Unit memory u)
    {
        if (unitType == 0) return u; // empty
        ( , uint16 atk, uint16 hp, , AbilityLib.Ability memory ab) = UnitCatalog.getUnit(unitType);
        // Apply persistent buy/sell overlay. Floor at 0 so a negative buff
        // (none exist today but future debuffs might) can't underflow uint16.
        int32 finalAtk = int32(uint32(atk)) + int32(atkOverride);
        int32 finalHp = int32(uint32(hp)) + int32(hpOverride);
        if (finalAtk < 0) finalAtk = 0;
        if (finalHp < 1) finalHp = 1; // a live unit must have at least 1 HP
        u.unitType = unitType;
        u.atk = uint16(uint32(finalAtk));
        u.hp = uint16(uint32(finalHp));
        u.alive = true;
        u.spawned = false;
        u.ability = ab;
    }

    function _pickHighestAtk(AbilityLib.BattleState memory state, uint8 side)
        internal pure returns (uint8 slot, bool found)
    {
        uint16 bestAtk;
        for (uint8 i = 0; i < SLOTS; i++) {
            if (AbilityLib._aliveAt(state, side, i)) {
                AbilityLib.Unit memory u = AbilityLib._unitAt(state, side, i);
                // strictly greater, so leftmost wins ties (matches "左→右对位")
                if (!found || u.atk > bestAtk) {
                    bestAtk = u.atk;
                    slot = i;
                    found = true;
                }
            }
        }
    }

    function _pickFrontline(AbilityLib.BattleState memory state, uint8 side)
        internal pure returns (uint8 slot, bool found)
    {
        for (uint8 i = 0; i < SLOTS; i++) {
            if (AbilityLib._aliveAt(state, side, i)) {
                return (i, true);
            }
        }
        return (0, false);
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

        ( , uint256 winnerId) = simulateMatch(matchId);
        uint256 loserId = winnerId == m.attackerId ? m.defenderId : m.attackerId;

        m.settled = true;
        m.winnerId = winnerId;

        // ELO update — Elo-style with K = 32, simplified expected score lookup
        // via a linear approx (good enough for spike — pure on-chain Elo with
        // real expected-score math needs fixed-point logistic which is
        // overkill here).
        (uint16 newWinElo, uint16 newLoseElo) = _eloUpdate(_ghosts[winnerId].elo, _ghosts[loserId].elo);
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

    function _eloUpdate(uint16 winnerElo, uint16 loserElo)
        internal pure returns (uint16 newWinner, uint16 newLoser)
    {
        // Standard expected score with logistic-base-400-D-10 approximated by a
        // bounded linear function: |diff| capped at 400 gives expected score
        // in roughly [0.1, 0.9]. K=32. Good enough for spike.
        int256 diff = int256(uint256(winnerElo)) - int256(uint256(loserElo));
        if (diff > 400) diff = 400;
        if (diff < -400) diff = -400;
        // expectedWin ≈ 0.5 + diff/800. Surplus = 1 - expectedWin = 0.5 - diff/800.
        // delta = K * surplus = 16 - K*diff/800 = 16 - diff/25.
        int256 deltaW = 16 - diff / 25;
        if (deltaW < 1) deltaW = 1;
        if (deltaW > 31) deltaW = 31;

        int256 deltaL = deltaW; // symmetric for spike

        int256 nw = int256(uint256(winnerElo)) + deltaW;
        int256 nl = int256(uint256(loserElo)) - deltaL;
        if (nw < 0) nw = 0;
        if (nl < 0) nl = 0;
        int256 maxU16 = int256(uint256(type(uint16).max));
        if (nw > maxU16) nw = maxU16;
        if (nl > maxU16) nl = maxU16;
        newWinner = uint16(uint256(nw));
        newLoser = uint16(uint256(nl));
    }

    function _setElo(uint256 agentId, uint16 newElo) internal {
        Ghost storage g = _ghosts[agentId];
        uint16 oldBucket = _bucketIdFor(g.elo);
        g.elo = newElo;
        uint16 newBucket = _bucketIdFor(newElo);
        if (_indexOfPlusOne[agentId] != 0 && oldBucket != newBucket) {
            _removeFromBucket(agentId);
            bucketGhosts[newBucket].push(agentId);
            _bucketOf[agentId] = newBucket;
            _indexOfPlusOne[agentId] = bucketGhosts[newBucket].length;
        }
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

    function bucketSize(uint16 bucketId) external view returns (uint256) {
        return bucketGhosts[bucketId].length;
    }

    function bucketOf(uint256 agentId) external view returns (uint16) {
        return _bucketOf[agentId];
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";
import "./LocationLedger.sol";
import "./AgentLedger.sol";
import "./EvaluationLedger.sol";

/// @title GameEngine — Hex territory with agent-level ore pool
contract GameEngine is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    AgentRegistry public registry;
    LocationLedger public locationLedger;
    AgentLedger public agentLedger;
    EvaluationLedger public evaluationLedger;

    // ──────────────────── Constants ────────────────────

    uint8  public constant BTYPE_MINE    = 1;
    uint8  public constant BTYPE_ARSENAL = 2;

    uint256 public constant SLOTS_PER_HEX        = 6;
    uint256 public constant MAX_ORE_POOL          = 1000;  // ore pool cap — excess is wasted
    uint256 public constant MINE_COST             = 50;   // ore
    uint256 public constant ARSENAL_COST          = 100;  // ore
    uint256 public constant BASE_ORE_PER_SEC      = 10;   // base production per hex (per second)
    uint256 public constant ORE_PER_MINE_PER_SEC  = 5;    // additional per mine (per second)
    uint256 public constant DEFENSE_PER_ARSENAL   = 5;
    uint256 public constant ATTACK_PER_ARSENAL    = 5;
    uint256 public constant ATTACK_COOLDOWN       = 5;    // seconds
    uint256 public constant STARTING_ORE          = 200;
    uint256 public constant INITIAL_RESERVE       = 2000;  // ore reserve per fresh hex
    uint256 public constant DEPLETED_ORE_PER_SEC  = 2;     // trickle production when reserve=0
    int32   public constant MAP_RADIUS            = 100;   // effectively unlimited — world grows as agents join
    uint256 public constant MAX_HAPPINESS         = 100;
    uint256 public constant CAPTURE_ORE_PCT       = 30;    // % of defender's pool stolen on capture
    uint256 public constant DEFENSE_MORALE        = 20;    // happiness restored on successful defense
    uint256 public constant SPAWN_HEXES           = 7;     // hexes per agent (center + ring)
    uint256 public constant POST_MORALE           = 5;     // happiness restored when posting to location board (reduced; debates are primary)
    uint256 public constant CAPTURE_MORALE_BOOST  = 15;    // happiness added to ALL owner's hexes on capture
    uint256 public constant INCITE_POWER          = 30;    // happiness reduced per successful incite
    uint256 public constant INCITE_COOLDOWN       = 30;    // seconds between incite attempts on same hex

    // ──────────────────── Debate Constants ────────────────────
    uint256 public constant DEBATE_DURATION        = 3600;   // 1 hour
    uint256 public constant DEBATE_BOOST           = 10;    // happiness gained when support wins
    uint256 public constant DEBATE_PENALTY         = 15;    // happiness lost when oppose wins

    // ──────────────────── Chronicle Constants ────────────────────
    uint256 public constant CHRONICLE_COOLDOWN     = 300;   // 5 minutes between same writer→target
    int256  public constant MAX_CHRONICLE_MODIFIER = 5;     // chronicle score clamped to [-5, +5]

    // ──────────────────── Hex Storage ────────────────────

    struct Hex {
        uint256 ownerId;       // agent ID, 0 = unclaimed
        uint256 locationId;    // LocationLedger location ID (bulletin board)
        int32   q;
        int32   r;
        uint256 mineCount;
        uint256 arsenalCount;
        uint256 lastHarvest;
        uint256 reserve;       // remaining ore reserve; when 0, production drops to trickle
        uint256 happiness;         // 0-100; hex rebels (becomes neutral) at 0
        uint256 happinessUpdatedAt; // timestamp of last happiness snapshot
    }

    mapping(bytes32 => Hex) public hexes;
    mapping(uint256 => bytes32[]) public agentHexKeys;   // agentId → owned hex keys
    mapping(uint256 => uint256) public hexCount;          // agentId → owned hex count
    bytes32[] public allHexKeys;                          // global list of all ever-created hex keys
    mapping(bytes32 => bool) public hexExists;            // dedup guard for allHexKeys

    /// @notice Agent-level ore pool. All hex production flows here.
    mapping(uint256 => uint256) public orePool;

    /// @notice attackCooldown[attackerAgent][targetHexKey] = timestamp
    mapping(uint256 => mapping(bytes32 => uint256)) public attackCooldown;

    // ──────────────────── Debate Storage ────────────────────

    struct Debate {
        uint256 entryId;        // LocationLedger entry ID that started this debate
        bytes32 hexKey;         // which hex this debate is about
        uint256 proposerId;     // agent who started it
        uint256 supportCount;
        uint256 opposeCount;
        uint256 deadline;       // block.timestamp + DEBATE_DURATION
        bool    resolved;
    }

    mapping(uint256 => Debate) public debates;                        // entryId → Debate
    mapping(uint256 => mapping(uint256 => bool)) public debateVoted;  // entryId → agentId → voted

    // ──────────────────── Chronicle Storage ────────────────────

    /// @notice Chronicle score per agent. Derived from ratings others give (1-10, midpoint 5).
    mapping(uint256 => int256) public chronicleScore;
    /// @notice Total number of chronicle entries received by an agent (for averaging).
    mapping(uint256 => uint256) public chronicleCount;
    /// @notice Sum of all ratings received (for computing average).
    mapping(uint256 => uint256) public chronicleRatingSum;
    /// @notice Cooldown: chronicleCooldown[writer][target] = timestamp of last write.
    mapping(uint256 => mapping(uint256 => uint256)) public chronicleCooldown;

    // ──────────────────── World Bible Storage ────────────────────

    /// @notice Location ID for the World Bible board.
    uint256 public worldBibleLocationId;
    /// @notice Timestamp of the last World Bible entry.
    uint256 public lastBibleTimestamp;
    /// @notice Minimum interval between World Bible entries (1 hour).
    uint256 public constant BIBLE_INTERVAL = 3600;

    // ──────────────────── Events ────────────────────

    event AgentCreated(uint256 indexed agentId, bytes32 indexed hexKey, uint256 locationId);
    event HexLost(uint256 indexed agentId, bytes32 indexed hexKey);
    event Built(uint256 indexed agentId, bytes32 indexed hexKey, uint8 buildingType);
    event Harvested(uint256 indexed agentId, uint256 oreGained);
    event AttackResult(
        uint256 indexed attackerId,
        bytes32 indexed targetHexKey,
        uint256 attackPower,
        uint256 defensePower,
        bool    success
    );
    event HexCaptured(uint256 indexed newOwner, bytes32 indexed hexKey, uint256 indexed oldOwner);
    event HexRebelled(bytes32 indexed hexKey, uint256 indexed oldOwner);
    event InciteResult(uint256 indexed agentId, bytes32 indexed targetHexKey, bool success, bool captured);
    event DebateStarted(uint256 indexed entryId, bytes32 indexed hexKey, uint256 indexed proposerId, uint256 deadline);
    event DebateVoted(uint256 indexed entryId, uint256 indexed voterId, bool support);
    event DebateResolved(uint256 indexed entryId, uint256 supportCount, uint256 opposeCount, int256 happinessChange);
    event ChronicleWritten(uint256 indexed authorId, uint256 indexed targetAgentId, uint8 rating);
    event WorldBibleWritten(uint256 indexed authorId, uint256 indexed entryId);

    // ──────────────────── Auth ────────────────────

    function _isOperator(address addr) internal view returns (bool) {
        return addr == registry.operator() || registry.operators(addr) || addr == owner();
    }

    modifier onlyOperatorOrOwner() {
        require(_isOperator(msg.sender), "not authorized");
        _;
    }

    modifier canControlAgent(uint256 agentId) {
        require(
            _isOperator(msg.sender) || msg.sender == registry.agentOwner(agentId),
            "not authorized"
        );
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _registry, address _locationLedger) public initializer {
        __Ownable_init(msg.sender);
        registry = AgentRegistry(_registry);
        locationLedger = LocationLedger(_locationLedger);
    }

    /// @notice Set agentLedger. Called once after upgrade.
    function setAgentLedger(address _agentLedger) external onlyOwner {
        agentLedger = AgentLedger(_agentLedger);
    }

    /// @notice Set evaluationLedger (for chronicle writes). Called once after deploy.
    function setEvaluationLedger(address _evaluationLedger) external onlyOwner {
        evaluationLedger = EvaluationLedger(_evaluationLedger);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ══════════════════════════════════════════════════════════
    //                     HEX KEY UTILS
    // ══════════════════════════════════════════════════════════

    function toKey(int32 q, int32 r) public pure returns (bytes32) {
        return keccak256(abi.encode(q, r));
    }

    /// @notice Axial hex distance from origin. max(|q|, |r|, |q+r|)
    function hexDist(int32 q, int32 r) public pure returns (int32) {
        int32 s = -(q + r);
        int32 aq = q < 0 ? -q : q;
        int32 ar = r < 0 ? -r : r;
        int32 as_ = s < 0 ? -s : s;
        int32 m = aq;
        if (ar > m) m = ar;
        if (as_ > m) m = as_;
        return m;
    }

    /// @notice Check if (q,r) is within world boundary
    function inBounds(int32 q, int32 r) public pure returns (bool) {
        return hexDist(q, r) <= MAP_RADIUS;
    }

    // ══════════════════════════════════════════════════════════
    //                     AGENT CREATION
    // ══════════════════════════════════════════════════════════

    /// @notice Create agent + auto-claim 7 hexes (center + ring). No empty land — must fight.
    function createAgent(
        string calldata name,
        string calldata personality,
        uint8[4] calldata stats,
        address ownerAddr
    ) external returns (uint256 agentId, bytes32 hexKey_) {
        // Find a center hex where center + all 6 neighbors are empty & in bounds
        (int32 cq, int32 cr) = _findEmptyCluster();
        hexKey_ = toKey(cq, cr);

        // Create home location & agent
        string memory locName = string.concat(name, "'s Base");
        uint256 locationId = locationLedger.createLocation(locName, "Player territory", cq, cr);
        agentId = registry.createAgent(name, personality, stats, locationId, ownerAddr);

        // Claim center hex
        _initHex(hexKey_, agentId, locationId, cq, cr);
        agentHexKeys[agentId].push(hexKey_);

        // Claim 6 surrounding hexes
        for (uint256 d = 0; d < 6; d++) {
            (int32 nq, int32 nr) = _getNeighbor(cq, cr, d);
            bytes32 nKey = toKey(nq, nr);
            string memory nLocName = string.concat("Hex(", _itoa(nq), ",", _itoa(nr), ")");
            uint256 nLocId = locationLedger.createLocation(nLocName, "Player territory", nq, nr);
            _initHex(nKey, agentId, nLocId, nq, nr);
            agentHexKeys[agentId].push(nKey);
        }

        hexCount[agentId] = 7;
        orePool[agentId] = STARTING_ORE;

        emit AgentCreated(agentId, hexKey_, locationId);
    }

    /// @dev Initialize a hex for an agent.
    function _initHex(bytes32 key, uint256 agentId, uint256 locationId, int32 q, int32 r) internal {
        Hex storage h = hexes[key];
        h.ownerId = agentId;
        h.locationId = locationId;
        h.q = q;
        h.r = r;
        h.lastHarvest = block.timestamp;
        h.reserve = INITIAL_RESERVE;
        h.happiness = MAX_HAPPINESS;
        h.happinessUpdatedAt = block.timestamp;
        if (!hexExists[key]) {
            allHexKeys.push(key);
            hexExists[key] = true;
        }
    }

    // ══════════════════════════════════════════════════════════
    //                     HARVEST (lazy ore pool)
    // ══════════════════════════════════════════════════════════

    /// @notice Harvest all hexes for an agent. Anyone can call.
    function harvest(uint256 agentId) external {
        _harvestAll(agentId);
    }

    /// @dev Harvest all hexes owned by agentId into their ore pool.
    function _harvestAll(uint256 agentId) internal {
        bytes32[] storage keys = agentHexKeys[agentId];
        uint256 totalProduced;
        for (uint256 i = 0; i < keys.length; i++) {
            Hex storage h = hexes[keys[i]];
            if (h.ownerId != agentId) continue;
            _updateHappiness(keys[i]);
            // Re-check ownership after happiness update (may have rebelled)
            if (h.ownerId != agentId) continue;
            totalProduced += _harvestHex(keys[i]);
        }
        uint256 newPool = orePool[agentId] + totalProduced;
        orePool[agentId] = newPool > MAX_ORE_POOL ? MAX_ORE_POOL : newPool;
        if (totalProduced > 0) {
            emit Harvested(agentId, totalProduced);
        }
    }

    /// @dev Harvest a single hex, returns ore produced (does NOT add to pool).
    function _harvestHex(bytes32 hexKey_) internal returns (uint256 produced) {
        Hex storage h = hexes[hexKey_];
        if (h.ownerId == 0) return 0;
        if (block.timestamp <= h.lastHarvest) return 0;

        uint256 elapsed = block.timestamp - h.lastHarvest;

        if (h.reserve > 0) {
            uint256 fullRate = BASE_ORE_PER_SEC + h.mineCount * ORE_PER_MINE_PER_SEC;
            uint256 raw = fullRate * elapsed;
            if (raw > h.reserve) {
                uint256 reserveTime = h.reserve / fullRate;
                uint256 depletedTime = elapsed - reserveTime;
                produced = h.reserve + DEPLETED_ORE_PER_SEC * depletedTime;
                h.reserve = 0;
            } else {
                produced = raw;
                h.reserve -= raw;
            }
        } else {
            produced = DEPLETED_ORE_PER_SEC * elapsed;
        }

        h.lastHarvest = block.timestamp;
    }

    // ══════════════════════════════════════════════════════════
    //                     BUILDING (instant)
    // ══════════════════════════════════════════════════════════

    /// @notice Build on a hex. Costs ore from agent's pool.
    function build(uint256 agentId, bytes32 hexKey_, uint8 buildingType)
        external canControlAgent(agentId)
    {
        _updateHappiness(hexKey_);
        Hex storage h = hexes[hexKey_];
        require(h.ownerId == agentId, "not your hex");
        require(h.mineCount + h.arsenalCount < SLOTS_PER_HEX, "hex full");

        _harvestAll(agentId);

        if (buildingType == BTYPE_MINE) {
            require(orePool[agentId] >= MINE_COST, "insufficient ore");
            orePool[agentId] -= MINE_COST;
            h.mineCount++;
        } else if (buildingType == BTYPE_ARSENAL) {
            require(orePool[agentId] >= ARSENAL_COST, "insufficient ore");
            orePool[agentId] -= ARSENAL_COST;
            h.arsenalCount++;
        } else {
            revert("invalid building type");
        }

        emit Built(agentId, hexKey_, buildingType);
    }

    // ══════════════════════════════════════════════════════════
    //                     COMBAT
    // ══════════════════════════════════════════════════════════

    /// @notice Attack a hex. Agent must be at the target hex's location.
    ///         Arsenals consumed from sourceHex, ore from pool.
    function attack(
        uint256 agentId,
        bytes32 targetHexKey,
        bytes32 sourceHexKey,
        uint256 arsenalSpend,
        uint256 oreSpend
    ) external canControlAgent(agentId) {
        _updateHappiness(targetHexKey);
        _updateHappiness(sourceHexKey);

        Hex storage target = hexes[targetHexKey];
        Hex storage source = hexes[sourceHexKey];

        require(target.ownerId != 0, "hex unclaimed");
        require(target.ownerId != agentId, "cannot attack own hex");
        require(source.ownerId == agentId, "not your source hex");
        require(arsenalSpend > 0 || oreSpend > 0, "must commit resources");

        (, , , uint256 agentLoc, ) = registry.getAgent(agentId);
        require(agentLoc == target.locationId, "must be at target hex");

        uint256 lastAtk = attackCooldown[agentId][targetHexKey];
        require(lastAtk == 0 || block.timestamp >= lastAtk + ATTACK_COOLDOWN, "cooldown");

        _harvestAll(agentId);

        // Consume arsenals from source hex
        require(source.arsenalCount >= arsenalSpend, "insufficient arsenals");
        source.arsenalCount -= arsenalSpend;

        // Consume ore from pool
        require(orePool[agentId] >= oreSpend, "insufficient ore");
        orePool[agentId] -= oreSpend;

        uint256 attackPower = arsenalSpend * ATTACK_PER_ARSENAL + oreSpend;
        uint256 defensePower = target.arsenalCount * DEFENSE_PER_ARSENAL;

        uint256 total = attackPower + defensePower;
        uint256 rand = uint256(keccak256(abi.encode(
            block.prevrandao, agentId, targetHexKey, block.timestamp, arsenalSpend, oreSpend
        ))) % total;

        bool success = rand < attackPower;

        if (success) {
            uint256 targetOwner = target.ownerId;

            // Steal ore from defender's pool
            _harvestAll(targetOwner);
            uint256 stolen = orePool[targetOwner] * CAPTURE_ORE_PCT / 100;
            orePool[targetOwner] -= stolen;
            uint256 np = orePool[agentId] + stolen;
            orePool[agentId] = np > MAX_ORE_POOL ? MAX_ORE_POOL : np;

            _removeHexFromAgent(targetOwner, targetHexKey);
            hexCount[targetOwner]--;

            target.ownerId = agentId;
            target.happiness = MAX_HAPPINESS;
            target.happinessUpdatedAt = block.timestamp;

            agentHexKeys[agentId].push(targetHexKey);
            hexCount[agentId]++;

            _boostAllHexes(agentId, CAPTURE_MORALE_BOOST);

            emit HexCaptured(agentId, targetHexKey, targetOwner);
        } else {
            uint256 newHappy = target.happiness + DEFENSE_MORALE;
            target.happiness = newHappy > MAX_HAPPINESS ? MAX_HAPPINESS : newHappy;
        }

        attackCooldown[agentId][targetHexKey] = block.timestamp;
        emit AttackResult(agentId, targetHexKey, attackPower, defensePower, success);
    }

    /// @dev Boost happiness on all hexes owned by an agent.
    function _boostAllHexes(uint256 agentId, uint256 amount) internal {
        bytes32[] storage keys = agentHexKeys[agentId];
        for (uint256 i = 0; i < keys.length; i++) {
            Hex storage h = hexes[keys[i]];
            if (h.ownerId == agentId) {
                uint256 newHappy = h.happiness + amount;
                h.happiness = newHappy > MAX_HAPPINESS ? MAX_HAPPINESS : newHappy;
            }
        }
    }

    // ══════════════════════════════════════════════════════════
    //                     SCORING
    // ══════════════════════════════════════════════════════════

    function getScore(uint256 agentId) external view returns (uint256) {
        uint256 hCount = hexCount[agentId];
        uint256 totalBuildings;

        bytes32[] storage keys = agentHexKeys[agentId];
        for (uint256 i = 0; i < keys.length; i++) {
            Hex storage h = hexes[keys[i]];
            if (h.ownerId == agentId) {
                totalBuildings += h.mineCount + h.arsenalCount;
            }
        }

        return hCount * 100 + orePool[agentId] + totalBuildings * 50;
    }

    // ══════════════════════════════════════════════════════════
    //                     VIEWS
    // ══════════════════════════════════════════════════════════

    function getHex(bytes32 hexKey_) external view returns (
        uint256 ownerId, uint256 locationId, int32 q, int32 r,
        uint256 mineCount, uint256 arsenalCount, uint256 lastHarvest,
        uint256 reserve, uint256 happiness, uint256 happinessUpdatedAt
    ) {
        Hex storage h = hexes[hexKey_];
        return (h.ownerId, h.locationId, h.q, h.r, h.mineCount, h.arsenalCount, h.lastHarvest, h.reserve, h.happiness, h.happinessUpdatedAt);
    }

    function getAgentHexKeys(uint256 agentId) external view returns (bytes32[] memory) {
        return agentHexKeys[agentId];
    }

    function getAllHexKeys() external view returns (bytes32[] memory) {
        return allHexKeys;
    }


    // ══════════════════════════════════════════════════════════
    //                  CLAIM NEUTRAL HEX
    // ══════════════════════════════════════════════════════════

    /// @notice Claim a neutral (rebelled) hex for free. Anyone can do this.
    function claimNeutral(uint256 agentId, bytes32 hexKey_)
        external canControlAgent(agentId)
    {
        Hex storage h = hexes[hexKey_];
        require(hexExists[hexKey_], "hex does not exist");
        require(h.ownerId == 0, "hex is owned");

        h.ownerId = agentId;
        h.happiness = MAX_HAPPINESS;
        h.happinessUpdatedAt = block.timestamp;
        h.lastHarvest = block.timestamp;

        agentHexKeys[agentId].push(hexKey_);
        hexCount[agentId]++;

        // Move agent to the claimed hex
        registry.moveAgent(agentId, h.locationId);

        emit HexCaptured(agentId, hexKey_, 0);
    }

    // ══════════════════════════════════════════════════════════
    //                  INCITE REBELLION (comeback mechanic)
    // ══════════════════════════════════════════════════════════

    /// @notice Eliminated agents (0 hexes) can incite rebellion on enemy hexes.
    ///         50% chance to reduce happiness by INCITE_POWER. If happiness → 0, hex is captured.
    function inciteRebellion(uint256 agentId, bytes32 targetHexKey)
        external canControlAgent(agentId)
    {
        require(hexCount[agentId] == 0, "only eliminated agents");

        uint256 lastIncite = attackCooldown[agentId][targetHexKey];
        require(lastIncite == 0 || block.timestamp >= lastIncite + INCITE_COOLDOWN, "cooldown");

        _updateHappiness(targetHexKey);
        Hex storage target = hexes[targetHexKey];
        require(target.ownerId != 0, "hex unclaimed");

        // 50% probability
        uint256 rand = uint256(keccak256(abi.encode(
            block.prevrandao, agentId, targetHexKey, block.timestamp
        ))) % 100;
        bool success = rand < 50;

        attackCooldown[agentId][targetHexKey] = block.timestamp;

        if (!success) {
            emit InciteResult(agentId, targetHexKey, false, false);
            return;
        }

        bool captured = false;
        if (target.happiness <= INCITE_POWER) {
            // Hex rebels and goes to the inciter — comeback!
            uint256 oldOwner = target.ownerId;
            _removeHexFromAgent(oldOwner, targetHexKey);
            hexCount[oldOwner]--;

            target.ownerId = agentId;
            target.happiness = MAX_HAPPINESS;
            target.happinessUpdatedAt = block.timestamp;
            target.lastHarvest = block.timestamp;

            agentHexKeys[agentId].push(targetHexKey);
            hexCount[agentId]++;

            // Give some starting ore
            orePool[agentId] = STARTING_ORE;

            // Move agent to captured hex
            registry.moveAgent(agentId, target.locationId);

            captured = true;
            emit HexCaptured(agentId, targetHexKey, oldOwner);
        } else {
            target.happiness -= INCITE_POWER;
        }

        emit InciteResult(agentId, targetHexKey, true, captured);
    }

    // ══════════════════════════════════════════════════════════
    //                     RAID (composite attack)
    // ══════════════════════════════════════════════════════════

    /// @notice Move to target hex + attack in one transaction.
    function raid(uint256 agentId, bytes32 targetHexKey, uint256 arsenalSpend, uint256 oreSpend)
        external canControlAgent(agentId)
    {
        _updateHappiness(targetHexKey);
        Hex storage target = hexes[targetHexKey];
        require(target.ownerId != 0, "hex unclaimed");
        require(target.ownerId != agentId, "cannot raid own hex");

        // Auto-find best source hex (most arsenals)
        bytes32 bestSource;
        uint256 bestArsenals;
        bytes32[] storage keys = agentHexKeys[agentId];
        for (uint256 i = 0; i < keys.length; i++) {
            Hex storage h = hexes[keys[i]];
            if (h.ownerId == agentId && h.arsenalCount > bestArsenals) {
                bestArsenals = h.arsenalCount;
                bestSource = keys[i];
            }
        }
        require(bestArsenals > 0, "no arsenals");
        require(bestArsenals >= arsenalSpend, "insufficient arsenals");

        _harvestAll(agentId);

        // Move agent to target location
        registry.moveAgent(agentId, target.locationId);

        uint256 lastAtk = attackCooldown[agentId][targetHexKey];
        require(lastAtk == 0 || block.timestamp >= lastAtk + ATTACK_COOLDOWN, "cooldown");

        // Consume resources
        hexes[bestSource].arsenalCount -= arsenalSpend;
        require(orePool[agentId] >= oreSpend, "insufficient ore");
        orePool[agentId] -= oreSpend;

        // Tullock
        uint256 attackPower = arsenalSpend * ATTACK_PER_ARSENAL + oreSpend;
        uint256 defensePower = target.arsenalCount * DEFENSE_PER_ARSENAL;
        uint256 total = attackPower + defensePower;
        uint256 rand = uint256(keccak256(abi.encode(
            block.prevrandao, agentId, targetHexKey, block.timestamp, arsenalSpend, oreSpend
        ))) % total;
        bool success = rand < attackPower;

        if (success) {
            uint256 targetOwner = target.ownerId;

            _harvestAll(targetOwner);
            uint256 stolen = orePool[targetOwner] * CAPTURE_ORE_PCT / 100;
            orePool[targetOwner] -= stolen;
            uint256 np = orePool[agentId] + stolen;
            orePool[agentId] = np > MAX_ORE_POOL ? MAX_ORE_POOL : np;

            _removeHexFromAgent(targetOwner, targetHexKey);
            hexCount[targetOwner]--;

            target.ownerId = agentId;
            target.happiness = MAX_HAPPINESS;
            target.happinessUpdatedAt = block.timestamp;

            agentHexKeys[agentId].push(targetHexKey);
            hexCount[agentId]++;

            _boostAllHexes(agentId, CAPTURE_MORALE_BOOST);

            emit HexCaptured(agentId, targetHexKey, targetOwner);
        } else {
            uint256 newHappy = target.happiness + DEFENSE_MORALE;
            target.happiness = newHappy > MAX_HAPPINESS ? MAX_HAPPINESS : newHappy;
        }

        attackCooldown[agentId][targetHexKey] = block.timestamp;
        emit AttackResult(agentId, targetHexKey, attackPower, defensePower, success);
    }

    // ══════════════════════════════════════════════════════════
    //                     DEBATE
    // ══════════════════════════════════════════════════════════

    /// @notice Start a debate on the hex you're currently at. Posts to location board.
    function startDebate(
        uint256 agentId,
        string calldata content
    ) external canControlAgent(agentId) returns (uint256 entryId) {
        (, , , uint256 agentLoc,) = registry.getAgent(agentId);

        // Find which hex this location belongs to
        bytes32 hexKey_ = _hexKeyForLocation(agentLoc);
        require(hexKey_ != bytes32(0), "not at a hex");

        _updateHappiness(hexKey_);
        Hex storage h = hexes[hexKey_];
        require(h.ownerId != 0, "hex unclaimed");

        // Post to location board with category "debate"
        uint256[] memory noRelated = new uint256[](0);
        (entryId,,) = locationLedger.write(agentId, 7, "debate", content, noRelated);

        // Create debate record
        debates[entryId] = Debate({
            entryId: entryId,
            hexKey: hexKey_,
            proposerId: agentId,
            supportCount: 0,
            opposeCount: 0,
            deadline: block.timestamp + DEBATE_DURATION,
            resolved: false
        });

        emit DebateStarted(entryId, hexKey_, agentId, block.timestamp + DEBATE_DURATION);
    }

    /// @notice Vote on an active debate. Must be at the same hex.
    function voteOnDebate(
        uint256 agentId,
        uint256 debateEntryId,
        bool support,
        string calldata content
    ) external canControlAgent(agentId) returns (uint256 voteEntryId) {
        Debate storage d = debates[debateEntryId];
        require(d.entryId != 0, "debate not found");
        require(!d.resolved, "debate already resolved");
        require(block.timestamp <= d.deadline, "debate expired");
        require(d.proposerId != agentId, "proposer cannot vote");
        require(!debateVoted[debateEntryId][agentId], "already voted");

        // Remote voting allowed — no need to be at the hex

        debateVoted[debateEntryId][agentId] = true;

        if (support) {
            d.supportCount++;
        } else {
            d.opposeCount++;
        }

        // Post vote to location board for visibility
        string memory category = support ? "support" : "oppose";
        uint256[] memory related = new uint256[](1);
        related[0] = d.proposerId;
        (voteEntryId,,) = locationLedger.write(agentId, 5, category, content, related);

        emit DebateVoted(debateEntryId, agentId, support);
    }

    /// @notice Resolve a debate after its deadline. Anyone can call.
    function resolveDebate(uint256 debateEntryId) external {
        Debate storage d = debates[debateEntryId];
        require(d.entryId != 0, "debate not found");
        require(!d.resolved, "already resolved");
        require(block.timestamp > d.deadline, "debate still active");

        d.resolved = true;
        _updateHappiness(d.hexKey);
        Hex storage h = hexes[d.hexKey];

        int256 happinessChange = int256(0);

        if (h.ownerId != 0) {
            if (d.supportCount > d.opposeCount) {
                uint256 newHappy = h.happiness + DEBATE_BOOST;
                h.happiness = newHappy > MAX_HAPPINESS ? MAX_HAPPINESS : newHappy;
                happinessChange = int256(DEBATE_BOOST);
            } else if (d.opposeCount > d.supportCount) {
                if (h.happiness <= DEBATE_PENALTY) {
                    h.happiness = 0;
                    uint256 oldOwner = h.ownerId;
                    h.ownerId = 0;
                    _removeHexFromAgent(oldOwner, d.hexKey);
                    hexCount[oldOwner]--;
                    emit HexRebelled(d.hexKey, oldOwner);
                } else {
                    h.happiness -= DEBATE_PENALTY;
                }
                happinessChange = -int256(DEBATE_PENALTY);
            }
            // equal votes: no change
        }

        emit DebateResolved(debateEntryId, d.supportCount, d.opposeCount, happinessChange);
    }

    /// @notice View a debate's state.
    function getDebate(uint256 debateEntryId) external view returns (
        uint256 entryId, bytes32 hexKey, uint256 proposerId,
        uint256 supportCount, uint256 opposeCount,
        uint256 deadline, bool resolved
    ) {
        Debate storage d = debates[debateEntryId];
        return (d.entryId, d.hexKey, d.proposerId, d.supportCount, d.opposeCount, d.deadline, d.resolved);
    }

    /// @dev Find the hex key for a given locationId. Returns bytes32(0) if none.
    function _hexKeyForLocation(uint256 locationId) internal view returns (bytes32) {
        for (uint256 i = 0; i < allHexKeys.length; i++) {
            if (hexes[allHexKeys[i]].locationId == locationId) {
                return allHexKeys[i];
            }
        }
        return bytes32(0);
    }

    // ══════════════════════════════════════════════════════════
    //                     CHRONICLE
    // ══════════════════════════════════════════════════════════

    /// @notice Write a chronicle entry about another agent. Rating 1-10.
    ///         Stored in target's AgentLedger. Affects target's chronicle score.
    function writeChronicle(
        uint256 authorId,
        uint256 targetAgentId,
        uint8 rating,
        string calldata content
    ) external canControlAgent(authorId) returns (uint256 entryId) {
        require(authorId != targetAgentId, "cannot chronicle yourself");
        require(rating >= 1 && rating <= 10, "rating must be 1-10");

        // Cooldown check
        uint256 lastWrite = chronicleCooldown[authorId][targetAgentId];
        require(lastWrite == 0 || block.timestamp >= lastWrite + CHRONICLE_COOLDOWN, "chronicle cooldown");
        chronicleCooldown[authorId][targetAgentId] = block.timestamp;

        // Write to target's EvaluationLedger (separate from their memories)
        uint256[] memory related = new uint256[](1);
        related[0] = authorId;
        (entryId,,) = evaluationLedger.write(
            targetAgentId, authorId, rating, "chronicle", content, related
        );

        // Update chronicle score
        chronicleCount[targetAgentId]++;
        chronicleRatingSum[targetAgentId] += rating;
        _recalcChronicleScore(targetAgentId);

        emit ChronicleWritten(authorId, targetAgentId, rating);
    }

    /// @dev Recalculate chronicle score from average rating. Midpoint = 5.
    function _recalcChronicleScore(uint256 agentId) internal {
        if (chronicleCount[agentId] == 0) {
            chronicleScore[agentId] = 0;
            return;
        }
        // avg in range [1,10], midpoint 5 → modifier in [-4, +5]
        // We clamp to [-MAX_CHRONICLE_MODIFIER, +MAX_CHRONICLE_MODIFIER]
        int256 avg = int256(chronicleRatingSum[agentId] / chronicleCount[agentId]);
        int256 mod_ = avg - 5;
        if (mod_ > MAX_CHRONICLE_MODIFIER) mod_ = MAX_CHRONICLE_MODIFIER;
        if (mod_ < -MAX_CHRONICLE_MODIFIER) mod_ = -MAX_CHRONICLE_MODIFIER;
        chronicleScore[agentId] = mod_;
    }

    /// @notice Get chronicle info for an agent.
    function getChronicle(uint256 agentId) external view returns (
        int256 score, uint256 count, uint256 ratingSum
    ) {
        return (chronicleScore[agentId], chronicleCount[agentId], chronicleRatingSum[agentId]);
    }

    // ══════════════════════════════════════════════════════════
    //                     WORLD BIBLE
    // ══════════════════════════════════════════════════════════

    /// @notice Initialize the World Bible location. Called once after deploy.
    function initWorldBible() external onlyOwner {
        require(worldBibleLocationId == 0, "already initialized");
        worldBibleLocationId = locationLedger.createLocation("World Bible", "The sacred chronicle of Gravity Town, written by the most renowned agent", 0, 0);
    }

    /// @notice Find the agent with the highest chronicle score.
    function highestChronicleAgent() public view returns (uint256 bestId, int256 bestScore) {
        bytes32[] storage keys = allHexKeys;
        // Collect unique agent IDs from hex ownership
        for (uint256 i = 0; i < keys.length; i++) {
            uint256 ownerId = hexes[keys[i]].ownerId;
            if (ownerId == 0) continue;
            int256 s = chronicleScore[ownerId];
            if (bestId == 0 || s > bestScore) {
                bestId = ownerId;
                bestScore = s;
            }
        }
    }

    /// @notice Write a World Bible entry. Only the highest-scored agent can write. 1 hour cooldown.
    function writeWorldBible(
        uint256 agentId,
        string calldata content
    ) external canControlAgent(agentId) returns (uint256 entryId) {
        require(worldBibleLocationId != 0, "world bible not initialized");
        require(block.timestamp >= lastBibleTimestamp + BIBLE_INTERVAL, "bible cooldown");

        (uint256 bestId,) = highestChronicleAgent();
        require(agentId == bestId, "only highest chronicle agent can write");

        uint256[] memory noRelated = new uint256[](0);
        (entryId,,) = locationLedger.write(agentId, 10, "world_bible", content, noRelated);
        lastBibleTimestamp = block.timestamp;

        emit WorldBibleWritten(agentId, entryId);
    }

    /// @notice Get World Bible info.
    function getWorldBible() external view returns (uint256 locationId, uint256 lastTimestamp, uint256 bestAgentId, int256 bestScore) {
        (bestAgentId, bestScore) = highestChronicleAgent();
        return (worldBibleLocationId, lastBibleTimestamp, bestAgentId, bestScore);
    }

    // ══════════════════════════════════════════════════════════
    //                     INTERNALS
    // ══════════════════════════════════════════════════════════

    int32 constant private NQ0 = 1;  int32 constant private NR0 = 0;
    int32 constant private NQ1 = 1;  int32 constant private NR1 = -1;
    int32 constant private NQ2 = 0;  int32 constant private NR2 = -1;
    int32 constant private NQ3 = -1; int32 constant private NR3 = 0;
    int32 constant private NQ4 = -1; int32 constant private NR4 = 1;
    int32 constant private NQ5 = 0;  int32 constant private NR5 = 1;

    function _getNeighbor(int32 q, int32 r, uint256 dir) internal pure returns (int32, int32) {
        if (dir == 0) return (q + NQ0, r + NR0);
        if (dir == 1) return (q + NQ1, r + NR1);
        if (dir == 2) return (q + NQ2, r + NR2);
        if (dir == 3) return (q + NQ3, r + NR3);
        if (dir == 4) return (q + NQ4, r + NR4);
        return (q + NQ5, r + NR5);
    }

    /// @dev Find a center hex where it + all 6 neighbors are empty and in bounds.
    function _findEmptyCluster() internal view returns (int32 cq, int32 cr) {
        // Try origin first
        if (_isClusterEmpty(0, 0)) return (0, 0);

        // Spiral outward
        for (int32 ring = 1; ring <= MAP_RADIUS; ring++) {
            cq = -ring;
            cr = ring;
            for (uint256 edge = 0; edge < 6; edge++) {
                for (int32 step = 0; step < ring; step++) {
                    if (_isClusterEmpty(cq, cr)) return (cq, cr);
                    (cq, cr) = _getNeighbor(cq, cr, edge);
                }
            }
        }
        revert("world full - no empty cluster");
    }

    /// @dev Check if center + all 6 neighbors are empty and in bounds.
    function _isClusterEmpty(int32 cq, int32 cr) internal view returns (bool) {
        if (!inBounds(cq, cr) || hexes[toKey(cq, cr)].ownerId != 0) return false;
        for (uint256 d = 0; d < 6; d++) {
            (int32 nq, int32 nr) = _getNeighbor(cq, cr, d);
            if (!inBounds(nq, nr) || hexes[toKey(nq, nr)].ownerId != 0) return false;
        }
        return true;
    }

    function _removeHexFromAgent(uint256 agentId, bytes32 hexKey_) internal {
        bytes32[] storage keys = agentHexKeys[agentId];
        for (uint256 i = 0; i < keys.length; i++) {
            if (keys[i] == hexKey_) {
                keys[i] = keys[keys.length - 1];
                keys.pop();
                return;
            }
        }
    }

    function _itoa(int32 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        bool neg = v < 0;
        uint256 abs = neg ? uint256(uint32(-v)) : uint256(uint32(v));
        uint256 digits;
        uint256 tmp = abs;
        while (tmp > 0) { digits++; tmp /= 10; }
        bytes memory b = new bytes(digits + (neg ? 1 : 0));
        if (neg) b[0] = "-";
        for (uint256 i = b.length; i > (neg ? 1 : 0); ) {
            i--;
            b[i] = bytes1(uint8(48 + abs % 10));
            abs /= 10;
        }
        return string(b);
    }

    // ══════════════════════════════════════════════════════════
    //                     HAPPINESS & REBELLION
    // ══════════════════════════════════════════════════════════

    function _updateHappiness(bytes32 hexKey_) internal {
        Hex storage h = hexes[hexKey_];
        if (h.ownerId == 0) return;

        uint256 elapsed30s = (block.timestamp - h.happinessUpdatedAt) / 30;
        if (elapsed30s == 0) return;

        uint256 decay = _calcDecay(elapsed30s, h.ownerId);
        h.happinessUpdatedAt = block.timestamp;

        if (h.happiness <= decay) {
            h.happiness = 0;
            uint256 oldOwner = h.ownerId;
            h.ownerId = 0;
            _removeHexFromAgent(oldOwner, hexKey_);
            hexCount[oldOwner]--;
            emit HexRebelled(hexKey_, oldOwner);
        } else {
            h.happiness -= decay;
        }
    }

    /// @dev Calculate decay for a given number of 30s ticks and agent.
    ///      Formula: baseDecay = elapsed30s * (1 + hexCount/3), then subtract chronicle bonus.
    function _calcDecay(uint256 elapsed30s, uint256 agentId) internal view returns (uint256) {
        uint256 hCount = hexCount[agentId];
        uint256 baseDecay = elapsed30s * (1 + hCount / 3);
        int256 cScore = chronicleScore[agentId];

        if (cScore > 0) {
            uint256 bonus = uint256(cScore) * elapsed30s;
            if (bonus >= baseDecay) return elapsed30s; // minimum 1 per tick
            return baseDecay - bonus;
        } else if (cScore < 0) {
            uint256 penalty = uint256(-cScore) * elapsed30s;
            return baseDecay + penalty;
        }
        return baseDecay;
    }

    function currentHappiness(bytes32 hexKey_) external view returns (uint256) {
        Hex storage h = hexes[hexKey_];
        if (h.ownerId == 0) return 0;
        uint256 elapsed30s = (block.timestamp - h.happinessUpdatedAt) / 30;
        uint256 decay = _calcDecay(elapsed30s, h.ownerId);
        return h.happiness > decay ? h.happiness - decay : 0;
    }

    function boostHappiness(uint256 agentId, bytes32 hexKey_) external canControlAgent(agentId) {
        Hex storage h = hexes[hexKey_];
        require(h.ownerId == agentId, "not your hex");
        _updateHappiness(hexKey_);
        uint256 newHappy = h.happiness + POST_MORALE;
        h.happiness = newHappy > MAX_HAPPINESS ? MAX_HAPPINESS : newHappy;
    }

}

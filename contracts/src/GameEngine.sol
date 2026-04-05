// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";
import "./LocationLedger.sol";

/// @title GameEngine — Hex territory, 2 building types, spatial combat, lazy harvest
contract GameEngine is Initializable, OwnableUpgradeable, UUPSUpgradeable {

    AgentRegistry public registry;
    LocationLedger public locationLedger;

    // ──────────────────── Constants ────────────────────

    uint8  public constant BTYPE_MINE    = 1;
    uint8  public constant BTYPE_ARSENAL = 2;

    uint256 public constant SLOTS_PER_HEX        = 12;
    uint256 public constant MINE_COST             = 50;   // ore
    uint256 public constant ARSENAL_COST          = 100;  // ore
    uint256 public constant BASE_ORE_PER_SEC      = 10;   // base production with 0 mines (per second)
    uint256 public constant ORE_PER_MINE_PER_SEC  = 5;    // additional per mine (per second)
    uint256 public constant DEFENSE_PER_ARSENAL   = 5;
    uint256 public constant ATTACK_PER_ARSENAL    = 5;
    uint256 public constant ATTACK_COOLDOWN       = 5;    // seconds
    uint256 public constant STARTING_ORE          = 200;
    uint256 public constant INITIAL_RESERVE       = 2000;  // ore reserve per fresh hex
    uint256 public constant DEPLETED_ORE_PER_SEC  = 2;     // trickle production when reserve=0
    int32   public constant MAP_RADIUS            = 4;     // world boundary: hex distance from origin
    uint256 public constant MAX_HAPPINESS         = 100;
    uint256 public constant CAPTURE_ORE_PCT       = 70;    // % ore kept on capture
    uint256 public constant DEFENSE_MORALE        = 20;    // happiness restored on successful defense
    uint256 public constant NEUTRAL_CLAIM_COST    = 50;    // ore to claim neutral hex (free if homeless)

    // ──────────────────── Hex Storage ────────────────────

    struct Hex {
        uint256 ownerId;       // agent ID, 0 = unclaimed
        uint256 locationId;    // LocationLedger location ID (bulletin board)
        int32   q;
        int32   r;
        uint256 mineCount;
        uint256 arsenalCount;
        uint256 ore;
        uint256 lastHarvest;
        uint256 reserve;       // remaining ore reserve; when 0, production drops to trickle
        uint256 happiness;         // 0-100; hex rebels (becomes neutral) at 0
        uint256 happinessUpdatedAt; // timestamp of last happiness snapshot
    }

    mapping(bytes32 => Hex) public hexes;
    mapping(uint256 => bytes32[]) public agentHexKeys;   // agentId → owned hex keys
    mapping(uint256 => uint256) public hexCount;          // agentId → owned hex count

    /// @notice attackCooldown[attackerAgent][targetHexKey] = timestamp
    mapping(uint256 => mapping(bytes32 => uint256)) public attackCooldown;

    // ──────────────────── Events ────────────────────

    event AgentCreated(uint256 indexed agentId, bytes32 indexed hexKey, uint256 locationId);
    event HexClaimed(uint256 indexed agentId, bytes32 indexed hexKey, int32 q, int32 r, uint256 locationId);
    event HexLost(uint256 indexed agentId, bytes32 indexed hexKey);
    event Built(uint256 indexed agentId, bytes32 indexed hexKey, uint8 buildingType);
    event Harvested(bytes32 indexed hexKey, uint256 oreGained);
    event AttackResult(
        uint256 indexed attackerId,
        bytes32 indexed targetHexKey,
        uint256 attackPower,
        uint256 defensePower,
        bool    success
    );
    event HexCaptured(uint256 indexed newOwner, bytes32 indexed hexKey, uint256 indexed oldOwner);
    event HexRebelled(bytes32 indexed hexKey, uint256 indexed oldOwner);
    event NeutralClaimed(uint256 indexed agentId, bytes32 indexed hexKey);

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

    /// @notice Create agent + auto-claim a hex near origin. Permissionless.
    function createAgent(
        string calldata name,
        string calldata personality,
        uint8[4] calldata stats,
        address ownerAddr
    ) external returns (uint256 agentId, bytes32 hexKey_) {
        // Find empty hex near origin
        (int32 q, int32 r) = _findEmptyHex();
        hexKey_ = toKey(q, r);

        // Create location in LocationLedger (bulletin board for this hex)
        string memory locName = string.concat(name, "'s Base");
        uint256 locationId = locationLedger.createLocation(locName, "Player territory", q, r);

        // Create agent at this location
        agentId = registry.createAgent(name, personality, stats, locationId, ownerAddr);

        // Initialize hex
        Hex storage h = hexes[hexKey_];
        h.ownerId = agentId;
        h.locationId = locationId;
        h.q = q;
        h.r = r;
        h.ore = STARTING_ORE;
        h.lastHarvest = block.timestamp;
        h.reserve = INITIAL_RESERVE;
        h.happiness = MAX_HAPPINESS;
        h.happinessUpdatedAt = block.timestamp;

        agentHexKeys[agentId].push(hexKey_);
        hexCount[agentId] = 1;

        emit AgentCreated(agentId, hexKey_, locationId);
    }

    // ══════════════════════════════════════════════════════════
    //                     HEX CLAIMING
    // ══════════════════════════════════════════════════════════

    /// @notice Claim an empty hex. Must be adjacent to an owned hex. Cost escalates.
    function claimHex(uint256 agentId, int32 q, int32 r, bytes32 sourceHexKey)
        external canControlAgent(agentId)
    {
        bytes32 key = toKey(q, r);
        require(inBounds(q, r), "outside world boundary");
        require(hexes[key].ownerId == 0, "hex occupied");

        // Must own at least 1 hex
        uint256 owned = hexCount[agentId];
        require(owned > 0, "no hexes owned");

        // Source hex must be owned by agent (where ore is deducted from)
        require(hexes[sourceHexKey].ownerId == agentId, "not your hex");

        // Check adjacency: new hex must be adjacent to at least one owned hex
        require(_isAdjacentToOwned(agentId, q, r), "must be adjacent to owned hex");

        // Claim cost: 0 for 1st (handled at birth), 200 * 2^(owned-1) for subsequent
        uint256 cost = 200 * (2 ** (owned - 1));

        // Update happiness & harvest source, then deduct
        _updateHappiness(sourceHexKey);
        _harvest(sourceHexKey);
        require(hexes[sourceHexKey].ore >= cost, "insufficient ore");
        hexes[sourceHexKey].ore -= cost;

        // Create location
        string memory locName = string.concat("Hex(", _itoa(q), ",", _itoa(r), ")");
        uint256 locationId = locationLedger.createLocation(locName, "Player territory", q, r);

        // Initialize hex
        Hex storage h = hexes[key];
        h.ownerId = agentId;
        h.locationId = locationId;
        h.q = q;
        h.r = r;
        h.lastHarvest = block.timestamp;
        h.reserve = INITIAL_RESERVE;
        h.happiness = MAX_HAPPINESS;
        h.happinessUpdatedAt = block.timestamp;

        agentHexKeys[agentId].push(key);
        hexCount[agentId] = owned + 1;

        // Move agent to new hex
        registry.moveAgent(agentId, locationId);

        emit HexClaimed(agentId, key, q, r, locationId);
    }

    // ══════════════════════════════════════════════════════════
    //                     HARVEST (lazy)
    // ══════════════════════════════════════════════════════════

    /// @notice Harvest pending ore on a hex. Anyone can call.
    ///         Also triggers happiness decay (may cause rebellion).
    function harvest(bytes32 hexKey_) external {
        _updateHappiness(hexKey_);
        _harvest(hexKey_);
    }

    function _harvest(bytes32 hexKey_) internal {
        Hex storage h = hexes[hexKey_];
        if (h.ownerId == 0) return;
        if (block.timestamp <= h.lastHarvest) return;

        uint256 elapsed = block.timestamp - h.lastHarvest;

        uint256 produced;
        if (h.reserve > 0) {
            // Normal production, capped by remaining reserve
            uint256 fullRate = BASE_ORE_PER_SEC + h.mineCount * ORE_PER_MINE_PER_SEC;
            uint256 raw = fullRate * elapsed;
            if (raw > h.reserve) {
                // Partially from reserve, rest at depleted rate
                uint256 reserveTime = h.reserve / fullRate;
                uint256 depletedTime = elapsed - reserveTime;
                produced = h.reserve + DEPLETED_ORE_PER_SEC * depletedTime;
                h.reserve = 0;
            } else {
                produced = raw;
                h.reserve -= raw;
            }
        } else {
            // Depleted: trickle only
            produced = DEPLETED_ORE_PER_SEC * elapsed;
        }

        h.ore += produced;
        h.lastHarvest = block.timestamp;

        emit Harvested(hexKey_, produced);
    }

    // ══════════════════════════════════════════════════════════
    //                     BUILDING (instant)
    // ══════════════════════════════════════════════════════════

    /// @notice Build a mine or arsenal on a hex. Instant, costs ore from that hex.
    function build(uint256 agentId, bytes32 hexKey_, uint8 buildingType)
        external canControlAgent(agentId)
    {
        _updateHappiness(hexKey_);
        Hex storage h = hexes[hexKey_];
        require(h.ownerId == agentId, "not your hex");
        require(h.mineCount + h.arsenalCount < SLOTS_PER_HEX, "hex full");

        _harvest(hexKey_);

        if (buildingType == BTYPE_MINE) {
            require(h.ore >= MINE_COST, "insufficient ore");
            h.ore -= MINE_COST;
            h.mineCount++;
        } else if (buildingType == BTYPE_ARSENAL) {
            require(h.ore >= ARSENAL_COST, "insufficient ore");
            h.ore -= ARSENAL_COST;
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
    ///         Spends arsenals from sourceHex (destroyed) + ore from sourceHex.
    ///         Win: target hex buildings destroyed, hex unclaimed.
    ///         Lose: spent resources gone.
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

        // Agent must be at target hex location
        (, , , uint256 agentLoc, ) = registry.getAgent(agentId);
        require(agentLoc == target.locationId, "must be at target hex");

        // Cooldown
        uint256 lastAtk = attackCooldown[agentId][targetHexKey];
        require(lastAtk == 0 || block.timestamp >= lastAtk + ATTACK_COOLDOWN, "cooldown");

        // Harvest both hexes
        _harvest(targetHexKey);
        _harvest(sourceHexKey);

        // Consume arsenals from source
        require(source.arsenalCount >= arsenalSpend, "insufficient arsenals");
        source.arsenalCount -= arsenalSpend;

        // Consume ore from source
        require(source.ore >= oreSpend, "insufficient ore");
        source.ore -= oreSpend;

        // Calculate powers
        uint256 attackPower = arsenalSpend * ATTACK_PER_ARSENAL + oreSpend;
        uint256 defensePower = target.arsenalCount * DEFENSE_PER_ARSENAL;

        // Tullock contest
        uint256 total = attackPower + defensePower;
        uint256 rand = uint256(keccak256(abi.encode(
            block.prevrandao, agentId, targetHexKey, block.timestamp, arsenalSpend, oreSpend
        ))) % total;

        bool success = rand < attackPower;

        if (success) {
            // Capture hex: transfer ownership, keep buildings, keep 70% ore
            uint256 targetOwner = target.ownerId;
            _removeHexFromAgent(targetOwner, targetHexKey);
            hexCount[targetOwner]--;

            target.ownerId = agentId;
            target.ore = target.ore * CAPTURE_ORE_PCT / 100;
            target.happiness = MAX_HAPPINESS;
            target.happinessUpdatedAt = block.timestamp;

            agentHexKeys[agentId].push(targetHexKey);
            hexCount[agentId]++;

            emit HexCaptured(agentId, targetHexKey, targetOwner);
        } else {
            // Successful defense boosts morale
            uint256 newHappy = target.happiness + DEFENSE_MORALE;
            target.happiness = newHappy > MAX_HAPPINESS ? MAX_HAPPINESS : newHappy;
        }

        attackCooldown[agentId][targetHexKey] = block.timestamp;
        emit AttackResult(agentId, targetHexKey, attackPower, defensePower, success);
    }

    // ══════════════════════════════════════════════════════════
    //                     SCORING
    // ══════════════════════════════════════════════════════════

    function getScore(uint256 agentId) external view returns (uint256) {
        uint256 hCount = hexCount[agentId];
        uint256 totalOre;
        uint256 totalBuildings;

        bytes32[] storage keys = agentHexKeys[agentId];
        for (uint256 i = 0; i < keys.length; i++) {
            Hex storage h = hexes[keys[i]];
            if (h.ownerId == agentId) {
                totalOre += h.ore;
                totalBuildings += h.mineCount + h.arsenalCount;
            }
        }

        return hCount * 100 + totalOre + totalBuildings * 50;
    }

    // ══════════════════════════════════════════════════════════
    //                     VIEWS
    // ══════════════════════════════════════════════════════════

    function getHex(bytes32 hexKey_) external view returns (
        uint256 ownerId, uint256 locationId, int32 q, int32 r,
        uint256 mineCount, uint256 arsenalCount, uint256 ore, uint256 lastHarvest,
        uint256 reserve, uint256 happiness, uint256 happinessUpdatedAt
    ) {
        Hex storage h = hexes[hexKey_];
        return (h.ownerId, h.locationId, h.q, h.r, h.mineCount, h.arsenalCount, h.ore, h.lastHarvest, h.reserve, h.happiness, h.happinessUpdatedAt);
    }

    function getAgentHexKeys(uint256 agentId) external view returns (bytes32[] memory) {
        return agentHexKeys[agentId];
    }

    function getClaimCost(uint256 agentId) external view returns (uint256) {
        uint256 owned = hexCount[agentId];
        if (owned == 0) return 0;
        return 200 * (2 ** (owned - 1));
    }

    /// @notice Returns up to 18 claimable (empty) hexes adjacent to agent's territory
    function getClaimableHexes(uint256 agentId) external view returns (int32[] memory qs, int32[] memory rs) {
        bytes32[] storage keys = agentHexKeys[agentId];
        // Temp storage — max 6 neighbors per hex, deduplicated
        int32[] memory tq = new int32[](keys.length * 6);
        int32[] memory tr = new int32[](keys.length * 6);
        uint256 count;

        for (uint256 i = 0; i < keys.length; i++) {
            Hex storage h = hexes[keys[i]];
            if (h.ownerId != agentId) continue;
            for (uint256 d = 0; d < 6; d++) {
                (int32 nq, int32 nr) = _getNeighbor(h.q, h.r, d);
                if (!inBounds(nq, nr)) continue;
                if (hexes[toKey(nq, nr)].ownerId != 0) continue;
                // Deduplicate
                bool dup = false;
                for (uint256 j = 0; j < count; j++) {
                    if (tq[j] == nq && tr[j] == nr) { dup = true; break; }
                }
                if (!dup) { tq[count] = nq; tr[count] = nr; count++; }
            }
        }

        qs = new int32[](count);
        rs = new int32[](count);
        for (uint256 i = 0; i < count; i++) { qs[i] = tq[i]; rs[i] = tr[i]; }
    }

    // ══════════════════════════════════════════════════════════
    //                     RAID (composite attack)
    // ══════════════════════════════════════════════════════════

    /// @notice Move to target hex + attack in one transaction.
    ///         Finds the best source hex (most arsenals) automatically.
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

        Hex storage source = hexes[bestSource];

        // Harvest both
        _harvest(targetHexKey);
        _harvest(bestSource);

        // Check ore
        require(source.ore >= oreSpend, "insufficient ore");

        // Move agent to target location
        registry.moveAgent(agentId, target.locationId);

        // Cooldown
        uint256 lastAtk = attackCooldown[agentId][targetHexKey];
        require(lastAtk == 0 || block.timestamp >= lastAtk + ATTACK_COOLDOWN, "cooldown");

        // Consume resources
        source.arsenalCount -= arsenalSpend;
        source.ore -= oreSpend;

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
            _removeHexFromAgent(targetOwner, targetHexKey);
            hexCount[targetOwner]--;

            target.ownerId = agentId;
            target.ore = target.ore * CAPTURE_ORE_PCT / 100;
            target.happiness = MAX_HAPPINESS;
            target.happinessUpdatedAt = block.timestamp;

            agentHexKeys[agentId].push(targetHexKey);
            hexCount[agentId]++;

            emit HexCaptured(agentId, targetHexKey, targetOwner);
        } else {
            uint256 newHappy = target.happiness + DEFENSE_MORALE;
            target.happiness = newHappy > MAX_HAPPINESS ? MAX_HAPPINESS : newHappy;
        }

        attackCooldown[agentId][targetHexKey] = block.timestamp;
        emit AttackResult(agentId, targetHexKey, attackPower, defensePower, success);
    }

    // ══════════════════════════════════════════════════════════
    //                     INTERNALS
    // ══════════════════════════════════════════════════════════

    // Axial hex neighbor offsets (pointy-top)
    // (1,0), (1,-1), (0,-1), (-1,0), (-1,1), (0,1)
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

    /// @dev Spiral search from origin for an empty hex, within MAP_RADIUS
    function _findEmptyHex() internal view returns (int32 q, int32 r) {
        if (hexes[toKey(0, 0)].ownerId == 0) return (0, 0);

        for (int32 ring = 1; ring <= MAP_RADIUS; ring++) {
            q = -ring;
            r = ring;
            for (uint256 edge = 0; edge < 6; edge++) {
                for (int32 step = 0; step < ring; step++) {
                    if (inBounds(q, r) && hexes[toKey(q, r)].ownerId == 0) return (q, r);
                    (q, r) = _getNeighbor(q, r, edge);
                }
            }
        }
        revert("world full - no empty hex within boundary");
    }

    /// @dev Check if (q,r) is adjacent to any hex owned by agentId
    function _isAdjacentToOwned(uint256 agentId, int32 q, int32 r) internal view returns (bool) {
        for (uint256 i = 0; i < 6; i++) {
            (int32 nq, int32 nr) = _getNeighbor(q, r, i);
            if (hexes[toKey(nq, nr)].ownerId == agentId) return true;
        }
        return false;
    }

    /// @dev Remove a hex key from agent's hex list
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

    /// @dev int32 to string
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

    /// @dev Lazy happiness decay based on elapsed real time.
    ///      decay = elapsed10s × hexCount[owner]. Rebellion at 0.
    function _updateHappiness(bytes32 hexKey_) internal {
        Hex storage h = hexes[hexKey_];
        if (h.ownerId == 0) return;

        uint256 elapsed10s = (block.timestamp - h.happinessUpdatedAt) / 10;
        if (elapsed10s == 0) return;

        uint256 decay = elapsed10s * hexCount[h.ownerId];
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

    /// @notice View current happiness (computed, not stored snapshot).
    function currentHappiness(bytes32 hexKey_) external view returns (uint256) {
        Hex storage h = hexes[hexKey_];
        if (h.ownerId == 0) return 0;
        uint256 elapsed10s = (block.timestamp - h.happinessUpdatedAt) / 10;
        uint256 decay = elapsed10s * hexCount[h.ownerId];
        return h.happiness > decay ? h.happiness - decay : 0;
    }

    /// @notice Claim a neutral (rebelled) hex.
    ///         Homeless agents (0 hexes): free, no adjacency needed.
    ///         Landed agents: must be adjacent, costs ore from sourceHex.
    function claimNeutral(
        uint256 agentId,
        bytes32 hexKey_,
        bytes32 sourceHexKey
    ) external canControlAgent(agentId) {
        Hex storage h = hexes[hexKey_];
        require(h.ownerId == 0, "hex is owned");
        require(h.locationId != 0, "not a valid hex");

        uint256 owned = hexCount[agentId];

        if (owned > 0) {
            require(_isAdjacentToOwned(agentId, h.q, h.r), "must be adjacent to owned hex");
            require(hexes[sourceHexKey].ownerId == agentId, "not your source hex");
            _harvest(sourceHexKey);
            require(hexes[sourceHexKey].ore >= NEUTRAL_CLAIM_COST, "insufficient ore");
            hexes[sourceHexKey].ore -= NEUTRAL_CLAIM_COST;
        }
        // else: homeless agent claims for free, no adjacency required

        h.ownerId = agentId;
        h.happiness = MAX_HAPPINESS;
        h.happinessUpdatedAt = block.timestamp;

        agentHexKeys[agentId].push(hexKey_);
        hexCount[agentId] = owned + 1;

        registry.moveAgent(agentId, h.locationId);
        emit NeutralClaimed(agentId, hexKey_);
    }
}

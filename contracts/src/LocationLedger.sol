// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";
import "./RingLedger.sol";

/// @title LocationLedger — Per-location public bulletin board (replaces WorldState action logs)
/// @notice Each location has a ring buffer of 128 entries. Agents at the location can write. Anyone can read.
contract LocationLedger is Initializable, OwnableUpgradeable, UUPSUpgradeable, RingLedger {
    struct Location {
        string name;
        string description;
        int32 q;          // hex axial coordinate
        int32 r;          // hex axial coordinate
        bool exists;
    }

    AgentRegistry public registry;

    uint256 public constant CAPACITY = 128;

    uint256 public nextLocationId;
    mapping(uint256 => Location) public locations;
    uint256[] public allLocationIds;

    /// @notice Ring buffer per location
    mapping(uint256 => Entry[]) public boards;
    mapping(uint256 => uint256) public heads;
    mapping(uint256 => uint256) public totalWritten;

    uint256 public currentTick;

    event LocationCreated(uint256 indexed locationId, string name, int32 q, int32 r);
    event EntryWritten(uint256 indexed entryId, uint256 indexed locationId, uint256 indexed agentId);
    event Compacted(uint256 indexed locationId, uint256 freedSlots, uint256 summaryId);
    event TickAdvanced(uint256 newTick);

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

    function initialize(address _registry) public initializer {
        __Ownable_init(msg.sender);
        registry = AgentRegistry(_registry);
        nextLocationId = 1;
        _initLedger();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ──────────────────── Location management ────────────────────

    function createLocation(
        string calldata name,
        string calldata description,
        int32 q,
        int32 r
    ) external onlyOperatorOrOwner returns (uint256 locationId) {
        locationId = nextLocationId++;
        Location storage loc = locations[locationId];
        loc.name = name;
        loc.description = description;
        loc.q = q;
        loc.r = r;
        loc.exists = true;
        allLocationIds.push(locationId);
        emit LocationCreated(locationId, name, q, r);
    }

    function getLocation(uint256 locationId) external view returns (
        string memory name, string memory description, int32 q, int32 r
    ) {
        require(locations[locationId].exists, "location does not exist");
        Location storage loc = locations[locationId];
        return (loc.name, loc.description, loc.q, loc.r);
    }

    function getAllLocationIds() external view returns (uint256[] memory) {
        return allLocationIds;
    }

    /// @notice Get agents currently at a location
    function getAgentsAtLocation(uint256 locationId) external view returns (uint256[] memory) {
        uint256[] memory allIds = registry.getAllAgentIds();
        uint256 count = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            (, , , uint256 loc,) = registry.getAgent(allIds[i]);
            if (loc == locationId) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            (, , , uint256 loc,) = registry.getAgent(allIds[i]);
            if (loc == locationId) result[idx++] = allIds[i];
        }
        return result;
    }

    // ──────────────────── Write ────────────────────

    /// @notice Post to a location's board. Agent must be at this location.
    function write(
        uint256 agentId,
        uint8 importance,
        string calldata category,
        string calldata content,
        uint256[] calldata relatedAgents
    ) external canControlAgent(agentId) returns (uint256 entryId, uint256 used, uint256 capacity) {
        (, , , uint256 agentLoc,) = registry.getAgent(agentId);
        require(locations[agentLoc].exists, "invalid location");
        uint256 locationId = agentLoc;

        (entryId, heads[locationId], totalWritten[locationId]) = _writeEntry(
            boards[locationId], CAPACITY, heads[locationId], totalWritten[locationId],
            agentId, importance, category, content, relatedAgents
        );
        used = _usedSlots(totalWritten[locationId], CAPACITY);
        capacity = CAPACITY;
        emit EntryWritten(entryId, locationId, agentId);
    }

    // ──────────────────── Read ────────────────────

    function readRecent(uint256 locationId, uint256 count)
        external view returns (Entry[] memory entries, uint256 used, uint256 capacity)
    {
        (entries, used) = _readRecent(boards[locationId], CAPACITY, heads[locationId], totalWritten[locationId], count);
        capacity = CAPACITY;
    }

    // ──────────────────── Compact ────────────────────

    function compact(
        uint256 locationId,
        uint256 count,
        uint256 authorAgent,
        uint8 importance,
        string calldata category,
        string calldata summaryContent
    ) external canControlAgent(authorAgent) returns (uint256 summaryId, uint256 used, uint256 capacity) {
        require(locations[locationId].exists, "location does not exist");
        (summaryId, heads[locationId], totalWritten[locationId]) = _compact(
            boards[locationId], CAPACITY, heads[locationId], totalWritten[locationId],
            count, authorAgent, importance, category, summaryContent
        );
        used = _usedSlots(totalWritten[locationId], CAPACITY);
        capacity = CAPACITY;
        emit Compacted(locationId, count - 1, summaryId);
    }

    // ──────────────────── Tick ────────────────────

    function advanceTick() external onlyOperatorOrOwner {
        currentTick++;
        emit TickAdvanced(currentTick);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";

/// @title WorldState - Locations and action logging for Gravity Town (UUPS upgradeable, ring-buffer)
contract WorldState is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct Location {
        string name;
        string description;
        string[] availableActions;
        bool exists;
    }

    struct ActionLog {
        uint256 agentId;
        uint256 locationId;
        string action;
        string result;
        uint256 timestamp;
    }

    AgentRegistry public registry;

    uint256 public nextLocationId;
    mapping(uint256 => Location) public locations;
    uint256[] public allLocationIds;

    // ──── Ring-buffer action logs ────

    uint256 public constant MAX_LOGS_PER_LOCATION = 128;
    uint256 public constant MAX_GLOBAL_LOGS = 256;

    // Per-location ring buffer
    mapping(uint256 => ActionLog[MAX_LOGS_PER_LOCATION]) public locationLogs;
    mapping(uint256 => uint256) public locationLogHead;
    mapping(uint256 => uint256) public locationLogCount;

    // Global ring buffer
    ActionLog[MAX_GLOBAL_LOGS] public globalLog;
    uint256 public globalLogHead;
    uint256 public globalLogCount;

    uint256 public currentTick;

    event LocationCreated(uint256 indexed locationId, string name);
    event ActionPerformed(
        uint256 indexed agentId,
        uint256 indexed locationId,
        string action,
        string result,
        uint256 tick
    );
    event TickAdvanced(uint256 newTick);

    modifier onlyOperatorOrOwner() {
        require(
            msg.sender == registry.operator() || msg.sender == owner(),
            "not authorized"
        );
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _registry) public initializer {
        __Ownable_init(msg.sender);

        registry = AgentRegistry(_registry);
        nextLocationId = 1;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @notice Create a new location in the world
    function createLocation(
        string calldata name,
        string calldata description,
        string[] calldata availableActions
    ) external onlyOperatorOrOwner returns (uint256 locationId) {
        locationId = nextLocationId++;
        Location storage loc = locations[locationId];
        loc.name = name;
        loc.description = description;
        loc.exists = true;
        for (uint256 i = 0; i < availableActions.length; i++) {
            loc.availableActions.push(availableActions[i]);
        }
        allLocationIds.push(locationId);
        emit LocationCreated(locationId, name);
    }

    /// @notice Agent performs an action at their current location
    function performAction(
        uint256 agentId,
        string calldata action,
        string calldata result
    ) external onlyOperatorOrOwner {
        (, , , uint256 locationId, ,) = registry.getAgent(agentId);
        require(locations[locationId].exists, "invalid location");

        ActionLog memory log = ActionLog({
            agentId: agentId,
            locationId: locationId,
            action: action,
            result: result,
            timestamp: block.timestamp
        });

        // Write to per-location ring buffer
        uint256 locSlot = locationLogHead[locationId];
        locationLogs[locationId][locSlot] = log;
        locationLogHead[locationId] = (locSlot + 1) % MAX_LOGS_PER_LOCATION;
        if (locationLogCount[locationId] < MAX_LOGS_PER_LOCATION) {
            locationLogCount[locationId]++;
        }

        // Write to global ring buffer
        uint256 gSlot = globalLogHead;
        globalLog[gSlot] = log;
        globalLogHead = (gSlot + 1) % MAX_GLOBAL_LOGS;
        if (globalLogCount < MAX_GLOBAL_LOGS) {
            globalLogCount++;
        }

        emit ActionPerformed(agentId, locationId, action, result, currentTick);
    }

    /// @notice Get agents currently at a location
    function getAgentsAtLocation(uint256 locationId) external view returns (uint256[] memory) {
        uint256[] memory allIds = registry.getAllAgentIds();
        // First pass: count
        uint256 count = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            (, , , uint256 loc, ,) = registry.getAgent(allIds[i]);
            if (loc == locationId) count++;
        }
        // Second pass: collect
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allIds.length; i++) {
            (, , , uint256 loc, ,) = registry.getAgent(allIds[i]);
            if (loc == locationId) {
                result[idx++] = allIds[i];
            }
        }
        return result;
    }

    /// @notice Get recent actions at a location (most recent `count` entries, oldest first)
    function getRecentActions(uint256 locationId, uint256 count)
        external
        view
        returns (ActionLog[] memory)
    {
        uint256 used = locationLogCount[locationId];
        if (count > used) count = used;

        ActionLog[] memory result = new ActionLog[](count);
        uint256 head = locationLogHead[locationId];
        uint256 tail = (head + MAX_LOGS_PER_LOCATION - used) % MAX_LOGS_PER_LOCATION;
        uint256 start = used - count;

        for (uint256 i = 0; i < count; i++) {
            result[i] = locationLogs[locationId][(tail + start + i) % MAX_LOGS_PER_LOCATION];
        }
        return result;
    }

    /// @notice Get recent global actions (most recent `count` entries, oldest first)
    function getRecentGlobalActions(uint256 count) external view returns (ActionLog[] memory) {
        uint256 used = globalLogCount;
        if (count > used) count = used;

        ActionLog[] memory result = new ActionLog[](count);
        uint256 tail = (globalLogHead + MAX_GLOBAL_LOGS - used) % MAX_GLOBAL_LOGS;
        uint256 start = used - count;

        for (uint256 i = 0; i < count; i++) {
            result[i] = globalLog[(tail + start + i) % MAX_GLOBAL_LOGS];
        }
        return result;
    }

    /// @notice Get location info
    function getLocation(uint256 locationId) external view returns (
        string memory name,
        string memory description,
        string[] memory availableActions
    ) {
        require(locations[locationId].exists, "location does not exist");
        Location storage loc = locations[locationId];
        return (loc.name, loc.description, loc.availableActions);
    }

    /// @notice Get all location IDs
    function getAllLocationIds() external view returns (uint256[] memory) {
        return allLocationIds;
    }

    /// @notice Advance the world tick
    function advanceTick() external onlyOperatorOrOwner {
        currentTick++;
        emit TickAdvanced(currentTick);
    }
}

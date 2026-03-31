// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title AgentRegistry - AI Town Agent ownership and attributes (UUPS upgradeable)
/// @notice Each Agent is an on-chain entity with personality, stats, location, and gold balance
contract AgentRegistry is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct Agent {
        string name;
        string personality;
        uint8[4] stats; // [strength, wisdom, charisma, luck]
        uint256 location;
        uint256 gold;
        bool alive;
        uint256 createdAt;
    }

    address public operator; // MCP server address

    uint256 public nextAgentId;
    mapping(uint256 => Agent) public agents;
    mapping(uint256 => address) public agentOwner;
    uint256[] public allAgentIds;

    event AgentCreated(uint256 indexed agentId, string name, address indexed owner);
    event AgentMoved(uint256 indexed agentId, uint256 fromLocation, uint256 toLocation);
    event GoldTransferred(uint256 indexed fromAgent, uint256 indexed toAgent, uint256 amount);
    event StatsUpdated(uint256 indexed agentId, uint8[4] newStats);

    modifier onlyOperatorOrOwner() {
        require(msg.sender == operator || msg.sender == owner(), "not authorized");
        _;
    }

    modifier agentExists(uint256 agentId) {
        require(agents[agentId].alive, "agent does not exist");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _operator) public initializer {
        __Ownable_init(msg.sender);

        operator = _operator;
        nextAgentId = 1;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setOperator(address _operator) external onlyOwner {
        operator = _operator;
    }

    /// @notice Mint a new Agent
    function createAgent(
        string calldata name,
        string calldata personality,
        uint8[4] calldata stats,
        uint256 location,
        address agentOwnerAddr
    ) external onlyOperatorOrOwner returns (uint256 agentId) {
        agentId = nextAgentId++;
        agents[agentId] = Agent({
            name: name,
            personality: personality,
            stats: stats,
            location: location,
            gold: 100, // starting gold
            alive: true,
            createdAt: block.timestamp
        });
        agentOwner[agentId] = agentOwnerAddr;
        allAgentIds.push(agentId);
        emit AgentCreated(agentId, name, agentOwnerAddr);
    }

    /// @notice Get full agent data
    function getAgent(uint256 agentId) external view agentExists(agentId) returns (
        string memory name,
        string memory personality,
        uint8[4] memory stats,
        uint256 location,
        uint256 gold,
        uint256 createdAt
    ) {
        Agent storage a = agents[agentId];
        return (a.name, a.personality, a.stats, a.location, a.gold, a.createdAt);
    }

    /// @notice Move agent to a new location
    function moveAgent(uint256 agentId, uint256 toLocation) external onlyOperatorOrOwner agentExists(agentId) {
        uint256 from = agents[agentId].location;
        agents[agentId].location = toLocation;
        emit AgentMoved(agentId, from, toLocation);
    }

    /// @notice Transfer gold between agents
    function transferGold(uint256 fromAgent, uint256 toAgent, uint256 amount)
        external
        onlyOperatorOrOwner
        agentExists(fromAgent)
        agentExists(toAgent)
    {
        require(agents[fromAgent].gold >= amount, "insufficient gold");
        agents[fromAgent].gold -= amount;
        agents[toAgent].gold += amount;
        emit GoldTransferred(fromAgent, toAgent, amount);
    }

    /// @notice Add gold to an agent (reward from actions)
    function addGold(uint256 agentId, uint256 amount) external onlyOperatorOrOwner agentExists(agentId) {
        agents[agentId].gold += amount;
    }

    /// @notice Update agent stats
    function updateStats(uint256 agentId, uint8[4] calldata newStats)
        external
        onlyOperatorOrOwner
        agentExists(agentId)
    {
        agents[agentId].stats = newStats;
        emit StatsUpdated(agentId, newStats);
    }

    /// @notice Get total agent count
    function getAgentCount() external view returns (uint256) {
        return allAgentIds.length;
    }

    /// @notice List all agent IDs
    function getAllAgentIds() external view returns (uint256[] memory) {
        return allAgentIds;
    }
}

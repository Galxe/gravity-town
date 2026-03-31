// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title AgentRegistry - Gravity Town Agent ownership and attributes (UUPS upgradeable)
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

    address public operator; // legacy single operator (kept for storage layout)

    uint256 public nextAgentId;
    mapping(uint256 => Agent) public agents;
    mapping(uint256 => address) public agentOwner;
    uint256[] public allAgentIds;

    // --- V2 storage (appended for UUPS safety) ---
    mapping(address => bool) public operators;

    event AgentCreated(uint256 indexed agentId, string name, address indexed owner);
    event AgentRemoved(uint256 indexed agentId);
    event AgentMoved(uint256 indexed agentId, uint256 fromLocation, uint256 toLocation);
    event GoldTransferred(uint256 indexed fromAgent, uint256 indexed toAgent, uint256 amount);
    event StatsUpdated(uint256 indexed agentId, uint8[4] newStats);

    function _isOperator(address addr) internal view returns (bool) {
        return addr == operator || operators[addr] || addr == owner();
    }

    modifier onlyOperatorOrOwner() {
        require(_isOperator(msg.sender), "not authorized");
        _;
    }

    modifier canControlAgent(uint256 agentId) {
        require(
            _isOperator(msg.sender) || msg.sender == agentOwner[agentId],
            "not authorized"
        );
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

    function addOperator(address _operator) external onlyOwner {
        operators[_operator] = true;
    }

    function removeOperator(address _operator) external onlyOwner {
        operators[_operator] = false;
    }

    /// @notice Mint a new Agent
    function createAgent(
        string calldata name,
        string calldata personality,
        uint8[4] calldata stats,
        uint256 location,
        address agentOwnerAddr
    ) external returns (uint256 agentId) {
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

    /// @notice Remove an agent (owner of the agent, operator, or contract owner)
    function removeAgent(uint256 agentId) external canControlAgent(agentId) agentExists(agentId) {
        agents[agentId].alive = false;
        // Remove from allAgentIds array
        for (uint256 i = 0; i < allAgentIds.length; i++) {
            if (allAgentIds[i] == agentId) {
                allAgentIds[i] = allAgentIds[allAgentIds.length - 1];
                allAgentIds.pop();
                break;
            }
        }
        emit AgentRemoved(agentId);
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
    function moveAgent(uint256 agentId, uint256 toLocation) external canControlAgent(agentId) agentExists(agentId) {
        uint256 from = agents[agentId].location;
        agents[agentId].location = toLocation;
        emit AgentMoved(agentId, from, toLocation);
    }

    /// @notice Transfer gold between agents
    function transferGold(uint256 fromAgent, uint256 toAgent, uint256 amount)
        external
        canControlAgent(fromAgent)
        agentExists(fromAgent)
        agentExists(toAgent)
    {
        require(agents[fromAgent].gold >= amount, "insufficient gold");
        agents[fromAgent].gold -= amount;
        agents[toAgent].gold += amount;
        emit GoldTransferred(fromAgent, toAgent, amount);
    }

    /// @notice Add gold to an agent (reward from actions)
    function addGold(uint256 agentId, uint256 amount) external canControlAgent(agentId) agentExists(agentId) {
        agents[agentId].gold += amount;
    }

    /// @notice Update agent stats
    function updateStats(uint256 agentId, uint8[4] calldata newStats)
        external
        canControlAgent(agentId)
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

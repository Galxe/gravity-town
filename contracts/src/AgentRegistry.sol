// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title AgentRegistry — Agent identity and location (no resources — those live on hexes)
contract AgentRegistry is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct Agent {
        string   name;
        string   personality;
        uint8[4] stats;       // [strength, wisdom, charisma, luck]
        uint256  location;    // current LocationLedger location ID
        bool     alive;
        uint256  createdAt;
    }

    address public operator;
    uint256 public nextAgentId;
    mapping(uint256 => Agent) internal _agents;
    mapping(uint256 => address) public agentOwner;
    uint256[] public allAgentIds;
    mapping(address => bool) public operators;

    event AgentCreated(uint256 indexed agentId, string name, address indexed owner);
    event AgentRemoved(uint256 indexed agentId);
    event AgentMoved(uint256 indexed agentId, uint256 fromLocation, uint256 toLocation);

    function _isOperator(address addr) internal view returns (bool) {
        return addr == operator || operators[addr] || addr == owner();
    }

    modifier onlyOperatorOrOwner() {
        require(_isOperator(msg.sender), "not authorized");
        _;
    }

    modifier canControlAgent(uint256 agentId) {
        require(_isOperator(msg.sender) || msg.sender == agentOwner[agentId], "not authorized");
        _;
    }

    modifier agentExists(uint256 agentId) {
        require(_agents[agentId].alive, "agent does not exist");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _operator) public initializer {
        __Ownable_init(msg.sender);
        operator = _operator;
        nextAgentId = 1;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setOperator(address _op) external onlyOwner { operator = _op; }
    function addOperator(address _op) external onlyOwner { operators[_op] = true; }
    function removeOperator(address _op) external onlyOwner { operators[_op] = false; }

    function createAgent(
        string calldata name,
        string calldata personality,
        uint8[4] calldata stats,
        uint256 location,
        address ownerAddr
    ) external returns (uint256 agentId) {
        agentId = nextAgentId++;
        Agent storage a = _agents[agentId];
        a.name = name;
        a.personality = personality;
        a.stats = stats;
        a.location = location;
        a.alive = true;
        a.createdAt = block.timestamp;
        agentOwner[agentId] = ownerAddr;
        allAgentIds.push(agentId);
        emit AgentCreated(agentId, name, ownerAddr);
    }

    function removeAgent(uint256 agentId) external canControlAgent(agentId) agentExists(agentId) {
        _agents[agentId].alive = false;
        for (uint256 i = 0; i < allAgentIds.length; i++) {
            if (allAgentIds[i] == agentId) {
                allAgentIds[i] = allAgentIds[allAgentIds.length - 1];
                allAgentIds.pop();
                break;
            }
        }
        emit AgentRemoved(agentId);
    }

    function getAgent(uint256 agentId) external view agentExists(agentId) returns (
        string memory name,
        string memory personality,
        uint8[4] memory stats,
        uint256 location,
        uint256 createdAt
    ) {
        Agent storage a = _agents[agentId];
        return (a.name, a.personality, a.stats, a.location, a.createdAt);
    }

    function isAlive(uint256 agentId) external view returns (bool) {
        return _agents[agentId].alive;
    }

    function moveAgent(uint256 agentId, uint256 toLocation) external canControlAgent(agentId) agentExists(agentId) {
        uint256 from = _agents[agentId].location;
        _agents[agentId].location = toLocation;
        emit AgentMoved(agentId, from, toLocation);
    }

    function getAgentCount() external view returns (uint256) { return allAgentIds.length; }
    function getAllAgentIds() external view returns (uint256[] memory) { return allAgentIds; }

    function updateStats(uint256 agentId, uint8[4] calldata newStats)
        external canControlAgent(agentId) agentExists(agentId)
    {
        _agents[agentId].stats = newStats;
    }
}

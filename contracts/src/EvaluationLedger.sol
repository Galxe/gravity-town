// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";
import "./RingLedger.sol";

/// @title EvaluationLedger — Per-agent evaluation board (chronicles/reviews written by others)
/// @notice Each agent has a ring buffer of 64 entries. Only operators (GameEngine) can write.
contract EvaluationLedger is Initializable, OwnableUpgradeable, UUPSUpgradeable, RingLedger {
    AgentRegistry public registry;

    uint256 public constant CAPACITY = 64;

    /// @notice Ring buffer per agent
    mapping(uint256 => Entry[]) public boards;
    mapping(uint256 => uint256) public heads;
    mapping(uint256 => uint256) public totalWritten;

    event EntryWritten(uint256 indexed entryId, uint256 indexed targetAgentId, uint256 indexed authorAgentId);
    event Compacted(uint256 indexed agentId, uint256 freedSlots, uint256 summaryId);

    function _isOperator(address addr) internal view returns (bool) {
        return addr == registry.operator() || registry.operators(addr) || addr == owner();
    }

    modifier onlyOperatorOrOwner() {
        require(_isOperator(msg.sender), "not authorized");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _registry) public initializer {
        __Ownable_init(msg.sender);
        registry = AgentRegistry(_registry);
        _initLedger();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ──────────────────── Write ────────────────────

    /// @notice Write an evaluation about a target agent. Only callable by operators (GameEngine).
    function write(
        uint256 targetAgentId,
        uint256 authorAgentId,
        uint8 importance,
        string calldata category,
        string calldata content,
        uint256[] calldata relatedAgents
    ) external onlyOperatorOrOwner returns (uint256 entryId, uint256 used, uint256 capacity) {
        (entryId, heads[targetAgentId], totalWritten[targetAgentId]) = _writeEntry(
            boards[targetAgentId], CAPACITY, heads[targetAgentId], totalWritten[targetAgentId],
            authorAgentId, importance, category, content, relatedAgents
        );
        used = _usedSlots(totalWritten[targetAgentId], CAPACITY);
        capacity = CAPACITY;
        emit EntryWritten(entryId, targetAgentId, authorAgentId);
    }

    // ──────────────────── Read ────────────────────

    function readRecent(uint256 agentId, uint256 count)
        external view returns (Entry[] memory entries, uint256 used, uint256 capacity)
    {
        (entries, used) = _readRecent(boards[agentId], CAPACITY, heads[agentId], totalWritten[agentId], count);
        capacity = CAPACITY;
    }

    // ──────────────────── Compact ────────────────────

    function compact(
        uint256 agentId,
        uint256 count,
        uint256 authorAgent,
        uint8 importance,
        string calldata category,
        string calldata summaryContent
    ) external onlyOperatorOrOwner returns (uint256 summaryId, uint256 used, uint256 capacity) {
        (summaryId, heads[agentId], totalWritten[agentId]) = _compact(
            boards[agentId], CAPACITY, heads[agentId], totalWritten[agentId],
            count, authorAgent, importance, category, summaryContent
        );
        used = _usedSlots(totalWritten[agentId], CAPACITY);
        capacity = CAPACITY;
        emit Compacted(agentId, count - 1, summaryId);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";
import "./RingLedger.sol";

/// @title AgentLedger — Per-agent memory board (replaces MemoryLedger)
/// @notice Each agent has a ring buffer of 64 entries. Self-write, self-read, with compaction.
contract AgentLedger is Initializable, OwnableUpgradeable, UUPSUpgradeable, RingLedger {
    AgentRegistry public registry;

    uint256 public constant CAPACITY = 64;

    /// @notice Ring buffer per agent
    mapping(uint256 => Entry[]) public boards;
    mapping(uint256 => uint256) public heads;
    mapping(uint256 => uint256) public totalWritten;

    event EntryWritten(uint256 indexed entryId, uint256 indexed agentId);
    event Compacted(uint256 indexed agentId, uint256 freedSlots, uint256 summaryId);

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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address _registry) public initializer {
        __Ownable_init(msg.sender);
        registry = AgentRegistry(_registry);
        _initLedger();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ──────────────────── Write ────────────────────

    function write(
        uint256 agentId,
        uint8 importance,
        string calldata category,
        string calldata content,
        uint256[] calldata relatedAgents
    ) external canControlAgent(agentId) returns (uint256 entryId, uint256 used, uint256 capacity) {
        (entryId, heads[agentId], totalWritten[agentId]) = _writeEntry(
            boards[agentId], CAPACITY, heads[agentId], totalWritten[agentId],
            agentId, importance, category, content, relatedAgents
        );
        used = _usedSlots(totalWritten[agentId], CAPACITY);
        capacity = CAPACITY;
        emit EntryWritten(entryId, agentId);
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
        uint8 importance,
        string calldata category,
        string calldata summaryContent
    ) external canControlAgent(agentId) returns (uint256 summaryId, uint256 used, uint256 capacity) {
        (summaryId, heads[agentId], totalWritten[agentId]) = _compact(
            boards[agentId], CAPACITY, heads[agentId], totalWritten[agentId],
            count, agentId, importance, category, summaryContent
        );
        used = _usedSlots(totalWritten[agentId], CAPACITY);
        capacity = CAPACITY;
        emit Compacted(agentId, count - 1, summaryId);
    }
}

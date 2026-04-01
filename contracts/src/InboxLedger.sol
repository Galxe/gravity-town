// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";
import "./RingLedger.sol";

/// @title InboxLedger — Per-agent inbox for direct messages (replaces MessageBoard)
/// @notice Each agent has a ring buffer of 64 entries. Any agent can write (send). Recipient reads.
contract InboxLedger is Initializable, OwnableUpgradeable, UUPSUpgradeable, RingLedger {
    AgentRegistry public registry;

    uint256 public constant CAPACITY = 64;

    /// @notice Inbox ring buffer per agent (keyed by recipient agentId)
    mapping(uint256 => Entry[]) public boards;
    mapping(uint256 => uint256) public heads;
    mapping(uint256 => uint256) public totalWritten;

    event EntryWritten(uint256 indexed entryId, uint256 indexed fromAgent, uint256 indexed toAgent);
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

    // ──────────────────── Write (send message) ────────────────────

    /// @notice Send a message to another agent's inbox. Cross-location OK.
    function write(
        uint256 fromAgent,
        uint256 toAgent,
        uint8 importance,
        string calldata category,
        string calldata content,
        uint256[] calldata relatedAgents
    ) external canControlAgent(fromAgent) returns (uint256 entryId, uint256 used, uint256 capacity) {
        require(fromAgent != toAgent, "cannot message self");

        (entryId, heads[toAgent], totalWritten[toAgent]) = _writeEntry(
            boards[toAgent], CAPACITY, heads[toAgent], totalWritten[toAgent],
            fromAgent, importance, category, content, relatedAgents
        );
        used = _usedSlots(totalWritten[toAgent], CAPACITY);
        capacity = CAPACITY;
        emit EntryWritten(entryId, fromAgent, toAgent);
    }

    // ──────────────────── Read ────────────────────

    function readRecent(uint256 agentId, uint256 count)
        external view returns (Entry[] memory entries, uint256 used, uint256 capacity)
    {
        (entries, used) = _readRecent(boards[agentId], CAPACITY, heads[agentId], totalWritten[agentId], count);
        capacity = CAPACITY;
    }

    /// @notice Get messages from a specific sender in an agent's inbox
    function readFrom(uint256 agentId, uint256 fromAgentId)
        external view returns (Entry[] memory)
    {
        uint256 used = _usedSlots(totalWritten[agentId], CAPACITY);
        uint256 tail = (heads[agentId] + CAPACITY - used) % CAPACITY;

        uint256 matchCount = 0;
        for (uint256 i = 0; i < used; i++) {
            if (boards[agentId][(tail + i) % CAPACITY].authorAgent == fromAgentId) {
                matchCount++;
            }
        }

        Entry[] memory result = new Entry[](matchCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < used; i++) {
            uint256 slot = (tail + i) % CAPACITY;
            if (boards[agentId][slot].authorAgent == fromAgentId) {
                result[idx++] = boards[agentId][slot];
            }
        }
        return result;
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

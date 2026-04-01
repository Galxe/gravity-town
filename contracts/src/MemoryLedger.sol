// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./AgentRegistry.sol";

/// @title MemoryLedger - On-chain long-term memory for AI Agents (UUPS upgradeable, ring-buffer)
/// @notice Each agent has a fixed-capacity ring buffer. When full, the oldest slot is overwritten.
///         An explicit `compressMemories` function lets the AI runner merge N oldest memories into one summary.
contract MemoryLedger is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct Memory {
        uint256 id;            // 0 = empty slot
        uint256 agentId;
        uint256 timestamp;
        uint8 importance;      // 1-10
        string category;       // "social" / "discovery" / "trade" / "event" / "reflection"
        string content;        // memory summary text
        uint256[] relatedAgents;
    }

    AgentRegistry public registry;

    /// @notice Max memories each agent can hold on-chain (ring buffer capacity)
    uint256 public constant MAX_MEMORIES_PER_AGENT = 64;

    /// @notice Global auto-increment memory ID
    uint256 public nextMemoryId;

    /// @notice Ring buffer storage: agentId => fixed-length array
    mapping(uint256 => Memory[MAX_MEMORIES_PER_AGENT]) public agentMemories;

    /// @notice Write head per agent (next slot to write into)
    mapping(uint256 => uint256) public writeHead;

    /// @notice Total memories ever written per agent (used to derive readable count)
    mapping(uint256 => uint256) public totalWritten;

    /// @notice Shared memory index: keccak256(min(a,b), max(a,b)) => memoryId[]
    mapping(bytes32 => uint256[]) public sharedMemoryIndex;

    event MemoryAdded(
        uint256 indexed memoryId,
        uint256 indexed agentId,
        uint8 importance,
        string category
    );
    event MemoriesCompressed(
        uint256 indexed agentId,
        uint256 freedSlots,
        uint256 summaryMemoryId
    );

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
    constructor() {
        _disableInitializers();
    }

    function initialize(address _registry) public initializer {
        __Ownable_init(msg.sender);

        registry = AgentRegistry(_registry);
        nextMemoryId = 1;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ──────────────────── Write ────────────────────

    /// @notice Add a memory to an agent's ring buffer
    function addMemory(
        uint256 agentId,
        uint8 importance,
        string calldata category,
        string calldata content,
        uint256[] calldata relatedAgents
    ) external canControlAgent(agentId) returns (uint256 memoryId) {
        require(importance >= 1 && importance <= 10, "importance must be 1-10");

        memoryId = nextMemoryId++;

        uint256 slot = writeHead[agentId];
        agentMemories[agentId][slot] = Memory({
            id: memoryId,
            agentId: agentId,
            timestamp: block.timestamp,
            importance: importance,
            category: category,
            content: content,
            relatedAgents: relatedAgents
        });

        writeHead[agentId] = (slot + 1) % MAX_MEMORIES_PER_AGENT;
        totalWritten[agentId]++;

        // Index shared memories
        for (uint256 i = 0; i < relatedAgents.length; i++) {
            bytes32 key = _pairKey(agentId, relatedAgents[i]);
            sharedMemoryIndex[key].push(memoryId);
        }

        emit MemoryAdded(memoryId, agentId, importance, category);
    }

    /// @notice Compress the N oldest memories into a single summary, freeing N-1 slots.
    function compressMemories(
        uint256 agentId,
        uint256 count,
        string calldata summaryContent,
        uint8 importance,
        string calldata category
    ) external canControlAgent(agentId) returns (uint256 summaryMemoryId) {
        require(count >= 2, "must compress at least 2");
        require(importance >= 1 && importance <= 10, "importance must be 1-10");

        uint256 used = _usedSlots(agentId);
        require(count <= used, "not enough memories");

        uint256 tail = _tailIndex(agentId);

        uint256[] memory allRelated = new uint256[](0);

        // Clear the oldest `count` slots
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = (tail + i) % MAX_MEMORIES_PER_AGENT;
            delete agentMemories[agentId][idx];
        }

        // Write summary into the tail slot
        summaryMemoryId = nextMemoryId++;
        agentMemories[agentId][tail] = Memory({
            id: summaryMemoryId,
            agentId: agentId,
            timestamp: block.timestamp,
            importance: importance,
            category: category,
            content: summaryContent,
            relatedAgents: allRelated
        });

        // Adjust totalWritten
        if (totalWritten[agentId] >= MAX_MEMORIES_PER_AGENT) {
            totalWritten[agentId] = MAX_MEMORIES_PER_AGENT - (count - 1);
        } else {
            totalWritten[agentId] -= (count - 1);
        }

        // Compact: shift uncompressed memories left
        uint256 uncompressed = used - count;
        for (uint256 i = 0; i < uncompressed; i++) {
            uint256 src = (tail + count + i) % MAX_MEMORIES_PER_AGENT;
            uint256 dst = (tail + 1 + i) % MAX_MEMORIES_PER_AGENT;
            if (src != dst) {
                agentMemories[agentId][dst] = agentMemories[agentId][src];
                delete agentMemories[agentId][src];
            }
        }

        writeHead[agentId] = (tail + 1 + uncompressed) % MAX_MEMORIES_PER_AGENT;

        emit MemoriesCompressed(agentId, count - 1, summaryMemoryId);
    }

    // ──────────────────── Read ────────────────────

    function memoryCount(uint256 agentId) external view returns (uint256) {
        return _usedSlots(agentId);
    }

    function memoryCapacity() external pure returns (uint256) {
        return MAX_MEMORIES_PER_AGENT;
    }

    function getRecentMemories(uint256 agentId, uint256 count)
        external
        view
        returns (Memory[] memory)
    {
        uint256 used = _usedSlots(agentId);
        if (count > used) count = used;

        Memory[] memory result = new Memory[](count);
        uint256 tail = _tailIndex(agentId);
        uint256 start = used - count;
        for (uint256 i = 0; i < count; i++) {
            result[i] = agentMemories[agentId][(tail + start + i) % MAX_MEMORIES_PER_AGENT];
        }
        return result;
    }

    function getImportantMemories(uint256 agentId, uint8 minImportance)
        external
        view
        returns (Memory[] memory)
    {
        uint256 used = _usedSlots(agentId);
        uint256 tail = _tailIndex(agentId);

        uint256 matchCount = 0;
        for (uint256 i = 0; i < used; i++) {
            if (agentMemories[agentId][(tail + i) % MAX_MEMORIES_PER_AGENT].importance >= minImportance) {
                matchCount++;
            }
        }

        Memory[] memory result = new Memory[](matchCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < used; i++) {
            uint256 slot = (tail + i) % MAX_MEMORIES_PER_AGENT;
            if (agentMemories[agentId][slot].importance >= minImportance) {
                result[idx++] = agentMemories[agentId][slot];
            }
        }
        return result;
    }

    function getMemoriesByCategory(uint256 agentId, string calldata category)
        external
        view
        returns (Memory[] memory)
    {
        uint256 used = _usedSlots(agentId);
        uint256 tail = _tailIndex(agentId);

        uint256 matchCount = 0;
        for (uint256 i = 0; i < used; i++) {
            if (_strEq(agentMemories[agentId][(tail + i) % MAX_MEMORIES_PER_AGENT].category, category)) {
                matchCount++;
            }
        }

        Memory[] memory result = new Memory[](matchCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < used; i++) {
            uint256 slot = (tail + i) % MAX_MEMORIES_PER_AGENT;
            if (_strEq(agentMemories[agentId][slot].category, category)) {
                result[idx++] = agentMemories[agentId][slot];
            }
        }
        return result;
    }

    function getSharedMemories(uint256 agentA, uint256 agentB)
        external
        view
        returns (Memory[] memory)
    {
        bytes32 key = _pairKey(agentA, agentB);
        uint256[] storage memIds = sharedMemoryIndex[key];

        uint256 validCount = 0;
        for (uint256 i = 0; i < memIds.length; i++) {
            if (_memoryExists(agentA, memIds[i]) || _memoryExists(agentB, memIds[i])) {
                validCount++;
            }
        }

        Memory[] memory result = new Memory[](validCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < memIds.length; i++) {
            Memory memory m = _findMemoryById(agentA, agentB, memIds[i]);
            if (m.id != 0) {
                result[idx++] = m;
            }
        }
        return result;
    }

    function getMemories(uint256 agentId, uint256 offset, uint256 limit)
        external
        view
        returns (Memory[] memory)
    {
        uint256 used = _usedSlots(agentId);
        if (offset >= used) return new Memory[](0);

        uint256 end = offset + limit;
        if (end > used) end = used;
        uint256 count = end - offset;
        uint256 tail = _tailIndex(agentId);

        Memory[] memory result = new Memory[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = agentMemories[agentId][(tail + offset + i) % MAX_MEMORIES_PER_AGENT];
        }
        return result;
    }

    // ──────────────────── Internal helpers ────────────────────

    function _usedSlots(uint256 agentId) internal view returns (uint256) {
        uint256 tw = totalWritten[agentId];
        return tw < MAX_MEMORIES_PER_AGENT ? tw : MAX_MEMORIES_PER_AGENT;
    }

    function _tailIndex(uint256 agentId) internal view returns (uint256) {
        uint256 used = _usedSlots(agentId);
        return (writeHead[agentId] + MAX_MEMORIES_PER_AGENT - used) % MAX_MEMORIES_PER_AGENT;
    }

    function _pairKey(uint256 a, uint256 b) internal pure returns (bytes32) {
        (uint256 lo, uint256 hi) = a < b ? (a, b) : (b, a);
        return keccak256(abi.encodePacked(lo, hi));
    }

    function _strEq(string storage a, string calldata b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    function _memoryExists(uint256 agentId, uint256 memId) internal view returns (bool) {
        uint256 used = _usedSlots(agentId);
        uint256 tail = _tailIndex(agentId);
        for (uint256 i = 0; i < used; i++) {
            if (agentMemories[agentId][(tail + i) % MAX_MEMORIES_PER_AGENT].id == memId) {
                return true;
            }
        }
        return false;
    }

    function _findMemoryById(uint256 agentA, uint256 agentB, uint256 memId)
        internal
        view
        returns (Memory memory)
    {
        uint256 usedA = _usedSlots(agentA);
        uint256 tailA = _tailIndex(agentA);
        for (uint256 i = 0; i < usedA; i++) {
            Memory storage m = agentMemories[agentA][(tailA + i) % MAX_MEMORIES_PER_AGENT];
            if (m.id == memId) return m;
        }
        uint256 usedB = _usedSlots(agentB);
        uint256 tailB = _tailIndex(agentB);
        for (uint256 i = 0; i < usedB; i++) {
            Memory storage m = agentMemories[agentB][(tailB + i) % MAX_MEMORIES_PER_AGENT];
            if (m.id == memId) return m;
        }
        Memory memory empty;
        return empty;
    }
}

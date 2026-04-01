// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RingLedger — Abstract ring-buffer ledger with compaction
/// @notice Shared base for AgentLedger, LocationLedger, InboxLedger.
///         Subclasses define the scope key type and access control.
abstract contract RingLedger {
    struct Entry {
        uint256 id;              // global auto-increment, 0 = empty slot
        uint256 authorAgent;     // who wrote this
        uint256 blockNumber;
        uint256 timestamp;
        uint8   importance;      // 1-10
        string  category;        // "chat","action","trade","summary","reflection", etc.
        string  content;
        uint256[] relatedAgents;
    }

    struct ReadResult {
        uint256 used;
        uint256 capacity;
    }

    /// @notice Global auto-increment entry ID (shared across all boards)
    uint256 public nextEntryId;

    /// @dev Initialize nextEntryId (called by subclass initializer)
    function _initLedger() internal {
        nextEntryId = 1;
    }

    // ──────────────────── Ring buffer internals ────────────────────

    /// @dev Write an entry into a ring buffer. Returns the entry ID and usage.
    function _writeEntry(
        Entry[] storage buffer,
        uint256 capacity,
        uint256 head,
        uint256 totalWritten,
        uint256 authorAgent,
        uint8 importance,
        string calldata category,
        string calldata content,
        uint256[] calldata relatedAgents
    ) internal returns (uint256 entryId, uint256 newHead, uint256 newTotalWritten) {
        require(importance >= 1 && importance <= 10, "importance must be 1-10");

        entryId = nextEntryId++;

        // Ensure buffer has enough slots allocated
        while (buffer.length < capacity) {
            buffer.push();
        }

        uint256 slot = head % capacity;
        Entry storage e = buffer[slot];
        e.id = entryId;
        e.authorAgent = authorAgent;
        e.blockNumber = block.number;
        e.timestamp = block.timestamp;
        e.importance = importance;
        e.category = category;
        e.content = content;
        delete e.relatedAgents;
        for (uint256 i = 0; i < relatedAgents.length; i++) {
            e.relatedAgents.push(relatedAgents[i]);
        }

        newHead = (head + 1) % capacity;
        newTotalWritten = totalWritten + 1;
    }

    /// @dev Read the most recent `count` entries from a ring buffer.
    function _readRecent(
        Entry[] storage buffer,
        uint256 capacity,
        uint256 head,
        uint256 totalWritten,
        uint256 count
    ) internal view returns (Entry[] memory entries, uint256 used) {
        used = totalWritten < capacity ? totalWritten : capacity;
        if (count > used) count = used;

        entries = new Entry[](count);
        uint256 tail = (head + capacity - used) % capacity;
        uint256 start = used - count;
        for (uint256 i = 0; i < count; i++) {
            entries[i] = buffer[(tail + start + i) % capacity];
        }
    }

    /// @dev Compact the oldest `count` entries into a single summary.
    ///      Frees count-1 slots. Returns the summary entry ID.
    function _compact(
        Entry[] storage buffer,
        uint256 capacity,
        uint256 head,
        uint256 totalWritten,
        uint256 count,
        uint256 authorAgent,
        uint8 importance,
        string calldata category,
        string calldata summaryContent
    ) internal returns (uint256 summaryId, uint256 newHead, uint256 newTotalWritten) {
        require(count >= 2, "must compact at least 2");
        require(importance >= 1 && importance <= 10, "importance must be 1-10");

        uint256 used = totalWritten < capacity ? totalWritten : capacity;
        require(count <= used, "not enough entries");

        uint256 tail = (head + capacity - used) % capacity;

        // Clear oldest `count` slots
        for (uint256 i = 0; i < count; i++) {
            uint256 idx = (tail + i) % capacity;
            delete buffer[idx];
        }

        // Write summary into the tail slot
        summaryId = nextEntryId++;
        Entry storage summary = buffer[tail];
        summary.id = summaryId;
        summary.authorAgent = authorAgent;
        summary.blockNumber = block.number;
        summary.timestamp = block.timestamp;
        summary.importance = importance;
        summary.category = category;
        summary.content = summaryContent;
        delete summary.relatedAgents;

        // Shift uncompacted entries left
        uint256 remaining = used - count;
        for (uint256 i = 0; i < remaining; i++) {
            uint256 src = (tail + count + i) % capacity;
            uint256 dst = (tail + 1 + i) % capacity;
            if (src != dst) {
                buffer[dst] = buffer[src];
                delete buffer[src];
            }
        }

        newHead = (tail + 1 + remaining) % capacity;

        if (totalWritten >= capacity) {
            newTotalWritten = capacity - (count - 1);
        } else {
            newTotalWritten = totalWritten - (count - 1);
        }
    }

    /// @dev Compute used slots
    function _usedSlots(uint256 totalWritten, uint256 capacity) internal pure returns (uint256) {
        return totalWritten < capacity ? totalWritten : capacity;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AbilityLib.sol";
import "./UnitCatalog.sol";

/// @title ArenaCombat — deterministic ghost-autobattler combat, as an external
///        linked library.
/// @notice Extracted from ArenaEngine purely to keep that contract under the
///         EIP-170 24,576-byte code-size limit. The combat machinery (this + the
///         inlined AbilityLib event queue + UnitCatalog) deploys here once and is
///         reached via DELEGATECALL, so its bytecode is NOT counted against
///         ArenaEngine. Logic is a verbatim move — behavior is unchanged and the
///         determinism tests pin it.
/// @dev Public functions are deployed (separately) and linked; internal helpers
///      inline within this library. ArenaEngine calls `simulate` once per settle
///      and `simulateWithTrace` / `initialStats` once per view — one DELEGATECALL
///      each, NOT per combat turn, so gas overhead is negligible.
library ArenaCombat {
    uint8 internal constant SLOTS = 5;

    /// @dev One side's combat snapshot (bench + persistent buy/sell stat overlays).
    struct Side {
        uint8[SLOTS] bench;
        int16[SLOTS] atkOverride;
        int16[SLOTS] hpOverride;
    }

    /// @dev A single attack action in the deterministic trace.
    struct Turn {
        uint8  attackerSide;   // 0 = match's attacker (left) side, 1 = defender (right)
        uint8  attackerSlot;
        uint8  defenderSlot;
        uint16 damage;
        bool   defenderDied;
    }

    // ──────────────────── Public entry points (deployed + linked) ────────────────────

    /// @notice Winner-only simulation used by settlement — skips the trace buffer.
    function simulate(
        Side memory left,
        Side memory right,
        uint256 seed,
        uint256 leftAgentId,
        uint256 rightAgentId
    ) public pure returns (uint256 winnerAgentId) {
        AbilityLib.BattleState memory state = _buildBattleState(left, right, seed);
        Turn[] memory nullBuf; // length 0 — _runCombat skips writes
        (winnerAgentId, ) = _runCombat(state, leftAgentId, rightAgentId, seed, nullBuf);
    }

    /// @notice Full turn-by-turn replay + winner. View-only; for frontends/replays.
    function simulateWithTrace(
        Side memory left,
        Side memory right,
        uint256 seed,
        uint256 leftAgentId,
        uint256 rightAgentId
    ) public pure returns (Turn[] memory turns, uint256 winnerAgentId) {
        AbilityLib.BattleState memory state = _buildBattleState(left, right, seed);
        Turn[] memory buf = new Turn[](128);
        uint256 turnCount;
        (winnerAgentId, turnCount) = _runCombat(state, leftAgentId, rightAgentId, seed, buf);
        turns = new Turn[](turnCount);
        for (uint256 i = 0; i < turnCount; i++) turns[i] = buf[i];
    }

    /// @notice Per-slot ATK/HP after buy/sell overlays AND all ON_START abilities
    ///         resolve — the true starting stats the trace runs on.
    function initialStats(Side memory left, Side memory right, uint256 seed)
        public
        pure
        returns (
            uint16[SLOTS] memory leftAtk,
            uint16[SLOTS] memory leftHp,
            uint16[SLOTS] memory rightAtk,
            uint16[SLOTS] memory rightHp
        )
    {
        AbilityLib.BattleState memory state = _buildBattleState(left, right, seed);
        state = AbilityLib.triggerAllOnStart(state);
        for (uint8 i = 0; i < SLOTS; i++) {
            leftAtk[i]  = state.left[i].atk;
            leftHp[i]   = state.left[i].hp;
            rightAtk[i] = state.right[i].atk;
            rightHp[i]  = state.right[i].hp;
        }
    }

    /// @notice Symmetric ELO update (K=32, bounded linear expected-score approx).
    ///         Winner gains the same delta the loser drops. Pinned by tests.
    function eloUpdate(uint16 winnerElo, uint16 loserElo)
        public
        pure
        returns (uint16 newWinner, uint16 newLoser)
    {
        int256 diff = int256(uint256(winnerElo)) - int256(uint256(loserElo));
        if (diff > 400) diff = 400;
        if (diff < -400) diff = -400;
        // expectedWin ≈ 0.5 + diff/800. delta = K*(1-expectedWin) = 16 - diff/25.
        int256 deltaW = 16 - diff / 25;
        if (deltaW < 1) deltaW = 1;
        if (deltaW > 31) deltaW = 31;

        int256 deltaL = deltaW; // symmetric

        int256 nw = int256(uint256(winnerElo)) + deltaW;
        int256 nl = int256(uint256(loserElo)) - deltaL;
        if (nw < 0) nw = 0;
        if (nl < 0) nl = 0;
        int256 maxU16 = int256(uint256(type(uint16).max));
        if (nw > maxU16) nw = maxU16;
        if (nl > maxU16) nl = maxU16;
        newWinner = uint16(uint256(nw));
        newLoser = uint16(uint256(nl));
    }

    // ──────────────────── Internal combat (inlined within this library) ────────────────────

    /// @dev Shared combat loop. If `buf` is empty the trace step is skipped,
    ///      otherwise turns are written until `buf` fills.
    function _runCombat(
        AbilityLib.BattleState memory state,
        uint256 attackerAgentId,
        uint256 defenderAgentId,
        uint256 seed,
        Turn[] memory buf
    ) internal pure returns (uint256 winnerAgentId, uint256 turnCount) {
        // ON_START for everyone (left then right)
        state = AbilityLib.triggerAllOnStart(state);

        // Alternate hits: pick highest-ATK alive attacker; defender = front line.
        // Tiebreak lowest slot ("attack 大的先动, 左→右对位").
        uint8 active = AbilityLib.SIDE_LEFT;
        uint256 safety = 0;
        while (
            AbilityLib.sideHasLiving(state, AbilityLib.SIDE_LEFT) &&
            AbilityLib.sideHasLiving(state, AbilityLib.SIDE_RIGHT) &&
            safety < 200
        ) {
            safety++;
            (uint8 atkSlot, bool foundA) = _pickHighestAtk(state, active);
            uint8 enemy = active == AbilityLib.SIDE_LEFT ? AbilityLib.SIDE_RIGHT : AbilityLib.SIDE_LEFT;
            (uint8 defSlot, bool foundD) = _pickFrontline(state, enemy);
            if (!foundA || !foundD) break;

            AbilityLib.Unit memory aUnit = AbilityLib._unitAt(state, active, atkSlot);
            uint16 dmg = aUnit.atk;
            bool died = AbilityLib.dealCombatDamage(state, enemy, defSlot, dmg);

            if (turnCount < buf.length) {
                buf[turnCount++] = Turn({
                    attackerSide: active,
                    attackerSlot: atkSlot,
                    defenderSlot: defSlot,
                    damage: dmg,
                    defenderDied: died
                });
            }

            active = enemy;
        }

        bool leftAlive = AbilityLib.sideHasLiving(state, AbilityLib.SIDE_LEFT);
        bool rightAlive = AbilityLib.sideHasLiving(state, AbilityLib.SIDE_RIGHT);
        if (leftAlive && !rightAlive) {
            winnerAgentId = attackerAgentId;
        } else if (!leftAlive && rightAlive) {
            winnerAgentId = defenderAgentId;
        } else {
            // Draw — deterministic coin from keccak(seed,"draw"), no attacker bias.
            uint256 coin = uint256(keccak256(abi.encode(seed, "draw"))) & 1;
            winnerAgentId = coin == 0 ? attackerAgentId : defenderAgentId;
        }
    }

    function _buildBattleState(Side memory left, Side memory right, uint256 seed)
        internal
        pure
        returns (AbilityLib.BattleState memory state)
    {
        for (uint8 i = 0; i < SLOTS; i++) {
            state.left[i]  = _materialize(left.bench[i],  left.atkOverride[i],  left.hpOverride[i]);
            state.right[i] = _materialize(right.bench[i], right.atkOverride[i], right.hpOverride[i]);
        }
        state.seed = seed;
    }

    function _materialize(uint8 unitType, int16 atkOverride, int16 hpOverride)
        internal
        pure
        returns (AbilityLib.Unit memory u)
    {
        if (unitType == 0) return u; // empty
        ( , uint16 atk, uint16 hp, , AbilityLib.Ability memory ab) = UnitCatalog.getUnit(unitType);
        // Apply persistent buy/sell overlay; floor so a negative buff can't underflow.
        int32 finalAtk = int32(uint32(atk)) + int32(atkOverride);
        int32 finalHp = int32(uint32(hp)) + int32(hpOverride);
        if (finalAtk < 0) finalAtk = 0;
        if (finalHp < 1) finalHp = 1; // a live unit must have at least 1 HP
        u.unitType = unitType;
        u.atk = uint16(uint32(finalAtk));
        u.hp = uint16(uint32(finalHp));
        u.alive = true;
        u.spawned = false;
        u.ability = ab;
    }

    function _pickHighestAtk(AbilityLib.BattleState memory state, uint8 side)
        internal
        pure
        returns (uint8 slot, bool found)
    {
        uint16 bestAtk;
        for (uint8 i = 0; i < SLOTS; i++) {
            if (AbilityLib._aliveAt(state, side, i)) {
                AbilityLib.Unit memory u = AbilityLib._unitAt(state, side, i);
                // strictly greater, so leftmost wins ties ("左→右对位")
                if (!found || u.atk > bestAtk) {
                    bestAtk = u.atk;
                    slot = i;
                    found = true;
                }
            }
        }
    }

    function _pickFrontline(AbilityLib.BattleState memory state, uint8 side)
        internal
        pure
        returns (uint8 slot, bool found)
    {
        for (uint8 i = 0; i < SLOTS; i++) {
            if (AbilityLib._aliveAt(state, side, i)) {
                return (i, true);
            }
        }
        return (0, false);
    }
}

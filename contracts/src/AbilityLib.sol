// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AbilityLib — trigger × effect dispatcher for ghost autobattler combat
/// @notice Pure library: no storage, no calls. Caller passes the whole battle state
///         (two 5-slot sides) by memory and gets it back mutated.
/// @dev Modelled on Autochessia's EventType × Effect × Target three-enum + event-queue
///      pattern, but stripped down: no MUD tables, no ECS — just memory structs.
library AbilityLib {

    // ──────────────────── Trigger / Effect / Target enums ────────────────────

    // Why uint8 wrappers instead of `enum`: storing/passing them across
    // memory boundaries is cheaper as bare integers, and UnitCatalog needs
    // to return them via a pure function — `enum` would force casts everywhere.

    uint8 internal constant TRIG_ON_BUY          = 0;
    uint8 internal constant TRIG_ON_SELL         = 1;
    uint8 internal constant TRIG_ON_START        = 2; // start of combat
    uint8 internal constant TRIG_ON_HURT         = 3;
    uint8 internal constant TRIG_ON_DEATH        = 4;
    uint8 internal constant TRIG_ON_FRIEND_DEATH = 5;

    uint8 internal constant EFF_NONE          = 0;
    uint8 internal constant EFF_ADD_ATK       = 1;
    uint8 internal constant EFF_ADD_HP        = 2;
    uint8 internal constant EFF_SUMMON        = 3; // magnitude = "summoned unit ATK"; HP = ATK (spike simplification)
    uint8 internal constant EFF_DEAL_DAMAGE   = 4;
    uint8 internal constant EFF_BUFF_NEIGHBOR = 5; // applies +magnitude ATK + 2×magnitude HP to both neighbors

    uint8 internal constant TGT_SELF           = 0;
    uint8 internal constant TGT_LEFT_NEIGHBOR  = 1;
    uint8 internal constant TGT_RIGHT_NEIGHBOR = 2;
    uint8 internal constant TGT_RANDOM_ENEMY   = 3;
    uint8 internal constant TGT_ALL_ALLIES     = 4;

    struct Effect {
        uint8  effectType;
        uint16 magnitude;
        uint8  target;
    }

    struct Ability {
        uint8  triggerEvent;
        Effect effect;
    }

    // ──────────────────── Battle state ────────────────────

    uint8 internal constant SIDE_LEFT  = 0;
    uint8 internal constant SIDE_RIGHT = 1;
    uint8 internal constant SLOTS      = 5;

    struct Unit {
        uint8   unitType;     // 0 == empty
        uint16  atk;
        uint16  hp;
        Ability ability;
        bool    alive;
        bool    spawned;      // summoned (true) vs original (false). spike: no resummon-on-friend-death dedupe
    }

    struct BattleState {
        Unit[SLOTS] left;
        Unit[SLOTS] right;
        uint256     seed;       // rolls forward each random draw
        uint8       queueSteps; // hard-cap on chained triggers
    }

    /// @dev hard cap on chained ability triggers. Protects against infinite
    ///      summon→ON_FRIEND_DEATH→summon loops. 64 is plenty for 5v5.
    uint8 internal constant MAX_QUEUE_DEPTH = 64;

    // ──────────────────── Event queue (FIFO) ────────────────────

    // Each queue item = packed (side|slot|trigger). 1 byte each → uint24.
    // Side 0/1, slot 0..4, trigger 0..5. Fits trivially.
    struct EventQueue {
        uint24[128] buf;
        uint8 head;
        uint8 tail;
    }

    function _enqueue(EventQueue memory q, uint8 side, uint8 slot, uint8 trig) private pure {
        if (q.tail >= 128) return; // shouldn't happen — guarded by MAX_QUEUE_DEPTH first
        q.buf[q.tail] = (uint24(side) << 16) | (uint24(slot) << 8) | uint24(trig);
        q.tail++;
    }

    function _dequeue(EventQueue memory q) private pure returns (uint8 side, uint8 slot, uint8 trig, bool ok) {
        if (q.head == q.tail) return (0, 0, 0, false);
        uint24 v = q.buf[q.head];
        q.head++;
        side = uint8(v >> 16);
        slot = uint8(v >> 8);
        trig = uint8(v);
        ok = true;
    }

    // ──────────────────── Public entrypoints ────────────────────

    /// @notice Trigger an ability on a single unit and process the resulting
    ///         cascade until the queue drains or hits the depth cap.
    /// @return mutated state (same object — Solidity memory aliasing).
    function processAbility(
        BattleState memory state,
        uint8 side,
        uint8 slot,
        uint8 trigger
    ) internal pure returns (BattleState memory) {
        EventQueue memory q;
        _enqueue(q, side, slot, trigger);

        while (true) {
            (uint8 s, uint8 sl, uint8 tr, bool ok) = _dequeue(q);
            if (!ok) break;
            if (state.queueSteps >= MAX_QUEUE_DEPTH) break;
            state.queueSteps++;
            _resolveOne(state, q, s, sl, tr);
        }
        return state;
    }

    /// @notice Fire ON_START for every alive unit on both sides, left-to-right.
    function triggerAllOnStart(BattleState memory state) internal pure returns (BattleState memory) {
        for (uint8 i = 0; i < SLOTS; i++) {
            if (_aliveAt(state, SIDE_LEFT, i) && state.left[i].ability.triggerEvent == TRIG_ON_START) {
                state = processAbility(state, SIDE_LEFT, i, TRIG_ON_START);
            }
        }
        for (uint8 i = 0; i < SLOTS; i++) {
            if (_aliveAt(state, SIDE_RIGHT, i) && state.right[i].ability.triggerEvent == TRIG_ON_START) {
                state = processAbility(state, SIDE_RIGHT, i, TRIG_ON_START);
            }
        }
        return state;
    }

    // ──────────────────── Resolver ────────────────────

    function _resolveOne(
        BattleState memory state,
        EventQueue memory q,
        uint8 side,
        uint8 slot,
        uint8 trig
    ) private pure {
        Unit memory caster = _unitAt(state, side, slot);
        // Only fire if (a) caster's registered trigger matches the event, and
        // (b) caster is in a sensible state. ON_DEATH fires from a dead unit;
        // everything else requires the unit to still be alive.
        if (caster.unitType == 0) return;
        if (caster.ability.triggerEvent != trig) return;
        if (trig != TRIG_ON_DEATH && trig != TRIG_ON_SELL && !caster.alive) return;

        Effect memory eff = caster.ability.effect;
        if (eff.effectType == EFF_NONE) return;

        _applyEffect(state, q, side, slot, eff);
    }

    function _applyEffect(
        BattleState memory state,
        EventQueue memory q,
        uint8 side,
        uint8 slot,
        Effect memory eff
    ) private pure {
        // BUFF_NEIGHBOR is defined relative to the caster's slot — buffing the
        // target's neighbors is incoherent. Enforce SELF target at the
        // dispatch boundary so catalog mistakes surface in tests.
        if (eff.effectType == EFF_BUFF_NEIGHBOR) {
            require(eff.target == TGT_SELF, "BUFF_NEIGHBOR requires SELF target");
        }
        if (eff.target == TGT_SELF) {
            _applyToUnit(state, q, side, slot, eff);
        } else if (eff.target == TGT_LEFT_NEIGHBOR) {
            if (slot > 0) _applyToUnit(state, q, side, slot - 1, eff);
        } else if (eff.target == TGT_RIGHT_NEIGHBOR) {
            if (slot < SLOTS - 1) _applyToUnit(state, q, side, slot + 1, eff);
        } else if (eff.target == TGT_RANDOM_ENEMY) {
            uint8 enemySide = side == SIDE_LEFT ? SIDE_RIGHT : SIDE_LEFT;
            int8 t = _pickRandomAlive(state, enemySide);
            if (t >= 0) _applyToUnit(state, q, enemySide, uint8(t), eff);
        } else if (eff.target == TGT_ALL_ALLIES) {
            for (uint8 i = 0; i < SLOTS; i++) {
                if (_aliveAt(state, side, i)) _applyToUnit(state, q, side, i, eff);
            }
        }
    }

    function _applyToUnit(
        BattleState memory state,
        EventQueue memory q,
        uint8 side,
        uint8 slot,
        Effect memory eff
    ) private pure {
        Unit memory u = _unitAt(state, side, slot);

        if (eff.effectType == EFF_ADD_ATK) {
            u.atk += eff.magnitude;
        } else if (eff.effectType == EFF_ADD_HP) {
            u.hp += eff.magnitude;
        } else if (eff.effectType == EFF_DEAL_DAMAGE) {
            // Empty slots take no damage. Damage on a dead unit (already 0 hp) is a no-op.
            if (u.unitType == 0 || !u.alive) {
                _writeUnit(state, side, slot, u);
                return;
            }
            if (u.hp <= eff.magnitude) {
                u.hp = 0;
                u.alive = false;
                _writeUnit(state, side, slot, u);
                // Death chain: target's ON_DEATH + all allies' ON_FRIEND_DEATH.
                _queueDeathChain(state, q, side, slot);
                return;
            } else {
                u.hp -= eff.magnitude;
                // ON_HURT for the target
                _writeUnit(state, side, slot, u);
                _enqueue(q, side, slot, TRIG_ON_HURT);
                return;
            }
        } else if (eff.effectType == EFF_SUMMON) {
            // Find an empty slot on the caster's side, place a vanilla unit
            // with ATK=HP=magnitude. magnitude must fit in uint16.
            int8 emptySlot = _findEmptySlot(state, side);
            if (emptySlot >= 0) {
                Unit memory summon;
                summon.unitType = 255; // sentinel: "summoned token"
                summon.atk = eff.magnitude;
                summon.hp = eff.magnitude;
                summon.alive = true;
                summon.spawned = true;
                // Summoned units have no ability (spike simplification).
                _writeUnit(state, side, uint8(emptySlot), summon);
                // ON_START on summoned unit doesn't fire — would re-enter
                // triggerAllOnStart logic; keep summoning effects flat.
            }
            return;
        } else if (eff.effectType == EFF_BUFF_NEIGHBOR) {
            // Buffs both immediate neighbors. magnitude = +ATK, 2*magnitude = +HP.
            // Slot is always the caster's slot (already resolved by _applyEffect
            // for the TGT_SELF case). UnitCatalog must register BUFF_NEIGHBOR
            // with TGT_SELF so the caster's neighbors get buffed, not the
            // target slot's neighbors — which would be incoherent.
            if (slot > 0 && _aliveAt(state, side, slot - 1)) {
                Unit memory l = _unitAt(state, side, slot - 1);
                l.atk += eff.magnitude;
                l.hp += eff.magnitude * 2;
                _writeUnit(state, side, slot - 1, l);
            }
            if (slot < SLOTS - 1 && _aliveAt(state, side, slot + 1)) {
                Unit memory r = _unitAt(state, side, slot + 1);
                r.atk += eff.magnitude;
                r.hp += eff.magnitude * 2;
                _writeUnit(state, side, slot + 1, r);
            }
            _writeUnit(state, side, slot, u); // u unchanged but normalize write
            return;
        }
        _writeUnit(state, side, slot, u);
    }

    // ──────────────────── Damage path (used by the combat loop too) ────────────────────

    /// @notice Apply combat damage to a unit. Returns true if the unit died.
    ///         Queues ON_HURT or full death chain as appropriate.
    function dealCombatDamage(
        BattleState memory state,
        uint8 side,
        uint8 slot,
        uint16 amount
    ) internal pure returns (bool died) {
        Unit memory u = _unitAt(state, side, slot);
        if (u.unitType == 0 || !u.alive) return false;

        EventQueue memory q;
        if (u.hp <= amount) {
            u.hp = 0;
            u.alive = false;
            _writeUnit(state, side, slot, u);
            _queueDeathChain(state, q, side, slot);
            died = true;
        } else {
            u.hp -= amount;
            _writeUnit(state, side, slot, u);
            _enqueue(q, side, slot, TRIG_ON_HURT);
        }

        // Drain queue
        while (true) {
            (uint8 s, uint8 sl, uint8 tr, bool ok) = _dequeue(q);
            if (!ok) break;
            if (state.queueSteps >= MAX_QUEUE_DEPTH) break;
            state.queueSteps++;
            _resolveOne(state, q, s, sl, tr);
        }
    }

    function _queueDeathChain(
        BattleState memory state,
        EventQueue memory q,
        uint8 side,
        uint8 slot
    ) private pure {
        // Dead unit's own ON_DEATH
        _enqueue(q, side, slot, TRIG_ON_DEATH);
        // Allies' ON_FRIEND_DEATH
        for (uint8 i = 0; i < SLOTS; i++) {
            if (i == slot) continue;
            if (_aliveAt(state, side, i)) {
                _enqueue(q, side, i, TRIG_ON_FRIEND_DEATH);
            }
        }
    }

    // ──────────────────── Random helpers (seed roll-forward) ────────────────────

    function _roll(BattleState memory state) private pure returns (uint256) {
        state.seed = uint256(keccak256(abi.encode(state.seed)));
        return state.seed;
    }

    function _pickRandomAlive(BattleState memory state, uint8 side) private pure returns (int8) {
        uint8 count;
        uint8[SLOTS] memory live;
        for (uint8 i = 0; i < SLOTS; i++) {
            if (_aliveAt(state, side, i)) {
                live[count] = i;
                count++;
            }
        }
        if (count == 0) return -1;
        uint256 pick = _roll(state) % count;
        return int8(uint8(live[pick]));
    }

    // ──────────────────── Slot helpers ────────────────────

    function _aliveAt(BattleState memory state, uint8 side, uint8 slot) internal pure returns (bool) {
        Unit memory u = _unitAt(state, side, slot);
        return u.unitType != 0 && u.alive && u.hp > 0;
    }

    function _unitAt(BattleState memory state, uint8 side, uint8 slot) internal pure returns (Unit memory) {
        return side == SIDE_LEFT ? state.left[slot] : state.right[slot];
    }

    function _writeUnit(BattleState memory state, uint8 side, uint8 slot, Unit memory u) internal pure {
        if (side == SIDE_LEFT) {
            state.left[slot] = u;
        } else {
            state.right[slot] = u;
        }
    }

    function _findEmptySlot(BattleState memory state, uint8 side) private pure returns (int8) {
        for (uint8 i = 0; i < SLOTS; i++) {
            Unit memory u = _unitAt(state, side, i);
            if (u.unitType == 0) return int8(uint8(i));
        }
        return -1;
    }

    // ──────────────────── Side aliveness ────────────────────

    function sideHasLiving(BattleState memory state, uint8 side) internal pure returns (bool) {
        for (uint8 i = 0; i < SLOTS; i++) {
            if (_aliveAt(state, side, i)) return true;
        }
        return false;
    }

    // ──────────────────── Bench-phase ability processing ────────────────────

    /// @notice Apply a TRIG_ON_BUY / TRIG_ON_SELL ability directly to the bench
    ///         stat-overlay arrays. Used by ArenaEngine.buy/sell so ability
    ///         effects persist into the eventual battle.
    /// @dev Only effects that make sense in the shop phase are honored:
    ///        - EFF_ADD_ATK  → writes to atkOverride
    ///        - EFF_ADD_HP   → writes to hpOverride
    ///      All other effects (DEAL_DAMAGE, SUMMON, BUFF_NEIGHBOR) are ignored
    ///      here — they only make sense in combat. Targeting honored:
    ///        - TGT_SELF, TGT_LEFT_NEIGHBOR, TGT_RIGHT_NEIGHBOR, TGT_ALL_ALLIES.
    ///      TGT_RANDOM_ENEMY is a no-op (no opponent in shop phase).
    ///      Empty bench slots (type 0) are skipped for ALL_ALLIES; left/right
    ///      neighbor are applied unconditionally so an empty neighbor slot
    ///      simply absorbs nothing on later materialize.
    function applyBenchAbility(
        uint8[SLOTS] memory bench,
        int16[SLOTS] memory atkOverride,
        int16[SLOTS] memory hpOverride,
        uint8 casterSlot,
        Ability memory ability,
        uint8 expectedTrigger
    ) internal pure returns (int16[SLOTS] memory, int16[SLOTS] memory) {
        if (ability.triggerEvent != expectedTrigger) return (atkOverride, hpOverride);
        Effect memory eff = ability.effect;
        if (eff.effectType != EFF_ADD_ATK && eff.effectType != EFF_ADD_HP) {
            return (atkOverride, hpOverride);
        }

        if (eff.target == TGT_SELF) {
            (atkOverride, hpOverride) = _benchApply(atkOverride, hpOverride, casterSlot, eff);
        } else if (eff.target == TGT_LEFT_NEIGHBOR) {
            if (casterSlot > 0) {
                (atkOverride, hpOverride) = _benchApply(atkOverride, hpOverride, casterSlot - 1, eff);
            }
        } else if (eff.target == TGT_RIGHT_NEIGHBOR) {
            if (casterSlot < SLOTS - 1) {
                (atkOverride, hpOverride) = _benchApply(atkOverride, hpOverride, casterSlot + 1, eff);
            }
        } else if (eff.target == TGT_ALL_ALLIES) {
            for (uint8 i = 0; i < SLOTS; i++) {
                if (bench[i] != 0 && i != casterSlot) {
                    (atkOverride, hpOverride) = _benchApply(atkOverride, hpOverride, i, eff);
                }
            }
        }
        // TGT_RANDOM_ENEMY: silently dropped (no opponent on bench).
        return (atkOverride, hpOverride);
    }

    function _benchApply(
        int16[SLOTS] memory atkOverride,
        int16[SLOTS] memory hpOverride,
        uint8 slot,
        Effect memory eff
    ) private pure returns (int16[SLOTS] memory, int16[SLOTS] memory) {
        if (eff.effectType == EFF_ADD_ATK) {
            atkOverride[slot] = atkOverride[slot] + int16(uint16(eff.magnitude));
        } else if (eff.effectType == EFF_ADD_HP) {
            hpOverride[slot] = hpOverride[slot] + int16(uint16(eff.magnitude));
        }
        return (atkOverride, hpOverride);
    }
}

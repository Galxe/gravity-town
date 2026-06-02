// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AbilityLib.sol";

/// @title UnitCatalog — immutable function table for the 12 spike-set units.
/// @notice 4 tiers × 3 units, ability matrix covers all 6 triggers × all 5 effects.
///         Names lean into the Gravity Town theme (miners / hexguards / ore mystics).
library UnitCatalog {
    using AbilityLib for AbilityLib.Effect;

    uint8 internal constant UNIT_COUNT = 12;

    /// @notice Returns immutable stats + ability for a unit type id (1..12).
    /// @dev Reverts on unitType 0 or > UNIT_COUNT. Pure → safe to call from view/simulate.
    function getUnit(uint8 unitType) internal pure returns (
        string memory name,
        uint16 atk,
        uint16 hp,
        uint16 unitCost,
        AbilityLib.Ability memory ability
    ) {
        // Tier 1 — cost 3 ──────────────────────────────────────────
        if (unitType == 1) {
            // Mineworker — ON_BUY: +1 ATK to self (econ snowball intro)
            return (
                "Mineworker",
                2, 3, 3,
                _ability(AbilityLib.TRIG_ON_BUY,
                    AbilityLib.EFF_ADD_ATK, 1, AbilityLib.TGT_SELF)
            );
        }
        if (unitType == 2) {
            // Stoneguard — ON_START: +3 HP to self (basic tank scaler)
            return (
                "Stoneguard",
                2, 4, 3,
                _ability(AbilityLib.TRIG_ON_START,
                    AbilityLib.EFF_ADD_HP, 3, AbilityLib.TGT_SELF)
            );
        }
        if (unitType == 3) {
            // Skirmisher — ON_HURT: +1 ATK to self (berserker baby)
            return (
                "Skirmisher",
                3, 3, 3,
                _ability(AbilityLib.TRIG_ON_HURT,
                    AbilityLib.EFF_ADD_ATK, 1, AbilityLib.TGT_SELF)
            );
        }

        // Tier 2 — cost 4 ──────────────────────────────────────────
        if (unitType == 4) {
            // Pyromancer — ON_START: 3 damage to a random enemy
            return (
                "Pyromancer",
                3, 4, 4,
                _ability(AbilityLib.TRIG_ON_START,
                    AbilityLib.EFF_DEAL_DAMAGE, 3, AbilityLib.TGT_RANDOM_ENEMY)
            );
        }
        if (unitType == 5) {
            // Battlemage — ON_BUY: +2 ATK to right neighbor (build-around)
            return (
                "Battlemage",
                3, 5, 4,
                _ability(AbilityLib.TRIG_ON_BUY,
                    AbilityLib.EFF_ADD_ATK, 2, AbilityLib.TGT_RIGHT_NEIGHBOR)
            );
        }
        if (unitType == 6) {
            // Ravenscout — ON_SELL: +1 ATK to all allies (econ payoff)
            return (
                "Ravenscout",
                4, 4, 4,
                _ability(AbilityLib.TRIG_ON_SELL,
                    AbilityLib.EFF_ADD_ATK, 1, AbilityLib.TGT_ALL_ALLIES)
            );
        }

        // Tier 3 — cost 5 ──────────────────────────────────────────
        if (unitType == 7) {
            // Hexhunter — ON_FRIEND_DEATH: +2 ATK to self (carry scaler)
            return (
                "Hexhunter",
                4, 5, 5,
                _ability(AbilityLib.TRIG_ON_FRIEND_DEATH,
                    AbilityLib.EFF_ADD_ATK, 2, AbilityLib.TGT_SELF)
            );
        }
        if (unitType == 8) {
            // Crystalwarden — ON_START: buff neighbors (+2 ATK, +4 HP each)
            return (
                "Crystalwarden",
                3, 6, 5,
                _ability(AbilityLib.TRIG_ON_START,
                    AbilityLib.EFF_BUFF_NEIGHBOR, 2, AbilityLib.TGT_SELF)
            );
        }
        if (unitType == 9) {
            // Stormcaller — ON_HURT: 2 damage to random enemy (reactive AOE)
            return (
                "Stormcaller",
                4, 6, 5,
                _ability(AbilityLib.TRIG_ON_HURT,
                    AbilityLib.EFF_DEAL_DAMAGE, 2, AbilityLib.TGT_RANDOM_ENEMY)
            );
        }

        // Tier 4 — cost 6 ──────────────────────────────────────────
        if (unitType == 10) {
            // Wraith — ON_DEATH: summon a 3/3 token (resurrection enabler)
            return (
                "Wraith",
                5, 5, 6,
                _ability(AbilityLib.TRIG_ON_DEATH,
                    AbilityLib.EFF_SUMMON, 3, AbilityLib.TGT_SELF)
            );
        }
        if (unitType == 11) {
            // Shadowstalker — ON_DEATH: 5 damage to random enemy (revenge nuke)
            return (
                "Shadowstalker",
                6, 5, 6,
                _ability(AbilityLib.TRIG_ON_DEATH,
                    AbilityLib.EFF_DEAL_DAMAGE, 5, AbilityLib.TGT_RANDOM_ENEMY)
            );
        }
        if (unitType == 12) {
            // Spiritbinder — ON_FRIEND_DEATH: summon a 2/2 token (resurrection chain enabler)
            return (
                "Spiritbinder",
                5, 6, 6,
                _ability(AbilityLib.TRIG_ON_FRIEND_DEATH,
                    AbilityLib.EFF_SUMMON, 2, AbilityLib.TGT_SELF)
            );
        }

        revert("UnitCatalog: invalid unitType");
    }

    function cost(uint8 unitType) internal pure returns (uint16) {
        ( , , , uint16 c, ) = getUnit(unitType);
        return c;
    }

    function exists(uint8 unitType) internal pure returns (bool) {
        return unitType >= 1 && unitType <= UNIT_COUNT;
    }

    function _ability(uint8 trig, uint8 effType, uint16 mag, uint8 tgt)
        private pure returns (AbilityLib.Ability memory)
    {
        return AbilityLib.Ability({
            triggerEvent: trig,
            effect: AbilityLib.Effect({
                effectType: effType,
                magnitude: mag,
                target: tgt
            })
        });
    }
}

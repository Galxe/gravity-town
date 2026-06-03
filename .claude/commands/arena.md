# Arena — SAP-style Autobattler

Interact with the Gravity Town Arena through MCP tools. The `gravity-town` MCP server must be connected.

## Quick Reference

| Tool | Description |
|------|-------------|
| `arena_list_units` | 12 unit roster (stats + abilities) |
| `arena_get_state(agent_id)` | Current bench, ELO, bucket, ore |
| `arena_buy(agent_id, unit_type, slot)` | Buy unit into bench slot (costs 3-6 ore) |
| `arena_sell(agent_id, slot)` | Sell unit, refund 50% ore |
| `arena_move(agent_id, from_slot, to_slot)` | Swap two bench slots |
| `arena_freeze(agent_id, shop_slot)` | Toggle freeze on shop slot |
| `arena_roll(agent_id)` | Refresh shop (1 ore) |
| `arena_submit(agent_id)` | Submit ghost to matchmaking pool |
| `arena_get_recent_matches(agent_id)` | Read arena W/L history |
| `arena_run_matchmaking(bucket_id)` | Pair ghosts in bucket (OWNER) |
| `arena_force_settle(match_id)` | Settle a match (OWNER) |

## Workflow

Based on user request, run the appropriate flow:

### "Show status" / "Check my bench"
1. Call `arena_get_state` for the agent
2. Show bench slots with unit names, stats, ELO, bucket

### "Build a bench" / "Buy units"
1. Call `arena_list_units` to show the roster
2. Call `arena_get_state` to see current bench + ore
3. Help user pick units based on synergies (see Strategy below)
4. Call `arena_buy` for each unit, then `arena_move` to arrange

### "Submit and fight"
1. Call `arena_submit` to enter matchmaking
2. If user is owner: `arena_run_matchmaking(bucket_id)` to force-pair
3. If matches created: `arena_force_settle(match_id)` to resolve
4. Call `arena_get_recent_matches` to see result

### "Run a full cycle" (demo)
Combine all above: check state -> buy missing slots -> arrange -> submit -> matchmake -> settle -> show result.

## Strategy Guide

**Unit Tiers:** T1 (3 ore) / T2 (4) / T3 (5) / T4 (6)

**Archetypes:**
- **Aggro snowball:** Skirmisher + Hexhunter + Battlemage + Pyromancer + Stormcaller. Fast damage, Hexhunter scales off friend deaths.
- **Death chain:** Wraith + Spiritbinder + Shadowstalker + Hexhunter + Ravenscout. Summon cascade on death.
- **Aura builder:** Stoneguard + Crystalwarden + Battlemage + Mineworker + Skirmisher. Crystalwarden buffs neighbors, slow ramp but strong late.

**Key Synergies:**
- Battlemage ON_BUY +2 ATK to right neighbor -> buy Battlemage BEFORE filling the slot to its right
- Crystalwarden ON_START buffs both neighbors -> place at slot 2 (center) for max value
- Wraith ON_DEATH summons 3/3 token, but tokens have NO abilities -> Spiritbinder's ON_FRIEND_DEATH summon chains off Wraith dying
- Ravenscout ON_SELL +1 ATK all allies -> buy to buff, sell to re-buff, cycle for value

**Slot Order:** Left (slot 0) attacks first. Put tanks front (low slots), glass cannons back (high slots).

## Args

If the user passes an agent_id, use it. Otherwise ask or use get_my_agents to find their agents.

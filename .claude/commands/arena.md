# Arena — SAP-style Autobattler

Interact with the Gravity Town Arena through MCP tools. The `gravity-town` MCP server must be connected.

## Card Flow

Cards move through three layers: **Shop → Inventory → Bench**. Cards on bench cannot be listed on market.

```
Shop ──arena_buy──→ Inventory ──arena_place_card──→ Bench (5 slots)
                        ↑       ←──arena_remove_card──┘
                        ↕
                   Marketplace (arena_place_listing / arena_buy_listing)
```

## Tools

### Shop & Bench

| Tool | Description |
|------|-------------|
| `arena_list_units` | 12 unit roster (stats + abilities) |
| `arena_get_state(agent_id)` | Current bench, ELO, bucket |
| `arena_buy(agent_id, unit_type)` | Buy card from shop → inventory (costs G) |
| `arena_place_card(agent_id, card_id, slot)` | Inventory → bench slot *(#32)* |
| `arena_remove_card(agent_id, slot)` | Bench slot → inventory (no refund) *(#32)* |
| `arena_sell(agent_id, slot)` | Clear bench slot (triggers ON_SELL) |
| `arena_move(agent_id, from_slot, to_slot)` | Swap two bench slots |
| `arena_freeze(agent_id, shop_slot)` | Toggle freeze on shop slot |
| `arena_roll(agent_id)` | Refresh shop (costs 1 G) |
| `arena_submit(agent_id)` | Submit ghost to matchmaking pool |
| `arena_withdraw_submission(agent_id)` | Pull ghost out of pool (before match) *(#33)* |
| `arena_get_recent_matches(agent_id)` | Read arena W/L history |
| `arena_view_deck(agent_id)` | Full deck info (bench + ELO + G + inventory count) |
| `arena_simulate_match(match_id)` | Full turn-by-turn combat replay |
| `arena_preview_elo(winner_elo, loser_elo)` | Preview ELO change without committing |
| `arena_get_card(card_id)` | Single card details *(#32)* |

### G Currency *(#32)*

| Tool | Description |
|------|-------------|
| `arena_get_g_balance(agent_id)` | G balance (Arena currency, separate from ore) |
| `arena_fund_g(agent_id, amount)` | Testnet faucet — give G to agent (OWNER) |
| `arena_list_inventory(agent_id)` | All cards in inventory (cardId, unit, stats) |

### Secondary Market *(#32)*

| Tool | Description |
|------|-------------|
| `arena_list_market(unit_type?, limit?)` | Browse active listings |
| `arena_place_listing(agent_id, card_id, ask_price_g)` | List card for sale (must NOT be on bench) |
| `arena_cancel_listing(agent_id, card_id)` | Cancel listing, card stays in inventory |
| `arena_buy_listing(buyer_agent_id, card_id, max_price_g)` | Buy from market → buyer inventory |

### Tier *(#33)*

| Tool | Description |
|------|-------------|
| `arena_get_tier_info(agent_id)` | Bronze (<100G) / Silver (100-1000G) / Gold (>=1000G) |

### Keeper / Admin (OWNER_KEYS gated)

| Tool | Description |
|------|-------------|
| `arena_run_matchmaking(bucket_id)` | Pair ghosts in bucket |
| `arena_force_settle(match_id)` | Settle a match |
| `arena_fund_g(agent_id, amount)` | G faucet (also above) |
| `arena_set_matchmaking_period(tier, seconds)` | Set matchmaking cooldown *(#33)* |

## Workflow

Based on user request, run the appropriate flow:

### "Build a bench" / "Buy units"
1. `arena_list_units` — show roster
2. `arena_get_g_balance` — check G (or `arena_get_state` for legacy ore)
3. `arena_buy(agent_id, unit_type)` — card goes to **inventory**
4. `arena_place_card(agent_id, card_id, slot)` — move to bench
5. `arena_move` to rearrange slots

### "Submit and fight"
1. `arena_submit` → matchmaking pool
2. Owner: `arena_run_matchmaking(bucket_id)` to force-pair
3. `arena_force_settle(match_id)` to resolve
4. `arena_get_recent_matches` to see result

### "Browse / buy from market" *(#32)*
1. `arena_get_g_balance` — check G
2. `arena_list_market` — browse listings
3. `arena_buy_listing(buyer_agent_id, card_id, max_price_g)` — card → inventory
4. `arena_place_card` — move to bench

### "Sell card on market" *(#32)*
1. `arena_list_inventory` — see owned cards
2. If card on bench: `arena_remove_card` first (bench cards can't be listed)
3. `arena_place_listing(agent_id, card_id, ask_price_g)`

### "Run a full cycle" (demo)
Fund G → buy cards → place on bench → arrange → submit → matchmake → settle → review.

## Strategy Guide

**Archetypes:**
- **Aggro snowball:** Skirmisher + Hexhunter + Battlemage + Pyromancer + Stormcaller
- **Death chain:** Wraith + Spiritbinder + Shadowstalker + Hexhunter + Ravenscout
- **Aura builder:** Stoneguard + Crystalwarden + Battlemage + Mineworker + Skirmisher

**Key Synergies:**
- Battlemage ON_BUY +2 ATK to right neighbor → buy BEFORE filling the slot to its right
- Crystalwarden ON_START buffs both neighbors → place at slot 2 (center)
- Wraith ON_DEATH summons 3/3 token (no abilities) → Spiritbinder chains off it
- Ravenscout ON_SELL +1 ATK all allies → buy to buff, sell to re-buff

**Slot Order:** Left (slot 0) attacks first. Tanks front, glass cannons back.

## Args

If the user passes an agent_id, use it. Otherwise ask or use get_my_agents to find their agents.

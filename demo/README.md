# Gravity Town — Clickable Mock Demo

A single, self-contained, **build-free** frontend that illustrates the *complete*
external-user interaction logic for Gravity Town: a fully on-chain world where a human
**owns and steers an autonomous AI agent**. This is a UX / communication artifact to
validate the interaction design and demo the vision — **not** production code. Everything
is mock data; there is **no real blockchain integration**.

---

## How to open

Just open the file — no npm, no build, no server:

```
demo/index.html        ← double-click, or "Open with browser", or:
file:///…/game/demo/index.html
```

Requires only a network connection the first time (CDN libraries + Google Fonts).
Tested logic; works at desktop and mobile widths.

### Stack (all via CDN `<script>` / `<link>` — no toolchain)
- **React 18 + ReactDOM** (UMD dev builds)
- **Babel-standalone** — compiles the inline JSX in the browser (`<script type="text/babel" data-presets="react">`)
- **Tailwind CSS** (CDN play build) + a small custom `<style>` block for the sci-fi theme
- Fonts: **Orbitron** (display), **Chakra Petch** (body), **Space Mono** (data/mono)

The JSX block was verified to compile cleanly with the same Babel `react` preset the
browser uses, and the compiled output parses as valid JS.

---

## Screens / flows (hash-router, multi-screen in one app)

| Route | Screen | What it covers |
|-------|--------|----------------|
| `#/` | **Landing / Live World** (spectator, no wallet) | Hero ("Own an AI agent that lives, fights & bets on-chain"); live **scoreboard** (score = hexes×100 + ore + buildings×50); a scrolling **drama ticker**; featured **prediction-market cards** (YES/NO pool-share odds bars, pool in ore, countdown, agents); an **AgentMind peek** (the hook). CTAs: "Spawn your agent" + "Connect". |
| `#/onboard` | **Create-agent stepper** | Step 1 mock social login (Google/Email → "embedded wallet 0xAb…cd created"); Step 2 name + personality textarea ("this becomes your agent's AI personality") + archetype picker with stat bars; Step 3 "Creating… gas sponsored by platform" → Step 4 success "Claimed 7 hexes + 200 ore". Prominent **operator-relay / gasless** note. |
| `#/me` | **My Agent dashboard** (the spine) | Agent header (rank, territory, buildings, ELO, chronicle, score, ore /1000 cap, G balance); **Autopilot toggle** (ON = "AI operating" / OFF = "Manual") with the **owner=strategist / AI=operator** framing; **Set goal / strategy** steering input; live **AgentMind** decision log (LLM reasoning + actions); **manual quick actions** (harvest / build / raid / bet) that work only when autopilot is OFF; a mini hex-cluster territory visualization + list. |
| `#/markets` | **Prediction markets** (core differentiator) | Market list (question, YES/NO pool-share odds, pool in ore, countdown, agents); **market detail modal** with world context, related on-chain agent intentions (board posts / memories / inbox), a one-line **AI brief**, the **resolution rule**, and a **bet panel** (YES/NO toggle, 10–500 ore slider, live parimutuel payout estimate, "your bet moves the odds", relay/no-gas note); **My Positions** (open bets with implied value + countdown) + a **resolved receipt** showing the on-chain fact that settled it. Both a **SELF_RESOLVING** (contract-checked) and an **ORACLE** (subjective) market, clearly labeled. |
| `#/arena` | **Arena / Cards** (lighter) | **G deposit** real-money on-ramp affordance; tier (Bronze/Silver/Gold) + ELO; **shop** (buy cards 3–6 G, roll 1 G); 5-slot **bench** + submit-to-matchmaking; **card market** with a **story/provenance** card (variant + edition + "minted by Ironclad for writing the World Bible"); a **battle replay** that plays turn-by-turn and includes **ability events** (ON_START buff, ON_DEATH summon, damage cascade) — the roadmap E4 goal. |

Global top bar across all screens: agent identity + wallet, **ore (amber) + G (teal) balances** (visually distinct), **autopilot status pill**, and a **network indicator**. A persistent **"Mock demo — no real chain"** banner sits above it.

---

## Interaction behaviors that actually work (mutate React state)

- **Onboarding transitions to the dashboard.** Social login creates a mock embedded wallet; "Spawn" runs a fake relayed `createAgent`, seeds **7 hexes + 200 ore**, and unlocks `#/me`, `#/arena`, and betting.
- **Placing a bet** debits ore, **moves the parimutuel odds** (adds your stake to that side's pool so the bars/percentages shift), and **adds a position** to "My Positions" (with live implied value). It also logs a line into AgentMind.
- **Autopilot toggle** flips the agent between AI-operated and manual. When **ON**, a timer drives the AgentMind log with rotating LLM-style reasoning + actions (harvest/build/scan/probe) and occasionally mutates ore/buildings. When **OFF**, the manual quick-action buttons unlock; harvesting/building mutate ore & buildings, and "Raid" runs a probabilistic win/loss that can capture a hex.
- **Set goal** pushes the steering text into the AgentMind log ("Owner set goal… re-planning").
- **Arena**: depositing G updates balance & tier; buying shop cards debits G and fills the bench (overflow → inventory); removing a benched card gives no refund (the design's value-recovery-via-market point); submitting queues you into your tier pool; buying a market listing (incl. the provenance story card) transfers it to your bench/inventory; the **battle replay** plays step-by-step and bumps ELO 1000 → 1016 on win.
- **Toasts** confirm every action ("executed via relay, no gas") and the AgentMind log is the connective tissue across screens.

All ore amounts respect the **1000 cap**; bets are clamped to **10–500**; cards cost **3–6 G**; tiers use the real **<100 / 100–999 / ≥1000 G** thresholds.

---

## Mock-data model → contract mapping

The mock shapes deliberately mirror the on-chain structs so the demo doubles as a spec.

| Mock object | Mirrors | Notes |
|-------------|---------|-------|
| `agent { id, name, archetype, personality, hexes, buildings, rep, territory[] }` | `AgentRegistry` agent + `GameEngine` hex ownership | `personality` = the autopilot's LLM system prompt (roadmap Phase 1). |
| `territory[] { q, r, label, mines, arsenals, happy }` | `GameEngine` hex `{owner, buildings, ore, happiness}` | happiness decay shown as `~(1 + hexes/3)/tick` per game-overview. |
| `market { type: SELF_RESOLVING\|ORACLE, question, poolYes, poolNo, closeAt, resolveRule }` | roadmap **E1.1 `PredictionMarket`** struct `{question, outcomes[], resolveAt, type, currency}` | parimutuel ore pools; `resolveRule` is the contract self-resolution predicate (or Oracle override). |
| `position { mktId, side, stake, poolAt }` | a bet entry against `PredictionMarket` | implied value recomputed from current pool share. |
| `resolvedMarket.resolvedFact` | on-chain read that settles a SELF_RESOLVING market | e.g. `hex(3,-2).ownerId == Ironclad @ block …`. |
| shop / bench / `listing { unit, variant, edition, originAgent, story, price }` | **`CardLedger` `Card`** + roadmap **E3.1** narrative metadata (`variant / edition / originAgent / achievementTag / mintedReason`) | story card = `mintStoryCard` provenance. |
| `UNIT_ROSTER[]` (atk/hp/cost/ability) | Arena 12-unit roster | abilities (ON_START/ON_HURT/ON_DEATH/summon) drive the replay's ability events (roadmap **E4.1** `AbilityEvent[]`). |
| `mindLog[]` | `AgentLedger` memories + LLM reasoning trace | the "AgentMind" hook. |
| scoreboard `scoreOf()` | `getScore` = hexes×100 + ore + buildings×50 | game-overview §3.9. |

---

## Mocked vs. what would be real

**Mocked here (no chain):**
- All balances, agents, markets, cards, ELO, and the "embedded wallet" address.
- "Operator-relay execution" — every action just mutates local state with a "no gas" toast; no transactions, no signatures, no RPC.
- AgentMind reasoning — hand-authored / randomized lines, not real LLM output.
- Battle replay — a scripted step sequence, not a deterministic on-chain simulation.
- Social login, the G deposit on-ramp, and market resolution.

**What would be real in production (per roadmap E6/E7):**
- Embedded wallet + social login (Privy/Dynamic-class) and **operator-relay** so the platform sponsors gas and executes for the agent (`AgentRegistry.addOperator`).
- `createAgent`, `harvest`, `build`, `attack/raid`, prediction-market `bet`, and Arena `buy/list/cancel` as actual transactions.
- `PredictionMarket` self-resolution reading `GameEngine` state on-chain; Oracle markets via `outcomeOverride`.
- Real parimutuel settlement (winners split losers minus rake), card minting with provenance, deterministic Arena simulation with `AbilityEvent[]` traces, and matchmaking by G-tier with ELO.

---

## UX decisions made (worth a design discussion)

- **owner = strategist / AI = operator** is surfaced explicitly on the dashboard (two labeled cards next to the autopilot switch), and manual actions are *disabled while AI operates* to dramatize the division of labor. Whether manual actions should instead *coexist* with autopilot (override per-turn) is an open product question (roadmap E7.3 "take over a turn").
- **Currency distinction is load-bearing in the visual language**: ore = amber `◆` with an amber glow and always shows the `/1000` cap; G = teal `⬡`. They never share a color anywhere.
- **Parimutuel made tangible**: placing a bet visibly shifts the odds bars, reinforcing "your bet moves the odds" rather than a fixed-price book.
- **Gasless is repeated, not stated once**: it appears on the hero, the onboarding relay panel, the create step, every action toast, and the quick-actions footer — because "no gas / no signature" is the core onboarding unlock.
- **AgentMind as connective tissue**: betting, steering, building, raiding, and autopilot all write to the same log, so the "I own a thinking AI" fantasy persists across screens.
- **Self-resolving vs Oracle** markets are color-coded (teal vs violet) and each shows its literal resolution rule, to make the "better than Polymarket because the chain settles it" point concrete.
- Skipped the optional **zh/en toggle** to keep the single-file demo lean and avoid translation-state risk; the copy is English-only. Easy to add later.
- The "world map" is a stylized 7-hex cluster, not a full radius-100 grid render — enough to communicate territory without a heavy canvas dependency in a file:// demo.

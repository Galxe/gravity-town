# Gravity Town Demo — Consolidated UX / Logic / Fidelity Review

**Target:** `demo/index.html` (1618 lines) + `demo/interaction-logic.json` (executable spec mirror)
**Date:** 2026-06-13
**Reviewers consolidated:** 4 dimensions — Core-Flow Completeness, Contract/Mechanics Fidelity, Usability/Visual/Microcopy, Interaction-Logic/State-Model Correctness.

---

## Executive Summary

The demo is a polished, single-file mock that genuinely walks the **front half** of the intended journey: spectate (no wallet) → onboard (4-step, gasless) → dashboard (owner/operator autopilot "aha") → browse markets → place a bet → buy an Arena card. The two-currency model (ore ◆ vs G ⬡), the headline economy constants, the parimutuel math, the tier thresholds, and the gasless/operator-relay framing are all faithful to the contracts and internally consistent.

The journey **breaks at the back half of the loop**. Two independent reviewers (Core-Flow and Interaction-Logic) flag the same structural gap as a **blocker**: the spec defines a full `resolveMarket` lifecycle (and three flows that exercise it) but the demo has **no resolution path at all** — a user's bet can never settle, and the only "receipt" shown is a hardcoded constant for a market the user never bet on. Secondary structural gaps: bench-overflow cards vanish into an un-rendered `inventory` (lost G), and the Arena unit roster is fictional vs the on-chain `UnitCatalog`.

There is also a class of **spec-vs-demo divergence**: the spec elevates several **UI-level guards** (bet bounds, autopilot lock, agent-null) into engine **preconditions** the demo handlers do not actually enforce. The spec is internally consistent and the test engine passes 20/20 against it, but the demo HTML would accept out-of-range / autopilot-locked actions if driven programmatically. These are demo-code TODOs, not spec bugs.

**Verdict: NOT yet a complete walkable loop.** Front half is shippable; the bet→settle→payout arc and Arena bench-overflow recovery must be wired before the Phase 0→4 promise holds.

### Test Status

- Engine suite **20/20 green** (`node interaction.test.mjs`, node v18.19.0, no deps). 10 happy-path steps + 10 edge/error cases all pass against the spec.
- The spec's `resolveMarket` parimutuel math is verified by the suite: payout = 100 + floor(100/840×410) = **148**, credited to ore 92→240 under cap. Ore-cap clamp 990+42→1000 (32 wasted) verified. `tierFor` Bronze/Silver/Gold verified.
- **JSON was edited (doc-only) during this review (see "Fixes Applied").** Re-ran the suite after edits: **still 20/20 green** — no behavioral change, no re-run blocker. A re-run is advisable but not required.

---

## Findings by Severity (deduplicated across reviewers)

### BLOCKER

| ID | Dimension | Where | Problem | Fix |
|----|-----------|-------|---------|-----|
| **B1** (CF-01 + IL-01) | Core-Flow + Interaction-Logic | `resolveMarket` action (json:430-459); flows core-full-operation/edge-double-resolve/edge-resolve-before-close; `index.html` Markets/Positions | **No market-resolution path exists in the demo.** Spec defines `resolveMarket` + 3 flows; demo markets have no `resolved`/`winner`/`resolveAt`, no settle logic, no resolve affordance. The "RESOLVED · RECEIPT" panel renders a hardcoded `resolvedMarket` const (mkt-099) unrelated to the user's bet. The bet→close→payout→ore-credited arc — the core Phase-3 "aha" — cannot be walked. Spec also uses ops (`settlePositions`, `failsPre`) not declared in its own DSL. | Add a demo resolve affordance (e.g. "Force resolve (demo)" on the open position) that sets `resolved/winner` + a `settlePositions` reducer crediting ore-cap-clamped parimutuel payout, and surface the user's own settled receipt. Either implement, or scope the spec down to display-only and drop the 3 resolve flows + add the missing ops to the DSL. |

### HIGH

| ID | Dimension | Where | Problem | Fix |
|----|-----------|-------|---------|-----|
| **H1** (U1) | Usability | `index.html:1333-1334` (Arena), `:902-911` (MyAgent) | **Rules-of-Hooks violation / runtime crash.** `Arena()` does `if(!s.agent) return <NeedAgent/>` *before* `useState('shop')`. Creating an agent while `#/arena` is mounted changes hook count → React "Rendered fewer hooks than expected" → Arena screen can crash. Same pattern in MyAgent. | Move all `useState`/`useMemo`/`useEffect` to the top, unconditionally; put the `if(!s.agent) return` after them. Guard the autopilot effect body instead of returning before the hook. |
| **H2** (CF-03 + IL-05) | Core-Flow + Interaction-Logic | `index.html:1413,1472` (buyCard/buyListing); `placeOnBench` action (json:514-529) | **Bench-overflow cards (and the G spent) silently disappear.** When the 5-slot bench is full, bought cards push to `inventory`, which is **never rendered anywhere**. Spec's `placeOnBench` (move inventory card into a slot) has **no UI surface**, so there is no recovery — a 6th card is lost into a black hole. | Render an Inventory strip in the Bench tab with a "place into empty slot" control (implements `placeOnBench`), or block/queue purchases when bench is full with a clear message. Reconcile spec bench model (indexed slots) with demo (append-only array). |
| **H3** (IL-02) | Interaction-Logic | `placeBet` (json:409-414); `index.html:1127-1143` | **Bet bounds (10-500) are UI-only, not enforced in logic.** Demo `placeBet` checks only `s.ore < amt`; the 10/500 range lives solely in the slider min/max. A programmatic 5- or 600-ore bet would be accepted, contradicting the `between` precondition the spec asserts (and the two expectError flows). | Add `if(amt < C.BET_MIN || amt > C.BET_MAX){ toast(...); return; }` to demo `placeBet` so logic matches spec. (Spec is correct; **demo** is the gap.) |
| **H4** (IL-03) | Interaction-Logic | harvest/build/raid (json:362-396); `index.html:927-929` | **Autopilot block is a UI `disabled` attribute, not an engine precondition.** Manual handlers contain no `if(s.autopilot) return`; they would mutate ore/buildings/hexes if invoked under autopilot. Spec models it as a hard precondition (edge-manual-action-while-autopilot-on, expectError). | Add `if(s.autopilot) return;` inside harvest/build/attack so the precondition is real, OR document in the spec that the block is UI-level. |
| **H5** (IL-04) | Interaction-Logic | `index.html:966` (autopilot toggle) | **Stale-closure bug: inverted toast/log.** Handler calls `setAutopilot(v=>!v)` then reads the OLD `s.autopilot` for the toast/mind text, so the user sees "Autopilot OFF" when turning it **ON** and vice versa. (Separately, the autopilot tick mutates ore +18/buildings, an unmodeled effect that can drift pinned numbers — core flow correctly toggles OFF early.) | `const next = !s.autopilot;` then use `next` for `setAutopilot(next)` and the toast/log text. |
| **H6** (U2) | Usability | `index.html:1122-1125, 1244` | **"EST. PAYOUT" presents a hard number for a value that is unknowable at bet time.** Parimutuel payout depends on all bets placed before close; the estimate freezes pools the instant after the user bets, with no "snapshot" caveat. Single most trust-sensitive number in the product. | Relabel to "EST. PAYOUT IF POOLS FROZE" or add a caption: "Estimate at current pool — final payout depends on bets before close." Consider showing implied probability. |

### MEDIUM

| ID | Dimension | Where | Problem | Fix |
|----|-----------|-------|---------|-----|
| **M1** (CF-02 + CF-08) | Core-Flow | `index.html:236-244,1300-1321` | Open position is a **dead-end** — never cancels/resolves/settles — while the static receipt below it (stake 120→payout 198) is an unrelated mock that no spec rule produces. Resolves with B1. | Tie the receipt to the user's own settled position (after B1), or clearly label it "illustrative prior round". |
| **M2** (CF-04 + IL-06) | Core-Flow + Interaction-Logic | `index.html:1436` (ArenaBench `submitted` local state) | `submitBench` queued status is **component-local `useState`** — switching Arena tabs unmounts it and the "queued" badge vanishes, losing the only matchmaking signal. Spec models global `matchmaking.{submitted,tier}`. Battle Replay is also fully canned, not linked to the submitted bench. | Lift `submitted`/`tier` into the Store (mirror spec `matchmaking.*`) so the badge survives tab switches; loosely reference the submitted bench in the replay. |
| **M3** (CF-05) | Core-Flow | `index.html:1007` (Bet quick action) | The "🎲 Bet" button shares `disabled={manualLocked}`, so it greys out whenever autopilot is ON (the default). But `placeBet` is **not** autopilot-gated in the spec; this makes the primary path into Phase 3 unreachable from the dashboard in the default state. | Remove `disabled={manualLocked}` from the Bet button (it is navigation, not a gated action), or move it out of the QUICK ACTIONS group. |
| **M4** (CF-06) | Core-Flow | `index.html:726,744` (Onboard) | **No idempotent re-entry guard.** Spec `createAgent` requires `isNull user.agentId`; demo Onboard renders Step 1 unconditionally and `doCreate`→`spawnAgent` would overwrite an existing agent (reset ore to 200). | If `s.agent` exists, short-circuit Onboard to a "You already own {name} → Go to dashboard" panel. |
| **M5** (CMF-03) | Contract Fidelity | `index.html:684,929` | **"30%" loot copy vs flat +54 implementation.** Contract loots 30% of defender pool; demo credits a flat +54 ore but the drama/AgentMind copy says "Looted 30% ore". The flat number can't equal 30% of anything (no defender pool modeled). JSON is internally consistent (`MANUAL_RAID_LOOT_ORE=54`); the **HTML copy** is the mismatch. | Change the narrative copy to "looted ore from defender" (drop the literal "30%"), or model a defender pool. |
| **M6** (U3) | Usability | `index.html:1120-1125,224` | **Oracle rake not applied in the bet estimate.** Oracle markets take a 10% rake (prose at :224), but the payout estimate uses the same zero-rake formula for both market types, overstating Oracle payouts. | Branch the estimate by `m.type` (subtract 10% of the losing-pool share for ORACLE); show a "fee: 10% (oracle) / 0%" line. |
| **M7** (U4) | Usability | `index.html:1246,1128-1129` | Bet button is `disabled` for insufficient ore with **no inline reason**; the "Not enough ore" toast is unreachable because the button is disabled. Slider max (500) can exceed balance with no clamp. | Keep the button enabled-looking and show inline red helper "Need ◆{amt}, you have ◆{ore}". Optionally cap slider max at `min(500, ore)`. |
| **M8** (U5) | Usability | `index.html:976-1007` | When autopilot is ON (default), **all four manual quick actions are hard-disabled** — a first-run owner sees four greyed buttons reading as "product is locked" rather than "the AI has this". (README flags this as an open question.) | Either let manual actions be a per-turn override ("Take this turn"), or replace the dead buttons with a single "Pause autopilot to act manually" toggle. |
| **M9** (U6) | Usability/A11y | `index.html:480-484,1146,1374` | Nav/tabs are click-only `<a>` with no `href`/`role`/`tabIndex`/keyboard handler — not focusable or screen-reader-operable. Market modal has no `role=dialog`/`aria-modal`, no Escape, no focus trap/restore. | Make nav/tabs real `<button>`/`<a href>`; add `role=tab`/`aria-selected`. Add `role=dialog aria-modal`, Escape handler, focus management, `aria-label=Close` to the modal. |
| **M10** (U7) | Usability/A11y | `index.html:799-805,1227,1211` | Form labels are visual-only (no `htmlFor`/`id`); range slider and YES/NO toggle lack accessible names. | Add `htmlFor`/`id` pairs; `aria-label` on the slider; `aria-pressed` on YES/NO. |
| **M11** (U8) | Usability/A11y | `index.html:38-39` + global | `text-steel-dim` (#5a6b8c on #06080f ≈ 4.0:1) is below WCAG AA 4.5:1 and used for load-bearing 9-11px microcopy (wallet, score formula, tiers). | Bump `steel-dim` to ~#7d8fb3 for sub-14px text, or raise the smallest caption sizes. |
| **M12** (IL-07) | Interaction-Logic | `edge-ore-cap-clamp-wasted` _doc (json:805) | The flow's _doc claims the cap clamp "governs raid loot, build refunds, and market payout credits" — but build has no refund and (per B1) payouts don't exist in the demo, so those claims are unverifiable. The harvest assertions themselves are correct. | Keep the harvest flow; flag the build-refund / payout-clamp claims as aspirational until B1 is implemented. |
| **M13** (IL-08) | Interaction-Logic | depositG/buyCard/roll (json) vs `index.html:1368,1409,1420` | `notNull agent` is enforced by screen routing (`requiresAgent:true` → `<NeedAgent/>`), not by per-action handlers. Spec's per-action precondition overstates the engine guarantee (same pattern as H4). | Document that Arena agent-existence is screen-level gating, or add explicit handler guards. |

### LOW

| ID | Dimension | Where | Problem | Fix |
|----|-----------|-------|---------|-----|
| **L1** (CMF-01/02) | Contract Fidelity | `index.html:247-254` vs `UnitCatalog.sol:24-137` | **Fictional Arena roster.** Demo's 12-unit roster (Sentinel/Wraith/Forgeling/...) does not match the real on-chain units (Mineworker/Stoneguard/.../Wraith 5/5 cost6). The only shared name, "Wraith", conflicts (demo 3/2 cost4 vs chain 5/5 cost6). README overstates this as "mirrors CardLedger". | **JSON fixed** (see below — `card` entity `_doc` now states names/stats are illustrative). For the demo: replace roster with real units, or add a README note. |
| **L2** (CMF-04) | Contract Fidelity | `index.html:929` | Combat is hardcoded 55% win, independent of arsenals/ore, while landing copy claims "Tullock contest p=0.64". Acceptable as a mock; flagged for completeness. | Optionally compute `p = attackPower/(attackPower+defensePower)` from mock values so the brief and the roll agree. |
| **L3** (CMF-05) | Contract Fidelity | `index.html:158,1516` | ELO_K=32 and replay "+16" can read as contradictory; both correct (16 = K×(1−0.5) at equal ELO). | Add a one-line note that +16 is the equal-ELO case of the K=32 update. No code change. |
| **L4** (CMF-06) | Contract Fidelity | `index.html:927` | Cap-overflow is clamped silently (no toast) on manual harvest, so the "overflow wasted" rule is invisible to users — unlike the JSON edge flow that tests it. | When a credit is clamped at 1000, fire a distinct toast "+X ore wasted — pool at cap". |
| **L5** (U9) | Usability | `index.html:622-1249` | Gasless message is strong but over-repeated and uses crypto jargon ("operator-relay", "no signature needed") for a non-crypto audience. | Keep one plain-language promise prominent; demote technical phrasing to a tooltip. |
| **L6** (U10) | Usability | `index.html:1024,853` | AgentMind log shows "idle/empty" for ~3.8s while the pill says "thinking…" on a fresh dashboard (contradictory first impression). No error/failure state anywhere. | Seed 1-2 mind lines on autopilot-on / run the first tick immediately. Add one illustrative error toast variant. |
| **L7** (U11) | Usability/Responsive | `index.html:498,1038` | Mobile hides ore/G balances with no fallback (a betting user on mobile can't see ore). Territory mini-map uses fixed-px absolute positioning that doesn't scale. | Add a compact ore/G chip to the mobile header / bet panel. Make the hex cluster responsive or hide it under a small breakpoint. |
| **L8** (U12) | Usability/Microcopy | `index.html:956,1363,1600` | "G (real-money)" / "real-money on-ramp" as a standing label implies G is fiat/cashable with no withdraw UI to substantiate it — regulatory/expectation risk. | Soften to "G (premium balance)" / "purchased credits"; reserve "real-money" for the deposit affordance only. |
| **L9** (IL-09) | Interaction-Logic | `index.html:1135-1139` vs `position` entity (json:118-129) | **Entity-shape divergence.** Demo position uses `mktId`/`closeAt`/`poolAt` + random id; spec uses `marketId`/`resolveAt` + `pos-$marketId-$side` (non-unique under repeated same-side bets) and adds `settled`/`payout` the demo lacks. A consumer following spec paths would read `undefined`. | **JSON partly fixed** (position `_doc` now documents the divergence + collision risk). Full fix: reconcile field names / add settled+payout (with B1). |
| **L10** (IL-10) | Interaction-Logic | `index.html:310,1420` | `roll` is a pure G-sink — the shop roster is a frozen const, so rolling has zero observable effect besides spending G. Spec _doc honestly notes this; flagged as a degenerate interaction. | Add a note that roll is intentionally a no-op reroll in the demo, or disable/hide it. |
| **L11** (IL-11) | Interaction-Logic | `index.html:314,1526` | ELO lives in top-level store (`s.elo`), not on `agent`; the only mutation is BattleReplay hardcoding `setElo(1016)` regardless of outcome, decoupled from `submitBench`. Spec puts `elo` on the agent. | Note ELO is store-level + illustratively bumped, or move it onto the agent and compute from `ELO_WIN_DELTA`. |
| **L12** (CF-07) | Core-Flow | markets/arena/me | No in-context back-path/next-step CTA between phases; the journey leans entirely on the persistent nav tabs. | Add lightweight next-step CTAs ("Place your first bet →", "Try the Arena →") so the Phase 0→4 path is self-guiding. |

---

## Fixed Now vs Follow-Up

### Fixed now (this review — JSON spec, doc-only, low-risk, tests still 20/20)

1. **L1 / CMF-01/02** — `card` entity `_doc` rewritten: explicitly states the demo's 6-card roster uses illustrative placeholder names+stats and does NOT match the on-chain `UnitCatalog` (lists the 12 real units), and that only the 12-count, 3-6 G cost band, 1 G roll, and ability-trigger taxonomy are pinned. `unitType` field description updated to "demo placeholder name; NOT a literal UnitCatalog unit". This removes the overstated-fidelity claim without touching any pinned number or test.
2. **L9 / IL-09** — `position` entity `_doc` now documents the entity-shape divergence (demo uses `mktId`/`closeAt`/`poolAt`+random id vs spec `marketId`/`resolveAt`) and the `pos-$marketId-$side` id-collision risk under repeated same-side bets.
3. **listing entity** — added the `achievementTag` field (with description) to the `listing` entity, which the actual `initialState.listings` data (lst-3, lst-4) already carries but the entity definition omitted — a self-contained internal spec inconsistency.

All three are documentation-accuracy fixes inside `interaction-logic.json`. They change no constants, no preconditions, no effects, and no flow assertions. The test suite was re-run after the edits and remains **20/20 green**.

### Follow-up — demo HTML TODOs (NOT changed here, by instruction)

See `demoTodos` in the structured output. Highest priority:

1. **B1** — Implement market resolution + settlement (or scope the spec down). The single blocker.
2. **H1** — Fix Rules-of-Hooks ordering in `Arena()` and `MyAgent()` (potential runtime crash).
3. **H2** — Render `inventory` + a `placeOnBench` control so bench-overflow cards (and G) aren't lost.
4. **H3/H4/H5** — Add real bet-bounds + autopilot guards inside the demo handlers; fix the inverted autopilot toast (stale closure).
5. **H6/M6/M7** — Payout-estimate caveat, Oracle-rake branch, and inline insufficient-ore helper.
6. Remaining M/L items (idempotent Onboard guard, lifted matchmaking state, a11y semantics/contrast, loot copy, mobile balances, microcopy).

---

## Core Full-Operation Flow — Walkthrough Verdict

Phase 0→4 (`core-full-operation`), walked click-by-click against the demo:

| Phase | Step | Walkable in demo? |
|-------|------|-------------------|
| 0 Spectate | Landing: scoreboard, drama ticker, featured markets, AgentMind peek, browse markets w/o wallet | **Yes** |
| 1 Onboard | connectWallet → name/personality/archetype → createAgent (gasless, 7 hex / 200 ore) | **Yes** (but no idempotent re-entry guard — M4) |
| 2 My-Agent / Autopilot | dashboard, toggleAutopilot, setGoal, manual harvest/build | **Yes** (but Bet quick-action wrongly greyed under autopilot — M3; manual guards are UI-only — H4) |
| 3a Bet | open market, place ore bet, pool/odds shift | **Yes** to place; **NO** to resolve |
| 3a Settle | resolveMarket → parimutuel payout credited to ore → receipt | **NO — does not exist (B1).** Position frozen forever; receipt is an unrelated mock. |
| 3b Arena | depositG, buyCard, submitBench | **Yes** for the happy path; **bench-overflow loses cards (H2)**, queued state doesn't persist (M2), battle replay is canned (M2) |
| 4 Retention | settled payout / come-back hook | **Broken** — depends on B1; the place-bet→get-paid→return loop never closes |

**Verdict:** The flow is **walkable up to the resolve/settle boundary and not beyond.** The spec describes a complete Phase 0→4 loop and the test engine proves the spec is internally consistent, but the **demo cannot actually demonstrate the bet→settle→payout arc or recover an overflow Arena card.** The front half is genuinely shippable; the loop is **not complete** until B1 (and ideally H2) are wired into the demo.

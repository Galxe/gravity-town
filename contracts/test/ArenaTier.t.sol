// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/AgentRegistry.sol";
import "../src/LocationLedger.sol";
import "../src/EvaluationLedger.sol";
import "../src/GameEngine.sol";
import "../src/ArenaEngine.sol";
import "../src/GTreasury.sol";
import "../src/CardLedger.sol";

/// @title ArenaTier.t.sol — Bronze/Silver/Gold tier matchmaking + withdraw.
/// @notice Pins the tier semantics: thresholds, pool routing, submit-time lock,
///         withdraw rules, tier-scoped matchmaking, and the tunable thresholds.
contract ArenaTierTest is Test {
    AgentRegistry registry;
    LocationLedger locationLedger;
    EvaluationLedger evalLedger;
    GameEngine engine;
    ArenaEngine arena;
    GTreasury treasury;
    CardLedger cards;

    address operator = address(0xBEEF);

    uint8[4] defaultStats = [uint8(5), 5, 5, 5];
    uint8 constant MINEWORKER = 1; // type 1 — cheapest unit, gives a non-empty bench

    function setUp() public {
        AgentRegistry registryImpl = new AgentRegistry();
        registry = AgentRegistry(address(new ERC1967Proxy(
            address(registryImpl), abi.encodeCall(AgentRegistry.initialize, (operator))
        )));

        LocationLedger locImpl = new LocationLedger();
        locationLedger = LocationLedger(address(new ERC1967Proxy(
            address(locImpl), abi.encodeCall(LocationLedger.initialize, (address(registry)))
        )));

        EvaluationLedger evalImpl = new EvaluationLedger();
        evalLedger = EvaluationLedger(address(new ERC1967Proxy(
            address(evalImpl), abi.encodeCall(EvaluationLedger.initialize, (address(registry)))
        )));

        GameEngine engineImpl = new GameEngine();
        engine = GameEngine(address(new ERC1967Proxy(
            address(engineImpl), abi.encodeCall(GameEngine.initialize, (address(registry), address(locationLedger)))
        )));
        registry.addOperator(address(engine));
        engine.setEvaluationLedger(address(evalLedger));

        GTreasury treasuryImpl = new GTreasury();
        treasury = GTreasury(address(new ERC1967Proxy(
            address(treasuryImpl), abi.encodeCall(GTreasury.initialize, (address(registry)))
        )));

        CardLedger cardsImpl = new CardLedger();
        cards = CardLedger(address(new ERC1967Proxy(
            address(cardsImpl), abi.encodeCall(CardLedger.initialize, (address(registry), address(treasury)))
        )));

        ArenaEngine arenaImpl = new ArenaEngine();
        arena = ArenaEngine(address(new ERC1967Proxy(
            address(arenaImpl),
            abi.encodeCall(ArenaEngine.initialize, (
                address(registry), address(engine), address(evalLedger),
                address(treasury), address(cards)
            ))
        )));
        registry.addOperator(address(arena));
        registry.addOperator(address(cards));
        cards.setArenaEngine(address(arena));
    }

    // ──────────────────── helpers ────────────────────

    uint256 _n;
    function _agent() internal returns (uint256 id) {
        address owner = address(uint160(0x1000 + ++_n));
        vm.prank(owner);
        (id, ) = engine.createAgent(string.concat("H", vm.toString(_n)), "x", defaultStats, owner);
    }

    /// Create an agent, fund it with `g` G, put one unit on the bench, and submit.
    function _readyAndSubmit(uint256 g) internal returns (uint256 id) {
        id = _agent();
        treasury.fundAgentG(id, g);
        vm.startPrank(registry.agentOwner(id));
        uint256 cardId = arena.buy(id, MINEWORKER); // buy mints to inventory…
        arena.placeCard(id, cardId, 0);             // …placeCard puts it on the bench
        arena.submit(id);
        vm.stopPrank();
    }

    function _submit(uint256 id) internal { vm.prank(registry.agentOwner(id)); arena.submit(id); }
    function _withdraw(uint256 id) internal { vm.prank(registry.agentOwner(id)); arena.withdrawSubmission(id); }

    // ══════════════════════════════════════════════════════════
    //                _tierFor threshold boundaries
    // ══════════════════════════════════════════════════════════

    function test_tierFor_thresholds() public {
        uint256 a = _agent();
        assertEq(uint8(arena._tierFor(a)), uint8(ArenaEngine.Tier.Bronze), "0 G -> Bronze");

        treasury.fundAgentG(a, 99);
        assertEq(uint8(arena._tierFor(a)), uint8(ArenaEngine.Tier.Bronze), "99 -> Bronze");
        treasury.fundAgentG(a, 1); // 100
        assertEq(uint8(arena._tierFor(a)), uint8(ArenaEngine.Tier.Silver), "100 -> Silver");
        treasury.fundAgentG(a, 899); // 999
        assertEq(uint8(arena._tierFor(a)), uint8(ArenaEngine.Tier.Silver), "999 -> Silver");
        treasury.fundAgentG(a, 1); // 1000
        assertEq(uint8(arena._tierFor(a)), uint8(ArenaEngine.Tier.Gold), "1000 -> Gold");
    }

    function test_tierStates_batches_tier_and_balance() public {
        uint256 b = _agent(); treasury.fundAgentG(b, 50);
        uint256 s = _agent(); treasury.fundAgentG(s, 500);
        uint256 g = _agent(); treasury.fundAgentG(g, 5000);

        uint256[] memory ids = new uint256[](3);
        ids[0] = b; ids[1] = s; ids[2] = g;
        (uint8[] memory tiers, uint256[] memory bals) = arena.tierStates(ids);

        assertEq(tiers[0], uint8(ArenaEngine.Tier.Bronze));
        assertEq(tiers[1], uint8(ArenaEngine.Tier.Silver));
        assertEq(tiers[2], uint8(ArenaEngine.Tier.Gold));
        assertEq(bals[0], 50);
        assertEq(bals[1], 500);
        assertEq(bals[2], 5000);
    }

    function test_tierStates_zero_balance_when_gTreasury_unset() public {
        ArenaEngine bare = ArenaEngine(address(new ERC1967Proxy(
            address(new ArenaEngine()),
            abi.encodeCall(ArenaEngine.initialize, (address(registry), address(engine), address(evalLedger), address(0), address(0)))
        )));
        uint256 a = _agent(); treasury.fundAgentG(a, 5000);
        uint256[] memory ids = new uint256[](1);
        ids[0] = a;
        (uint8[] memory tiers, uint256[] memory bals) = bare.tierStates(ids);
        assertEq(tiers[0], uint8(ArenaEngine.Tier.Bronze)); // no gTreasury -> Bronze
        assertEq(bals[0], 0);                               // and 0 balance
    }

    function test_tierFor_bronze_when_gTreasury_unset() public {
        // Fresh arena with no gTreasury wired -> everyone Bronze (graceful: arena still runs unwired).
        ArenaEngine bare = ArenaEngine(address(new ERC1967Proxy(
            address(new ArenaEngine()),
            abi.encodeCall(ArenaEngine.initialize, (address(registry), address(engine), address(evalLedger), address(0), address(0)))
        )));
        uint256 a = _agent();
        treasury.fundAgentG(a, 5000);
        assertEq(uint8(bare._tierFor(a)), uint8(ArenaEngine.Tier.Bronze));
    }

    // ══════════════════════════════════════════════════════════
    //                submit routes to the right tier pool
    // ══════════════════════════════════════════════════════════

    function test_submit_routes_to_tier_pools() public {
        uint256 bronze = _readyAndSubmit(50);
        uint256 silver = _readyAndSubmit(500);
        uint256 gold   = _readyAndSubmit(5000);

        assertEq(arena.tierPopulation(ArenaEngine.Tier.Bronze), 1, "bronze pop");
        assertEq(arena.tierPopulation(ArenaEngine.Tier.Silver), 1, "silver pop");
        assertEq(arena.tierPopulation(ArenaEngine.Tier.Gold), 1, "gold pop");

        assertEq(uint8(arena.submittedTier(bronze)), uint8(ArenaEngine.Tier.Bronze));
        assertEq(uint8(arena.submittedTier(silver)), uint8(ArenaEngine.Tier.Silver));
        assertEq(uint8(arena.submittedTier(gold)), uint8(ArenaEngine.Tier.Gold));
        assertTrue(arena.isSubmitted(bronze) && arena.isSubmitted(silver) && arena.isSubmitted(gold));
    }

    // ══════════════════════════════════════════════════════════
    //                runMatchmaking is tier-scoped
    // ══════════════════════════════════════════════════════════

    function test_runMatchmaking_only_pairs_within_tier() public {
        // Two Silver, one Bronze. Running Silver pairs the two; Bronze untouched.
        uint256 s1 = _readyAndSubmit(500);
        uint256 s2 = _readyAndSubmit(500);
        uint256 b1 = _readyAndSubmit(50);

        uint256 made = arena.runMatchmaking(ArenaEngine.Tier.Silver);
        assertEq(made, 1, "one silver match");
        assertEq(arena.tierPopulation(ArenaEngine.Tier.Silver), 0, "silver pool drained");
        assertEq(arena.tierPopulation(ArenaEngine.Tier.Bronze), 1, "bronze untouched");

        assertGt(arena.activeMatchOf(s1), 0);
        assertGt(arena.activeMatchOf(s2), 0);
        assertEq(arena.activeMatchOf(b1), 0);
    }

    function test_runMatchmaking_single_agent_no_match() public {
        uint256 s1 = _readyAndSubmit(500);
        uint256 made = arena.runMatchmaking(ArenaEngine.Tier.Silver);
        assertEq(made, 0, "n<2 -> no match");
        assertEq(arena.tierPopulation(ArenaEngine.Tier.Silver), 1, "stays pooled");
        assertEq(arena.activeMatchOf(s1), 0);
    }

    // ══════════════════════════════════════════════════════════
    //        no double-matching across tier + legacy bucket
    // ══════════════════════════════════════════════════════════

    // A tier match drains the agents from the legacy ELO bucket, so the bucket
    // can't re-match them (and doesn't fill toward its cap as matches resolve).
    function test_tier_match_drains_legacy_bucket() public {
        uint256 a = _readyAndSubmit(500); // both Silver, both ELO 1000 -> bucket 5
        uint256 b = _readyAndSubmit(500);
        assertEq(arena.bucketSize(5), 2, "submit also seeded the legacy bucket");

        uint256 firstMatchId = arena.nextMatchId();
        arena.runMatchmaking(ArenaEngine.Tier.Silver);
        assertEq(arena.bucketSize(5), 0, "tier match drained the bucket");
        assertGt(arena.activeMatchOf(a), 0);
        assertGt(arena.activeMatchOf(b), 0);

        // Legacy bucket matchmaking now finds nobody -> no second match created.
        uint256 made = arena.runMatchmaking(uint16(5));
        assertEq(made, 0, "bucket has no un-matched ghosts");
        assertEq(arena.nextMatchId(), firstMatchId + 1, "exactly one match total");
    }

    // The guard also covers the reverse path: an agent matched by the legacy
    // bucket stays in its tier pool, but tier matchmaking skips it (activeMatchOf).
    function test_bucket_match_is_skipped_by_tier() public {
        uint256 a = _readyAndSubmit(500);
        uint256 b = _readyAndSubmit(500);

        arena.runMatchmaking(uint16(5)); // legacy bucket pairs them
        assertGt(arena.activeMatchOf(a), 0);
        // bucket path leaves them in the tier pool…
        assertEq(arena.tierPopulation(ArenaEngine.Tier.Silver), 2);

        // …but tier matchmaking must NOT re-pair already-matched ghosts.
        uint256 before = arena.nextMatchId();
        uint256 made = arena.runMatchmaking(ArenaEngine.Tier.Silver);
        assertEq(made, 0, "matched ghosts are skipped");
        assertEq(arena.nextMatchId(), before, "no extra match");
    }

    // ══════════════════════════════════════════════════════════
    //                withdrawSubmission
    // ══════════════════════════════════════════════════════════

    function test_withdraw_before_match_swap_pops() public {
        uint256 a = _readyAndSubmit(50);
        uint256 b = _readyAndSubmit(50);
        assertEq(arena.tierPopulation(ArenaEngine.Tier.Bronze), 2);

        _withdraw(a);
        assertEq(arena.tierPopulation(ArenaEngine.Tier.Bronze), 1, "one left");
        assertFalse(arena.isSubmitted(a));
        // b still present and consistent (swap-pop kept its index valid)
        assertTrue(arena.isSubmitted(b));
        _withdraw(b);
        assertEq(arena.tierPopulation(ArenaEngine.Tier.Bronze), 0);
    }

    function test_withdraw_reverts_when_in_active_match() public {
        uint256 a = _readyAndSubmit(50);
        uint256 b = _readyAndSubmit(50);
        arena.runMatchmaking(ArenaEngine.Tier.Bronze); // both now matched

        vm.prank(registry.agentOwner(a));
        vm.expectRevert(bytes("in active match"));
        arena.withdrawSubmission(a);

        // b too
        vm.prank(registry.agentOwner(b));
        vm.expectRevert(bytes("in active match"));
        arena.withdrawSubmission(b);
    }

    function test_withdraw_reverts_when_not_submitted() public {
        uint256 a = _agent();
        vm.prank(registry.agentOwner(a));
        vm.expectRevert(bytes("not submitted"));
        arena.withdrawSubmission(a);
    }

    // ══════════════════════════════════════════════════════════
    //                tier lock: fund mid-cycle doesn't move tier
    // ══════════════════════════════════════════════════════════

    function test_tier_locked_until_settle_then_recomputes() public {
        uint256 a = _readyAndSubmit(500);  // Silver
        uint256 b = _readyAndSubmit(500);  // Silver opponent (so we can settle)
        assertEq(uint8(arena.submittedTier(a)), uint8(ArenaEngine.Tier.Silver));

        // Fund a up to Gold territory mid-flight — tier must NOT change.
        treasury.fundAgentG(a, 10_000); // now 10_500
        assertEq(uint8(arena.submittedTier(a)), uint8(ArenaEngine.Tier.Silver), "locked at Silver");

        // A re-submit while pooled is idempotent — still Silver, no pool growth.
        _submit(a);
        assertEq(arena.tierPopulation(ArenaEngine.Tier.Silver), 2, "no dup submit");
        assertEq(uint8(arena.submittedTier(a)), uint8(ArenaEngine.Tier.Silver));

        // Match + settle releases the lock.
        uint256 made = arena.runMatchmaking(ArenaEngine.Tier.Silver);
        assertEq(made, 1);
        uint256 matchId = arena.activeMatchOf(a);
        arena.settleMatch(matchId);
        assertFalse(arena.isSubmitted(a), "lock released on settle");
        assertEq(arena.activeMatchOf(a), 0);

        // Re-submit recomputes from current G (10_500) -> Gold now.
        _submit(a);
        assertEq(uint8(arena.submittedTier(a)), uint8(ArenaEngine.Tier.Gold), "recomputed to Gold");
        assertEq(arena.tierPopulation(ArenaEngine.Tier.Gold), 1);
    }

    // ══════════════════════════════════════════════════════════
    //                setMatchmakingPeriod
    // ══════════════════════════════════════════════════════════

    function test_setMatchmakingPeriod_gates_rerun() public {
        arena.setMatchmakingPeriod(ArenaEngine.Tier.Silver, 60);
        _readyAndSubmit(500); // 1 agent -> run returns 0 but stamps lastRun

        arena.runMatchmaking(ArenaEngine.Tier.Silver);
        vm.expectRevert(bytes("rate limited"));
        arena.runMatchmaking(ArenaEngine.Tier.Silver);

        vm.warp(block.timestamp + 60);
        arena.runMatchmaking(ArenaEngine.Tier.Silver); // ok again, no revert
    }

    function test_default_period_is_30min() public {
        assertEq(arena.effectiveTierPeriod(ArenaEngine.Tier.Bronze), 1800, "default 30m");
        arena.setMatchmakingPeriod(ArenaEngine.Tier.Bronze, 60);
        assertEq(arena.effectiveTierPeriod(ArenaEngine.Tier.Bronze), 60, "override");
        arena.setMatchmakingPeriod(ArenaEngine.Tier.Bronze, 0);
        assertEq(arena.effectiveTierPeriod(ArenaEngine.Tier.Bronze), 1800, "reset to default");
    }

    function test_setMatchmakingPeriod_only_owner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        arena.setMatchmakingPeriod(ArenaEngine.Tier.Bronze, 60);
    }

    // ══════════════════════════════════════════════════════════
    //                setTierThresholds (review comment 1)
    // ══════════════════════════════════════════════════════════

    function test_tierThresholds_default_before_override() public {
        (uint256 silver, uint256 gold) = arena.tierThresholds();
        assertEq(silver, 100);
        assertEq(gold, 1000);
    }

    function test_setTierThresholds_retunes_tiers() public {
        uint256 a = _agent();
        treasury.fundAgentG(a, 150); // default → Silver
        assertEq(uint8(arena._tierFor(a)), uint8(ArenaEngine.Tier.Silver));

        // Raise the Silver floor above 150 → same agent now reads Bronze.
        arena.setTierThresholds(200, 2000);
        (uint256 silver, uint256 gold) = arena.tierThresholds();
        assertEq(silver, 200);
        assertEq(gold, 2000);
        assertEq(uint8(arena._tierFor(a)), uint8(ArenaEngine.Tier.Bronze));

        // Fund up to the new Gold floor → Gold.
        treasury.fundAgentG(a, 1850); // now 2000
        assertEq(uint8(arena._tierFor(a)), uint8(ArenaEngine.Tier.Gold));

        // Restore defaults explicitly.
        arena.setTierThresholds(100, 1000);
        (silver, gold) = arena.tierThresholds();
        assertEq(silver, 100);
        assertEq(gold, 1000);
    }

    function test_setTierThresholds_rejects_invalid() public {
        vm.expectRevert(bytes("bad thresholds"));
        arena.setTierThresholds(0, 1000);            // silver must be > 0
        vm.expectRevert(bytes("bad thresholds"));
        arena.setTierThresholds(1000, 1000);         // silver must be < gold
        vm.expectRevert(bytes("bad thresholds"));
        arena.setTierThresholds(2000, 1000);         // silver must be < gold
    }

    function test_setTierThresholds_only_owner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert();
        arena.setTierThresholds(200, 2000);
    }
}

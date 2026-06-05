// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/AgentRegistry.sol";
import "../src/GTreasury.sol";

/// @title GTreasuryWithdraw.t.sol — full-backing withdraw, surplus, mode interlock.
/// @notice Pins the invariant `balance ≥ totalOutstandingG` and the two
///         mutually-exclusive modes (faucet vs withdraw).
contract GTreasuryWithdrawTest is Test {
    AgentRegistry registry;
    GTreasury treasury;

    address operator = address(0xBEEF);
    address owner = address(this);
    address player = address(0x1234);
    address stranger = address(0x5678);

    uint8[4] stats = [uint8(5), 5, 5, 5];
    uint256 agentId;

    function setUp() public {
        AgentRegistry registryImpl = new AgentRegistry();
        registry = AgentRegistry(address(new ERC1967Proxy(
            address(registryImpl), abi.encodeCall(AgentRegistry.initialize, (operator))
        )));

        GTreasury treasuryImpl = new GTreasury();
        treasury = GTreasury(address(new ERC1967Proxy(
            address(treasuryImpl), abi.encodeCall(GTreasury.initialize, (address(registry)))
        )));

        agentId = registry.createAgent("Player", "withdrawer", stats, 1, player);
    }

    /// Flip from the default faucet mode (testnet) into withdraw mode (mainnet).
    function _enableWithdraw() internal {
        treasury.setFaucetEnabled(false);
        treasury.setWithdrawEnabled(true);
    }

    function _deposit(uint256 amount) internal {
        vm.deal(player, amount);
        vm.prank(player);
        treasury.depositG{value: amount}(agentId);
    }

    // ──────────────────── happy path ────────────────────

    function test_deposit_then_withdraw_roundtrip() public {
        _enableWithdraw();
        _deposit(100 ether);
        assertEq(treasury.gBalance(agentId), 100 ether);
        assertEq(treasury.totalOutstandingG(), 100 ether);
        assertEq(address(treasury).balance, 100 ether);

        vm.expectEmit(true, false, false, true);
        emit GTreasury.GWithdrawn(agentId, 100 ether, player);
        vm.prank(player);
        treasury.withdraw(agentId, 100 ether);

        assertEq(treasury.gBalance(agentId), 0);
        assertEq(treasury.totalOutstandingG(), 0);
        assertEq(address(treasury).balance, 0);
        assertEq(player.balance, 100 ether);
    }

    function test_partial_withdraw_keeps_remainder_backed() public {
        _enableWithdraw();
        _deposit(100 ether);

        vm.prank(player);
        treasury.withdraw(agentId, 30 ether);

        assertEq(treasury.gBalance(agentId), 70 ether);
        assertEq(treasury.totalOutstandingG(), 70 ether);
        assertEq(address(treasury).balance, 70 ether);
        assertEq(player.balance, 30 ether);
    }

    // ──────────────────── auth / bounds ────────────────────

    function test_withdraw_only_agent_owner() public {
        _enableWithdraw();
        _deposit(100 ether);

        vm.prank(stranger);
        vm.expectRevert("not agent owner");
        treasury.withdraw(agentId, 1 ether);
    }

    function test_withdraw_exceeds_balance_reverts() public {
        _enableWithdraw();
        _deposit(10 ether);

        vm.prank(player);
        vm.expectRevert("insufficient G");
        treasury.withdraw(agentId, 11 ether);
    }

    function test_withdraw_disabled_in_faucet_mode() public {
        // Default mode is faucet → withdraw must be off.
        treasury.fundAgentG(agentId, 100 ether); // faucet mint (no backing)
        vm.prank(player);
        vm.expectRevert("withdraw disabled");
        treasury.withdraw(agentId, 1 ether);
    }

    function test_withdraw_goes_to_msg_sender_only() public {
        // There is no "withdraw to arbitrary address" path — funds always land
        // on msg.sender (the agent owner). Verified by the roundtrip crediting `player`.
        _enableWithdraw();
        _deposit(5 ether);
        uint256 before_ = player.balance;
        vm.prank(player);
        treasury.withdraw(agentId, 5 ether);
        assertEq(player.balance, before_ + 5 ether);
    }

    // ──────────────────── surplus / rescue ────────────────────

    function test_spend_becomes_withdrawable_surplus() public {
        _enableWithdraw();
        _deposit(100 ether);

        // Model a buy/roll rake: operator spends part of the agent's G.
        vm.prank(operator);
        treasury.spendG(agentId, 40 ether, bytes32("arena_buy"));

        assertEq(treasury.totalOutstandingG(), 60 ether); // owed shrank
        assertEq(address(treasury).balance, 100 ether);   // native still here
        assertEq(treasury.surplusG(), 40 ether);          // 100 − 60

        address sink = address(0xCAFE);
        treasury.withdrawSurplus(sink, 40 ether);
        assertEq(sink.balance, 40 ether);
        assertEq(treasury.surplusG(), 0);
    }

    function test_spendG_survives_stale_totalOutstanding_after_upgrade() public {
        // Simulate an IN-PLACE upgrade of a pre-existing proxy: the agent still holds
        // gBalance, but the freshly-appended totalOutstandingG slot reads 0. The first
        // spend must floor at 0, not underflow-revert (which would brick the testnet).
        treasury.fundAgentG(agentId, 100 ether); // faucet mode (default)
        vm.store(address(treasury), bytes32(uint256(2)), bytes32(uint256(0))); // slot 2 = totalOutstandingG
        assertEq(treasury.totalOutstandingG(), 0);
        assertEq(treasury.gBalance(agentId), 100 ether);

        vm.prank(operator);
        treasury.spendG(agentId, 3 ether, bytes32("arena_buy")); // must NOT revert
        assertEq(treasury.gBalance(agentId), 97 ether);
        assertEq(treasury.totalOutstandingG(), 0, "floored, not underflowed");
    }

    function test_withdrawSurplus_blocked_in_faucet_mode() public {
        treasury.fundAgentG(agentId, 10 ether); // faucet mode (default)
        vm.expectRevert("withdraw disabled");
        treasury.withdrawSurplus(address(0xCAFE), 1);
    }

    function test_withdrawSurplus_cannot_touch_user_backing() public {
        _enableWithdraw();
        _deposit(100 ether); // all backed, surplus 0

        vm.expectRevert("exceeds surplus");
        treasury.withdrawSurplus(address(0xCAFE), 1 ether);
    }

    function test_withdrawSurplus_only_owner() public {
        _enableWithdraw();
        _deposit(100 ether);
        vm.prank(operator);
        treasury.spendG(agentId, 10 ether, bytes32("arena_buy"));

        vm.prank(stranger);
        vm.expectRevert(); // OwnableUnauthorizedAccount
        treasury.withdrawSurplus(stranger, 1 ether);
    }

    function test_market_trade_conserves_outstanding() public {
        _enableWithdraw();
        _deposit(100 ether);
        uint256 seller = registry.createAgent("Seller", "x", stats, 1, stranger);

        uint256 outstandingBefore = treasury.totalOutstandingG();
        // market_buy + market_sale at the same price = conserved.
        vm.prank(operator);
        treasury.spendG(agentId, 20 ether, bytes32("market_buy"));
        vm.prank(operator);
        treasury.creditG(seller, 20 ether, bytes32("market_sale"));

        assertEq(treasury.totalOutstandingG(), outstandingBefore, "trade conserves total");
        assertEq(treasury.gBalance(agentId), 80 ether);
        assertEq(treasury.gBalance(seller), 20 ether);
    }

    // ──────────────────── mode interlock ────────────────────

    function test_faucet_and_withdraw_mutually_exclusive() public {
        // Default: faucet on, withdraw off. Can't turn withdraw on yet.
        vm.expectRevert("faucet on");
        treasury.setWithdrawEnabled(true);

        // Turn faucet off → now withdraw can go on.
        treasury.setFaucetEnabled(false);
        treasury.setWithdrawEnabled(true);

        // With withdraw on, faucet can't be re-enabled.
        vm.expectRevert("withdraw on");
        treasury.setFaucetEnabled(true);
    }

    function test_faucet_blocked_in_withdraw_mode() public {
        _enableWithdraw();
        vm.expectRevert("faucet disabled");
        treasury.fundAgentG(agentId, 1 ether);
    }

    // ──────────────────── reentrancy ────────────────────

    function test_withdraw_reentrancy_blocked() public {
        ReentrantOwner attacker = new ReentrantOwner(treasury);
        uint256 aId = registry.createAgent("Re", "x", stats, 1, address(attacker));
        attacker.setAgent(aId);

        _enableWithdraw();
        vm.deal(address(attacker), 10 ether);
        attacker.deposit{value: 10 ether}();

        // The receive() hook re-enters withdraw; the guard reverts the inner call,
        // which bubbles up as a failed native transfer on the outer call.
        vm.expectRevert("transfer failed");
        attacker.attack(5 ether);

        // Nothing drained — the whole tx reverted.
        assertEq(treasury.gBalance(aId), 10 ether);
        assertEq(address(treasury).balance, 10 ether);
    }

    // ──────────────────── invariant (fuzz) ────────────────────

    function testFuzz_balance_always_covers_outstanding(uint96 dep, uint96 spend, uint96 wd) public {
        _enableWithdraw();
        uint256 d = bound(uint256(dep), 1, 1e30);
        _deposit(d);

        uint256 s = bound(uint256(spend), 0, d);
        if (s > 0) {
            vm.prank(operator);
            treasury.spendG(agentId, s, bytes32("arena_buy"));
        }
        uint256 maxW = treasury.gBalance(agentId);
        uint256 w = bound(uint256(wd), 0, maxW);
        if (w > 0) {
            vm.prank(player);
            treasury.withdraw(agentId, w);
        }

        // The core full-backing invariant, after any deposit/spend/withdraw mix.
        assertGe(address(treasury).balance, treasury.totalOutstandingG());
    }
}

/// @dev Malicious agent owner that re-enters withdraw from its receive hook.
contract ReentrantOwner {
    GTreasury private treasury;
    uint256 private agentId;
    bool private entered;

    constructor(GTreasury _t) { treasury = _t; }
    function setAgent(uint256 a) external { agentId = a; }
    function deposit() external payable { treasury.depositG{value: msg.value}(agentId); }
    function attack(uint256 amount) external { treasury.withdraw(agentId, amount); }

    receive() external payable {
        if (!entered) {
            entered = true;
            treasury.withdraw(agentId, 1); // re-entry → blocked by guard
        }
    }
}

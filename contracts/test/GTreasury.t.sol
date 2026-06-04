// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/AgentRegistry.sol";
import "../src/GTreasury.sol";

contract GTreasuryTest is Test {
    AgentRegistry registry;
    GTreasury treasury;

    address operator = address(0xBEEF);
    address owner = address(this);
    address nonOperator = address(0xBAD);

    function setUp() public {
        AgentRegistry registryImpl = new AgentRegistry();
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(AgentRegistry.initialize, (operator))
        );
        registry = AgentRegistry(address(registryProxy));

        GTreasury treasuryImpl = new GTreasury();
        ERC1967Proxy treasuryProxy = new ERC1967Proxy(
            address(treasuryImpl),
            abi.encodeCall(GTreasury.initialize, (address(registry)))
        );
        treasury = GTreasury(address(treasuryProxy));
    }

    function test_owner_can_fund_agent_g() public {
        vm.expectEmit(true, false, false, true);
        emit GTreasury.GFunded(7, 500, owner);

        treasury.fundAgentG(7, 500);

        assertEq(treasury.gBalance(7), 500);
    }

    function test_operator_can_spend_and_credit_g() public {
        treasury.fundAgentG(7, 100);

        vm.prank(operator);
        vm.expectEmit(true, false, false, true);
        emit GTreasury.GSpent(7, 30, bytes32("arena_buy"));
        treasury.spendG(7, 30, bytes32("arena_buy"));

        vm.prank(operator);
        vm.expectEmit(true, false, false, true);
        emit GTreasury.GCredited(7, 5, bytes32("arena_sell"));
        treasury.creditG(7, 5, bytes32("arena_sell"));

        assertEq(treasury.gBalance(7), 75);
    }

    function test_spend_reverts_when_balance_is_insufficient() public {
        treasury.fundAgentG(7, 10);

        vm.prank(operator);
        vm.expectRevert("insufficient G");
        treasury.spendG(7, 11, bytes32("arena_buy"));
    }

    function test_non_operator_cannot_spend_or_credit() public {
        treasury.fundAgentG(7, 100);

        vm.prank(nonOperator);
        vm.expectRevert("not operator");
        treasury.spendG(7, 1, bytes32("arena_buy"));

        vm.prank(nonOperator);
        vm.expectRevert("not operator");
        treasury.creditG(7, 1, bytes32("arena_sell"));
    }
}

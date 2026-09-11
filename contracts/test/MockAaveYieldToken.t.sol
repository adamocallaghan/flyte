// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { MockAaveYieldToken } from "../src/MockAaveYieldToken.sol";

contract MockAaveYieldTokenTest is Test {
    MockAaveYieldToken public token;

    address public alice = address(0x1111);
    address public bob = address(0x2222);

    uint256 public constant START_TIME = 1000;

    function setUp() public {
        vm.warp(START_TIME);
        token = new MockAaveYieldToken();
    }

    function test_InitialState() public view {
        assertEq(token.name(), "Flyte Aave Yield aUSDC");
        assertEq(token.symbol(), "aUSDC");
        assertEq(token.decimals(), 6);
        assertEq(token.totalSupply(), 0);
        assertEq(token.getNormalizedIncome(), token.RAY());
        assertEq(token.getAPY(), 3504);
        assertEq(token.UNDERLYING_ASSET_ADDRESS(), 0xaf88d065e77c8cC2239327C5EDb3A432268e5831);
        assertEq(token.POOL(), address(token));
    }

    function test_Faucet() public {
        vm.prank(alice);
        token.faucet();

        assertEq(token.balanceOf(alice), 5_000 * 1e6);
        assertEq(token.totalSupply(), 5_000 * 1e6);
        assertEq(token.scaledBalanceOf(alice), 5_000 * 1e6);
    }

    function test_YieldAccrual15Minutes() public {
        vm.prank(alice);
        token.faucet(); // 5,000 aUSDC nominal

        // Advance block timestamp by exactly 15 minutes (900 seconds)
        vm.warp(START_TIME + 900);

        // 1.00% yield on 5,000 = +50.00 aUSDC -> 5,050 aUSDC
        uint256 expectedBalance = 5_050 * 1e6;
        assertEq(token.balanceOf(alice), expectedBalance);
        assertEq(token.totalSupply(), expectedBalance);

        // Scaled balance should remain constant (Aave share invariant)
        assertEq(token.scaledBalanceOf(alice), 5_000 * 1e6);
        // Normalized income should be 1.01 RAY (1e27 + 1e25)
        assertEq(token.getNormalizedIncome(), 1.01e27);
    }

    function test_YieldAccrual30Minutes() public {
        vm.prank(alice);
        token.faucet();

        // Advance block timestamp by 30 minutes (1,800 seconds)
        vm.warp(START_TIME + 1800);

        // 2.00% yield on 5,000 = +100.00 aUSDC -> 5,100 aUSDC
        uint256 expectedBalance = 5_100 * 1e6;
        assertEq(token.balanceOf(alice), expectedBalance);
        assertEq(token.totalSupply(), expectedBalance);
        assertEq(token.getNormalizedIncome(), 1.02e27);
    }

    function test_NominalTransfer() public {
        vm.prank(alice);
        token.mint(alice, 1_000 * 1e6);

        // Advance 15 minutes (+1%) -> Alice has 1,010 aUSDC
        vm.warp(START_TIME + 900);
        assertEq(token.balanceOf(alice), 1_010 * 1e6);

        // Alice transfers nominal 500 aUSDC to Bob
        vm.prank(alice);
        token.transfer(bob, 500 * 1e6);

        assertApproxEqAbs(token.balanceOf(bob), 500 * 1e6, 2);
        assertApproxEqAbs(token.balanceOf(alice), 510 * 1e6, 2);
        assertEq(token.totalSupply(), 1_010 * 1e6);

        // Advance another 15 minutes (total 30 minutes elapsed = START_TIME + 1800)
        vm.warp(START_TIME + 1800);
        // Total elapsed: 1,800s -> Index is 1.02e27
        // Bob started with 500 nominal at t=900 (scaled: 500/1.01 = 495.0495)
        // At t=1800: Bob balance = 495.0495 * 1.02 = ~504.95 aUSDC (+1%)
        assertApproxEqAbs(token.balanceOf(bob), 505 * 1e6, 1e5); // within 0.1 USDC tolerance
        assertEq(token.totalSupply(), 1_020 * 1e6); // 1,000 * 1.02 = 1,020 total
    }

    function test_TransferFromWithAllowance() public {
        vm.prank(alice);
        token.faucet(); // 5,000 aUSDC

        // Alice approves Bob for 2,000 aUSDC
        vm.prank(alice);
        token.approve(bob, 2_000 * 1e6);
        assertEq(token.allowance(alice, bob), 2_000 * 1e6);

        // Bob executes transferFrom
        vm.prank(bob);
        token.transferFrom(alice, bob, 1_500 * 1e6);

        assertEq(token.balanceOf(bob), 1_500 * 1e6);
        assertEq(token.balanceOf(alice), 3_500 * 1e6);
        assertEq(token.allowance(alice, bob), 500 * 1e6);
    }

    function test_DustSweepMaxTransfer() public {
        vm.prank(alice);
        token.faucet();

        vm.warp(START_TIME + 3600); // 1 hour later
        uint256 fullBal = token.balanceOf(alice);

        // Transfer 100% of balance
        vm.prank(alice);
        token.transfer(bob, fullBal);

        assertEq(token.balanceOf(alice), 0);
        assertEq(token.scaledBalanceOf(alice), 0);
        assertEq(token.balanceOf(bob), fullBal);
    }

    function test_Burn() public {
        vm.prank(alice);
        token.faucet(); // 5,000

        vm.prank(alice);
        token.burn(alice, 2_000 * 1e6);

        assertEq(token.balanceOf(alice), 3_000 * 1e6);
        assertEq(token.totalSupply(), 3_000 * 1e6);
    }

    function test_ERC4626Views() public {
        token.mint(alice, 10_000 * 1e6);
        vm.warp(START_TIME + 900); // +1%

        assertEq(token.asset(), 0xaf88d065e77c8cC2239327C5EDb3A432268e5831);
        assertEq(token.totalAssets(), 10_100 * 1e6);
        assertEq(token.convertToAssets(10_000 * 1e6), 10_100 * 1e6);
        assertEq(token.convertToShares(10_100 * 1e6), 10_000 * 1e6);
    }

    function test_RevertInsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert(MockAaveYieldToken.InsufficientBalance.selector);
        token.transfer(bob, 100 * 1e6);
    }

    function test_RevertInsufficientAllowance() public {
        vm.prank(alice);
        token.faucet();

        vm.prank(bob);
        vm.expectRevert(MockAaveYieldToken.InsufficientAllowance.selector);
        token.transferFrom(alice, bob, 100 * 1e6);
    }
}

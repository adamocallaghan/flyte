// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { MockPriceOracle } from "../src/MockPriceOracle.sol";

contract MockPriceOracleTest is Test {
    MockPriceOracle public oracle;
    address public btc = address(0x1);
    address public user = address(0x2);

    function setUp() public {
        oracle = new MockPriceOracle();
    }

    function test_OwnerCanSetPrice() public {
        oracle.setPrice(btc, 65000e18);
        assertEq(oracle.getPrice(btc), 65000e18);
    }

    function test_RevertWhen_NonOwnerSetsPrice() public {
        vm.prank(user);
        vm.expectRevert(MockPriceOracle.OnlyOwner.selector);
        oracle.setPrice(btc, 65000e18);
    }

    function test_RevertWhen_PriceZero() public {
        vm.expectRevert(MockPriceOracle.InvalidPrice.selector);
        oracle.setPrice(btc, 0);
    }
}
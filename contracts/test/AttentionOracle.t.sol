// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { AttentionOracle } from "../src/AttentionOracle.sol";

contract AttentionOracleTest is Test {
    AttentionOracle public oracle;

    address public owner = address(this);
    address public reporter = address(0x10);
    address public alice = address(0x20);

    address public robotsAsset = address(0x101);
    address public gta6Asset = address(0x102);
    address public deepseekAsset = address(0x103);

    function setUp() public {
        oracle = new AttentionOracle();
        oracle.setReporter(reporter, true);

        oracle.registerMarket("ROBOTS", "Humanoid Robots", robotsAsset, 75.50e18);
        oracle.registerMarket("GTA6", "Grand Theft Auto VI", gta6Asset, 42.10e18);
        oracle.registerMarket("DEEPSEEK", "DeepSeek AI", deepseekAsset, 88.40e18);
    }

    function test_InitialMarketRegistration() public view {
        assertEq(oracle.getPrice(robotsAsset), 75.50e18);
        assertEq(oracle.getPrice(gta6Asset), 42.10e18);
        assertEq(oracle.getPrice(deepseekAsset), 88.40e18);

        AttentionOracle.AttentionData memory robotsData = oracle.getAttentionData("ROBOTS");
        assertEq(robotsData.name, "Humanoid Robots");
        assertEq(robotsData.indexPrice, 75.50e18);
        assertTrue(robotsData.isConfigured);
    }

    function test_ReporterCanUpdateAttentionReport() public {
        vm.prank(reporter);
        oracle.updateAttentionReport(
            "ROBOTS",
            78.25e18, // new index price
            65,       // sentiment +0.65
            85,       // velocity
            58000     // mentions
        );

        assertEq(oracle.getPrice(robotsAsset), 78.25e18);
        AttentionOracle.AttentionData memory data = oracle.getAttentionData("ROBOTS");
        assertEq(data.indexPrice, 78.25e18);
        assertEq(data.sentimentScore, 65);
        assertEq(data.socialVelocity, 85);
        assertEq(data.newsMentions24h, 58000);
    }

    function test_BatchUpdateAttentionReports() public {
        string[] memory ids = new string[](3);
        ids[0] = "ROBOTS";
        ids[1] = "GTA6";
        ids[2] = "DEEPSEEK";

        uint256[] memory prices = new uint256[](3);
        prices[0] = 72.10e18;
        prices[1] = 45.30e18;
        prices[2] = 92.50e18;

        int256[] memory sentiments = new int256[](3);
        sentiments[0] = 55;
        sentiments[1] = 72;
        sentiments[2] = 88;

        uint256[] memory velocities = new uint256[](3);
        velocities[0] = 80;
        velocities[1] = 60;
        velocities[2] = 95;

        uint256[] memory mentions = new uint256[](3);
        mentions[0] = 52000;
        mentions[1] = 49000;
        mentions[2] = 68000;

        vm.prank(reporter);
        oracle.batchUpdateAttentionReports(ids, prices, sentiments, velocities, mentions);

        assertEq(oracle.getPrice(robotsAsset), 72.10e18);
        assertEq(oracle.getPrice(gta6Asset), 45.30e18);
        assertEq(oracle.getPrice(deepseekAsset), 92.50e18);
    }

    function test_SetPrice_BackwardsCompatibility() public {
        oracle.setPrice(robotsAsset, 80.00e18);
        assertEq(oracle.getPrice(robotsAsset), 80.00e18);

        AttentionOracle.AttentionData memory data = oracle.getAttentionData("ROBOTS");
        assertEq(data.indexPrice, 80.00e18);
    }

    function test_RevertWhen_NonReporterUpdates() public {
        vm.prank(alice);
        vm.expectRevert(AttentionOracle.OnlyReporterOrOwner.selector);
        oracle.updateAttentionReport("ROBOTS", 78e18, 50, 70, 50000);
    }

    function test_RevertWhen_MarketNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(AttentionOracle.MarketNotFound.selector, "UNKNOWN"));
        oracle.updateAttentionReport("UNKNOWN", 50e18, 50, 70, 50000);
    }

    function test_RevertWhen_PriceZero() public {
        vm.expectRevert(AttentionOracle.InvalidPrice.selector);
        oracle.updateAttentionReport("ROBOTS", 0, 50, 70, 50000);
    }
}

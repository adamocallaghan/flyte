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

        // Verify initial baseline report is recorded in history
        assertEq(oracle.getHistoryLength("ROBOTS"), 1);
        AttentionOracle.HistoricalReport[] memory history = oracle.getHistoricalReports("ROBOTS", 10);
        assertEq(history.length, 1);
        assertEq(history[0].indexPrice, 75.50e18);
        assertEq(history[0].sentimentScore, 50);
        assertEq(history[0].socialVelocity, 70);
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

        // Check history now has 2 reports
        assertEq(oracle.getHistoryLength("ROBOTS"), 2);
        AttentionOracle.HistoricalReport[] memory history = oracle.getHistoricalReports("ROBOTS", 0);
        assertEq(history.length, 2);
        assertEq(history[1].indexPrice, 78.25e18);
        assertEq(history[1].sentimentScore, 65);
    }

    function test_HistoricalReports_PaginationAndLimits() public {
        vm.startPrank(reporter);
        for (uint256 i = 1; i <= 10; i++) {
            vm.warp(block.timestamp + 3600); // 1 hour per snapshot
            oracle.updateAttentionReport(
                "ROBOTS",
                (75 + i) * 1e18,
                int256(50 + i),
                70 + uint32(i),
                50000 + uint32(i * 1000)
            );
        }
        vm.stopPrank();

        // 1 initial + 10 updates = 11 total
        assertEq(oracle.getHistoryLength("ROBOTS"), 11);

        // Fetch last 5 reports
        AttentionOracle.HistoricalReport[] memory last5 = oracle.getHistoricalReports("ROBOTS", 5);
        assertEq(last5.length, 5);
        // Latest report should be (75 + 10) = 85e18
        assertEq(last5[4].indexPrice, 85e18);
        assertEq(last5[0].indexPrice, 81e18);
    }

    function test_SeedHistoricalReports() public {
        AttentionOracle.HistoricalReport[] memory seeds = new AttentionOracle.HistoricalReport[](3);
        seeds[0] = AttentionOracle.HistoricalReport({
            timestamp: 1000,
            indexPrice: 70e18,
            sentimentScore: 45,
            socialVelocity: 60,
            newsMentions24h: 40000
        });
        seeds[1] = AttentionOracle.HistoricalReport({
            timestamp: 2000,
            indexPrice: 72e18,
            sentimentScore: 48,
            socialVelocity: 65,
            newsMentions24h: 45000
        });
        seeds[2] = AttentionOracle.HistoricalReport({
            timestamp: 3000,
            indexPrice: 74e18,
            sentimentScore: 52,
            socialVelocity: 72,
            newsMentions24h: 48000
        });

        oracle.seedHistoricalReports("ROBOTS", seeds);

        // 1 initial + 3 seeds = 4 total
        assertEq(oracle.getHistoryLength("ROBOTS"), 4);
        AttentionOracle.HistoricalReport[] memory history = oracle.getHistoricalReports("ROBOTS", 4);
        assertEq(history[1].indexPrice, 70e18);
        assertEq(history[2].indexPrice, 72e18);
        assertEq(history[3].indexPrice, 74e18);
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

        assertEq(oracle.getHistoryLength("ROBOTS"), 2);
        assertEq(oracle.getHistoryLength("GTA6"), 2);
        assertEq(oracle.getHistoryLength("DEEPSEEK"), 2);
    }

    function test_SetPrice_BackwardsCompatibility() public {
        oracle.setPrice(robotsAsset, 80.00e18);
        assertEq(oracle.getPrice(robotsAsset), 80.00e18);

        AttentionOracle.AttentionData memory data = oracle.getAttentionData("ROBOTS");
        assertEq(data.indexPrice, 80.00e18);

        // setPrice also records historical snapshot
        assertEq(oracle.getHistoryLength("ROBOTS"), 2);
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

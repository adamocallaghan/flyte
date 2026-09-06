// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { PerpAquaApp } from "../src/PerpAquaApp.sol";
import { MockPriceOracle } from "../src/MockPriceOracle.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PerpAquaAppMathTest is Test {
    PerpAquaApp public app;
    MockPriceOracle public oracle;
    address public aquaMock = address(0x1111);
    address public collateralMock = address(0x2222);

    function setUp() public {
        oracle = new MockPriceOracle();
        app = new PerpAquaApp(IAqua(aquaMock), IERC20(collateralMock), oracle);
    }

    function test_RequiredTraderAndLpMargin() public view {
        uint256 notional = 10_000e18;
        uint256 leverage = 10;
        uint256 spreadBps = 10; // 0.10%

        // Trader margin: 10_000 / 10 = 1,000. Spread fee: 10_000 * 10 / 10_000 = 10. Total = 1,010
        uint256 traderMargin = app.getRequiredTraderMargin(notional, leverage, spreadBps);
        assertEq(traderMargin, 1_010e18);

        // LP counter-margin: 10_000 / 10 = 1,000
        uint256 lpMargin = app.getRequiredLpMargin(notional, leverage);
        assertEq(lpMargin, 1_000e18);
    }

    function test_RevertWhen_ZeroLeverage() public {
        vm.expectRevert(PerpAquaApp.InvalidLeverage.selector);
        app.getRequiredTraderMargin(10_000e18, 0, 10);

        vm.expectRevert(PerpAquaApp.InvalidLeverage.selector);
        app.getRequiredLpMargin(10_000e18, 0);
    }

    function test_FillPrice() public view {
        uint256 indexPrice = 60_000e18;
        uint256 spreadBps = 10; // 0.10% -> 60e18

        uint256 longFill = app.getFillPrice(indexPrice, true, spreadBps);
        assertEq(longFill, 60_060e18);

        uint256 shortFill = app.getFillPrice(indexPrice, false, spreadBps);
        assertEq(shortFill, 59_940e18);
    }

    function test_CalculatePnl_Long() public view {
        uint256 notional = 60_000e18;
        uint256 entryPrice = 60_000e18;

        // +10% price move ($66,000) -> +$6,000
        int256 pnlGain = app.calculatePnl(true, notional, entryPrice, 66_000e18);
        assertEq(pnlGain, 6_000e18);

        // -10% price move ($54,000) -> -$6,000
        int256 pnlLoss = app.calculatePnl(true, notional, entryPrice, 54_000e18);
        assertEq(pnlLoss, -6_000e18);
    }

    function test_CalculatePnl_Short() public view {
        uint256 notional = 60_000e18;
        uint256 entryPrice = 60_000e18;

        // -10% price move ($54,000) -> Short gains +$6,000
        int256 pnlGain = app.calculatePnl(false, notional, entryPrice, 54_000e18);
        assertEq(pnlGain, 6_000e18);

        // +10% price move ($66,000) -> Short loses -$6,000
        int256 pnlLoss = app.calculatePnl(false, notional, entryPrice, 66_000e18);
        assertEq(pnlLoss, -6_000e18);
    }

    function test_FundingRate_BalancedAndSkewed() public {
        // Balanced OI -> zero funding rate
        (uint256 rateBpsZero, ) = app.getFundingRate(8 hours);
        assertEq(rateBpsZero, 0);

        // Simulate Long-skewed OI via storage cheatcode or helper
        // totalLongOi = 30k, totalShortOi = 10k -> imbalance = 20k / 40k = 50% skew
        vm.store(address(app), bytes32(uint256(5)), bytes32(uint256(30_000e18))); // totalLongOi slot
        vm.store(address(app), bytes32(uint256(6)), bytes32(uint256(10_000e18))); // totalShortOi slot

        (uint256 rateBps, bool longPaysShort) = app.getFundingRate(8 hours);
        // 50% * 75 bps * (8h / 8h) = 37 bps
        assertEq(rateBps, 37);
        assertTrue(longPaysShort);

        // If 24 hours elapsed -> should be capped at MAX_FUNDING_RATE_BPS (75 bps)
        (uint256 cappedRate, ) = app.getFundingRate(24 hours);
        assertEq(cappedRate, 75);
    }

    function test_StrategyRegistration() public {
        PerpAquaApp.Strategy memory strat = PerpAquaApp.Strategy({
            lp: address(0xAA),
            collateralToken: collateralMock,
            maxNotional: 50_000e18,
            maxLeverage: 10,
            spreadBps: 10,
            sideMask: 3,
            quoteExpiry: block.timestamp + 1 days
        });

        bytes32 expectedHash = keccak256(abi.encode(strat));
        bytes32 returnedHash = app.registerStrategy(strat);
        assertEq(returnedHash, expectedHash);

        (
            address lp,
            address colToken,
            uint256 maxNotional,
            uint256 maxLeverage,
            uint256 spreadBps,
            uint8 sideMask,
            uint256 expiry
        ) = app.registeredStrategies(returnedHash);

        assertEq(lp, address(0xAA));
        assertEq(colToken, collateralMock);
        assertEq(maxNotional, 50_000e18);
        assertEq(maxLeverage, 10);
        assertEq(spreadBps, 10);
        assertEq(sideMask, 3);
        assertEq(expiry, block.timestamp + 1 days);
    }
}
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { PerpAquaApp } from "../src/PerpAquaApp.sol";
import { MockPriceOracle } from "../src/MockPriceOracle.sol";
import { PerpSwapVMRouter } from "../src/swap-vm/routers/PerpSwapVMRouter.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPool {
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;
}

contract ForkPerpAquaAppTest is Test {
    // Verified Arbitrum One Production Addresses
    address constant AQUA_REGISTRY = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;
    address constant AAVE_POOL = 0x794a61358D6845594F94dc1DB02A252b5b4814aD;
    address constant USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
    address constant A_USDC = 0x724dc807b04555b71ed48a6896b6F41593b8C637;

    PerpAquaApp public app;
    MockPriceOracle public oracle;
    PerpSwapVMRouter public router;
    IAqua public aqua;
    IERC20 public aUsdc;
    IERC20 public usdc;

    address public lp = makeAddr("grimace");
    address public trader = makeAddr("hamburglar");
    address public trader2 = makeAddr("birdie");
    address public keeper = makeAddr("ronald");

    PerpAquaApp.Strategy public defaultStrategy;

    function setUp() public {
        string memory rpc = vm.rpcUrl("arbitrum");
        uint256 forkId = vm.createFork(rpc);
        vm.selectFork(forkId);

        aqua = IAqua(AQUA_REGISTRY);
        aUsdc = IERC20(A_USDC);
        usdc = IERC20(USDC);

        oracle = new MockPriceOracle();
        oracle.setPrice(A_USDC, 60_000e18); // e.g. BTC/USD index = $60,000

        app = new PerpAquaApp(aqua, aUsdc, oracle);

        router = new PerpSwapVMRouter(
            AQUA_REGISTRY,
            0x82aF49447D8a07e3bd95BD0d56f35241523fBab1,
            address(this),
            "FlytePerpSwapVM",
            "1"
        );
        app.setSwapVmRouter(router);

        // Setup real aTokens via Aave v3 supply on Arbitrum One fork
        _fundWithATokens(lp, 20_000e6);      // 20,000 aUSDC
        _fundWithATokens(trader, 20_000e6);  // 20,000 aUSDC
        _fundWithATokens(trader2, 20_000e6); // 20,000 aUSDC
        _fundWithATokens(keeper, 1_000e6);   // 1,000 aUSDC

        defaultStrategy = PerpAquaApp.Strategy({
            lp: lp,
            collateralToken: A_USDC,
            maxNotional: 50_000e6,
            maxLeverage: 10, // 10x
            spreadBps: 10,   // 10 bps = 0.10%
            sideMask: 3,     // Both long & short
            quoteExpiry: 0   // No expiry
        });
    }

    function _fundWithATokens(address user, uint256 amount) internal {
        deal(USDC, user, amount);
        vm.startPrank(user);
        usdc.approve(AAVE_POOL, amount);
        IPool(AAVE_POOL).supply(USDC, amount, user, 0);
        vm.stopPrank();
    }

    function _shipDefaultQuote(uint256 amount) internal returns (bytes32) {
        bytes memory strategyBytes = abi.encode(defaultStrategy);
        vm.startPrank(lp);
        aUsdc.approve(AQUA_REGISTRY, type(uint256).max);
        address[] memory tokens = new address[](1);
        tokens[0] = A_USDC;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        bytes32 hash_ = aqua.ship(address(app), strategyBytes, tokens, amounts);
        vm.stopPrank();
        return hash_;
    }

    /// @notice Scenario 1: Happy path open
    /// Assert Aqua pull() moved real tokens from LP wallet to PerpAquaApp in the same tx as position creation.
    function test_Fork_Scenario1_HappyPathOpen() public {
        _shipDefaultQuote(5_000e6);

        uint256 notional = 1_000e6;
        uint256 leverage = 5;
        uint256 expectedTraderMargin = 200e6; // 1_000 / 5
        uint256 expectedLpMargin = 200e6;     // 1_000 / 5
        uint256 expectedSpreadFee = 1e6;      // 1_000 * 10 / 10_000
        uint256 expectedTotalTraderCost = expectedTraderMargin + expectedSpreadFee;

        uint256 lpPreBalance = aUsdc.balanceOf(lp);
        uint256 traderPreBalance = aUsdc.balanceOf(trader);
        uint256 appPreBalance = aUsdc.balanceOf(address(app));

        vm.startPrank(trader);
        aUsdc.approve(address(app), type(uint256).max);
        uint256 posId = app.openPosition(defaultStrategy, true, notional, leverage);
        vm.stopPrank();

        uint256 lpPostBalance = aUsdc.balanceOf(lp);
        uint256 traderPostBalance = aUsdc.balanceOf(trader);
        uint256 appPostBalance = aUsdc.balanceOf(address(app));

        // Assert Aqua pull() pulled real counter-margin from LP wallet
        assertApproxEqAbs(lpPreBalance - lpPostBalance, expectedLpMargin, 2, "LP margin not pulled correctly");
        // Assert trader deposited margin + spread fee
        assertApproxEqAbs(traderPreBalance - traderPostBalance, expectedTotalTraderCost, 2, "Trader cost mismatch");
        // Assert contract holds both trader margin and LP counter-margin
        assertApproxEqAbs(appPostBalance - appPreBalance, expectedTotalTraderCost + expectedLpMargin, 2, "App balance mismatch");

        // Verify stored position record
        PerpAquaApp.Position memory pos = app.getPosition(posId);
        assertTrue(pos.isOpen);
        assertEq(pos.trader, trader);
        assertEq(pos.lp, lp);
        assertEq(pos.isLong, true);
        assertEq(pos.notional, notional);
        assertEq(pos.leverage, leverage);
        assertEq(pos.traderMargin, expectedTraderMargin);
        assertEq(pos.lpMargin, expectedLpMargin);
        assertEq(app.totalLongOi(), notional);
    }

    /// @notice Scenario 2: Insufficient LP balance at open
    /// LP has shipped strategy but moved/spent aUSDC -> assert openPosition reverts entirely, no partial state.
    function test_Fork_Scenario2_InsufficientLpBalanceReverts() public {
        _shipDefaultQuote(5_000e6);

        // LP drains wallet below required margin (transfers 19,900 aUSDC, leaving ~100 when 200 is needed)
        vm.prank(lp);
        aUsdc.transfer(address(0xdead), 19_900e6);

        uint256 notional = 1_000e6;
        uint256 leverage = 5;

        vm.startPrank(trader);
        aUsdc.approve(address(app), type(uint256).max);
        // Expect entire transaction to revert when Aqua.pull fails
        vm.expectRevert();
        app.openPosition(defaultStrategy, true, notional, leverage);
        vm.stopPrank();

        // Verify no position was created and no state modified
        assertEq(app.nextPositionId(), 1);
        assertEq(app.totalLongOi(), 0);
    }

    /// @notice Scenario 3: Funding settlement, LP owes trader
    /// Advance time past interval, short-heavy OI skew creates funding favoring long trader -> Aqua pull increases trader margin
    function test_Fork_Scenario3_Funding_LpOwesTrader() public {
        _shipDefaultQuote(10_000e6);

        // Position 1: Trader 1 opens Long of 10,000 Notional at 5x ($2,000 margin)
        vm.startPrank(trader);
        aUsdc.approve(address(app), type(uint256).max);
        uint256 posId1 = app.openPosition(defaultStrategy, true, 10_000e6, 5);
        vm.stopPrank();

        // Position 2: Trader 2 opens Short of 30,000 Notional at 5x ($6,000 margin)
        vm.startPrank(trader2);
        aUsdc.approve(address(app), type(uint256).max);
        app.openPosition(defaultStrategy, false, 30_000e6, 5);
        vm.stopPrank();

        // Total OI: 10,000 Long, 30,000 Short -> 20,000 Short skew (shorts pay longs)
        // Rate = 20,000 / 40,000 * 75 bps = 37.5 bps -> 37 bps
        // For Pos 1 (Long): shorts pay longs -> LP owes Trader: 10,000 * 37 / 10,000 = 37 aUSDC

        // Advance past 8-hour funding interval
        vm.warp(block.timestamp + 8 hours + 1);

        uint256 lpPreBalance = aUsdc.balanceOf(lp);
        uint256 appPreBalance = aUsdc.balanceOf(address(app));
        PerpAquaApp.Position memory prePos = app.getPosition(posId1);

        // Ronald (keeper) triggers settlement
        vm.prank(keeper);
        (int256 fundingPaid, bool defaulted) = app.settleFunding(posId1);

        uint256 lpPostBalance = aUsdc.balanceOf(lp);
        uint256 appPostBalance = aUsdc.balanceOf(address(app));
        PerpAquaApp.Position memory postPos = app.getPosition(posId1);

        assertEq(fundingPaid, 37e6, "Funding paid mismatch");
        assertFalse(defaulted, "Should not default");
        assertEq(postPos.traderMargin, prePos.traderMargin + 37e6, "Trader margin not credited");
        assertApproxEqAbs(lpPreBalance - lpPostBalance, 37e6, 2, "LP balance not deducted by Aqua");
        assertApproxEqAbs(appPostBalance - appPreBalance, 37e6, 2, "App balance not credited by Aqua");
    }

    /// @notice Scenario 4: Funding settlement, trader owes LP
    /// Advance time past interval, short-heavy OI skew means short trader owes LP -> internal margin transfer only, no Aqua pull
    function test_Fork_Scenario4_Funding_TraderOwesLp() public {
        _shipDefaultQuote(10_000e6);

        // Position 1: Long 10,000
        vm.startPrank(trader);
        aUsdc.approve(address(app), type(uint256).max);
        app.openPosition(defaultStrategy, true, 10_000e6, 5);
        vm.stopPrank();

        // Position 2: Short 30,000 (Trader 2)
        vm.startPrank(trader2);
        aUsdc.approve(address(app), type(uint256).max);
        uint256 posId2 = app.openPosition(defaultStrategy, false, 30_000e6, 5);
        vm.stopPrank();

        // Total OI: 10,000 Long, 30,000 Short -> 20,000 Short skew (shorts pay longs)
        // For Pos 2 (Short): shorts pay longs -> Trader owes LP: 30,000 * 37 / 10,000 = 111 aUSDC

        vm.warp(block.timestamp + 8 hours + 1);

        uint256 lpPreBalance = aUsdc.balanceOf(lp);
        uint256 appPreBalance = aUsdc.balanceOf(address(app));
        PerpAquaApp.Position memory prePos = app.getPosition(posId2);

        vm.prank(keeper);
        (int256 fundingPaid, bool defaulted) = app.settleFunding(posId2);

        uint256 lpPostBalance = aUsdc.balanceOf(lp);
        uint256 appPostBalance = aUsdc.balanceOf(address(app));
        PerpAquaApp.Position memory postPos = app.getPosition(posId2);

        assertEq(fundingPaid, -111e6, "Funding paid should be negative");
        assertFalse(defaulted, "Should not default");
        assertEq(postPos.traderMargin, prePos.traderMargin - 111e6, "Trader margin not deducted");
        assertEq(postPos.lpMargin, prePos.lpMargin + 111e6, "LP margin not credited");
        // Internal transfer only: no tokens move in or out of the app
        assertEq(lpPreBalance, lpPostBalance, "LP external wallet should not change");
        assertEq(appPreBalance, appPostBalance, "App total balance should not change");
    }

    /// @notice Scenario 5: Funding default
    /// LP owes trader funding, but LP drains wallet -> settleFunding does NOT revert, flags fundingDefaulted = true, makes position liquidatable
    function test_Fork_Scenario5_Funding_DefaultFlagged() public {
        _shipDefaultQuote(10_000e6);

        // Position 1: Long 10,000
        vm.startPrank(trader);
        aUsdc.approve(address(app), type(uint256).max);
        uint256 posId1 = app.openPosition(defaultStrategy, true, 10_000e6, 5);
        vm.stopPrank();

        // Position 2: Short 30,000
        vm.startPrank(trader2);
        aUsdc.approve(address(app), type(uint256).max);
        app.openPosition(defaultStrategy, false, 30_000e6, 5);
        vm.stopPrank();

        // LP drains wallet below required funding amount (transfers out 11_990e6, leaving ~10e6 when 37e6 is needed)
        vm.prank(lp);
        aUsdc.transfer(address(0xdead), 11_990e6);

        // Advance past 8-hour interval
        vm.warp(block.timestamp + 8 hours + 1);

        // Ronald (keeper) calls settleFunding. Must NOT revert despite Aqua pull failing
        vm.prank(keeper);
        (int256 fundingPaid, bool defaulted) = app.settleFunding(posId1);

        assertTrue(defaulted, "Default flag must be true");
        assertEq(fundingPaid, 0, "No funding paid when defaulted");

        PerpAquaApp.Position memory pos = app.getPosition(posId1);
        assertTrue(pos.fundingDefaulted, "Position record must have fundingDefaulted = true");

        // Verify position is now immediately eligible for liquidation via funding default
        (bool liquidatable, bool viaDefault) = app.isLiquidatable(posId1);
        assertTrue(liquidatable, "Must be liquidatable");
        assertTrue(viaDefault, "Must be liquidatable via funding default");
    }

    /// @notice Scenario 6: Liquidation via margin breach
    /// Oracle price moves against trader beyond maintenance margin (5%) -> keeper liquidates, receives 1% fee, remainder settled
    function test_Fork_Scenario6_Liquidation_MarginBreach() public {
        _shipDefaultQuote(10_000e6);

        // Trader opens Long of 10,000 Notional at 10x leverage ($1,000 margin)
        vm.startPrank(trader);
        aUsdc.approve(address(app), type(uint256).max);
        uint256 posId = app.openPosition(defaultStrategy, true, 10_000e6, 10);
        vm.stopPrank();

        // Move oracle price down 6% (from $60,000 to $56,400)
        // Trader loss is ~600 USDC, leaving ~400 margin < 500 USDC (5% maintenance requirement)
        oracle.setPrice(A_USDC, 56_400e18);

        (bool liquidatable, bool viaDefault) = app.isLiquidatable(posId);
        assertTrue(liquidatable, "Position must be liquidatable");
        assertFalse(viaDefault, "Must not be via funding default");

        uint256 keeperPreBalance = aUsdc.balanceOf(keeper);
        uint256 traderPreBalance = aUsdc.balanceOf(trader);
        uint256 lpPreBalance = aUsdc.balanceOf(lp);

        // Ronald (keeper) liquidates the position
        vm.prank(keeper);
        uint256 reward = app.liquidate(posId);

        uint256 keeperPostBalance = aUsdc.balanceOf(keeper);
        uint256 traderPostBalance = aUsdc.balanceOf(trader);
        uint256 lpPostBalance = aUsdc.balanceOf(lp);

        // Keeper fee: 1% of 10,000 notional = 100 aUSDC
        assertEq(reward, 100e6, "Keeper reward mismatch");
        assertApproxEqAbs(keeperPostBalance - keeperPreBalance, 100e6, 2, "Keeper balance mismatch");

        // Trader receives remaining margin minus keeper fee
        assertTrue(traderPostBalance > traderPreBalance, "Trader should receive remaining margin");
        // LP receives counter-margin + profit from trader's loss
        assertTrue(lpPostBalance > lpPreBalance + 1_000e6, "LP should receive margin + profit");

        // Position is closed and OI decremented
        PerpAquaApp.Position memory pos = app.getPosition(posId);
        assertFalse(pos.isOpen, "Position must be closed");
        assertEq(app.totalLongOi(), 0, "Long OI must be decremented to 0");
    }

    /// @notice Scenario 7: Liquidation via funding default
    /// LP funding default triggers liquidation eligibility even when margin is healthy -> keeper liquidates via default path
    function test_Fork_Scenario7_Liquidation_FundingDefault() public {
        _shipDefaultQuote(10_000e6);

        // Setup Long (10k) and Short (30k) positions so LP owes trader
        vm.startPrank(trader);
        aUsdc.approve(address(app), type(uint256).max);
        uint256 posId1 = app.openPosition(defaultStrategy, true, 10_000e6, 5);
        vm.stopPrank();

        vm.startPrank(trader2);
        aUsdc.approve(address(app), type(uint256).max);
        app.openPosition(defaultStrategy, false, 30_000e6, 5);
        vm.stopPrank();

        // LP drains wallet below funding requirement
        vm.prank(lp);
        aUsdc.transfer(address(0xdead), 11_990e6);

        // Advance past funding interval and settle funding (trigger default)
        vm.warp(block.timestamp + 8 hours + 1);
        vm.prank(keeper);
        app.settleFunding(posId1);

        // Oracle price has NOT moved -> margin is 100% healthy, yet liquidatable via funding default
        (bool liquidatable, bool viaDefault) = app.isLiquidatable(posId1);
        assertTrue(liquidatable, "Must be liquidatable");
        assertTrue(viaDefault, "Must be via funding default");

        uint256 keeperPreBalance = aUsdc.balanceOf(keeper);
        uint256 traderPreBalance = aUsdc.balanceOf(trader);

        // Keeper liquidates via default path
        vm.prank(keeper);
        uint256 reward = app.liquidate(posId1);

        uint256 keeperPostBalance = aUsdc.balanceOf(keeper);
        uint256 traderPostBalance = aUsdc.balanceOf(trader);

        // Keeper receives 100 aUSDC reward from defaulting LP's held margin
        assertEq(reward, 100e6, "Keeper reward mismatch");
        assertApproxEqAbs(keeperPostBalance - keeperPreBalance, 100e6, 2, "Keeper balance mismatch");
        // Trader receives margin adjusted for entry spread PnL (~1,990 USDC)
        assertApproxEqAbs(traderPostBalance - traderPreBalance, 1_990e6, 1e6, "Trader should receive margin adjusted for entry spread");

        PerpAquaApp.Position memory pos = app.getPosition(posId1);
        assertFalse(pos.isOpen, "Position must be closed");
    }

    /// @notice Scenario 8: Voluntary close
    /// Normal trade lifecycle: trader opens, price moves favorably (+10%), trader closes and both receive correct payout directly
    function test_Fork_Scenario8_VoluntaryClose() public {
        _shipDefaultQuote(10_000e6);

        // Trader opens Long of 10,000 Notional at 5x leverage (2,000 margin, entry price 60,060)
        vm.startPrank(trader);
        aUsdc.approve(address(app), type(uint256).max);
        uint256 posId = app.openPosition(defaultStrategy, true, 10_000e6, 5);
        vm.stopPrank();

        // Non-trader cannot close position
        vm.prank(keeper);
        vm.expectRevert(PerpAquaApp.OnlyTrader.selector);
        app.closePosition(posId);

        // Oracle price increases +10% (from $60,000 to $66,066) -> +$1,000 profit
        oracle.setPrice(A_USDC, 66_066e18);

        uint256 traderPreBalance = aUsdc.balanceOf(trader);
        uint256 lpPreBalance = aUsdc.balanceOf(lp);

        vm.prank(trader);
        (int256 pnl, uint256 traderPayout, uint256 lpPayout) = app.closePosition(posId);

        uint256 traderPostBalance = aUsdc.balanceOf(trader);
        uint256 lpPostBalance = aUsdc.balanceOf(lp);

        // Assert +1,000 PnL
        assertApproxEqAbs(uint256(pnl), 1_000e6, 5e6, "PnL mismatch");
        // Trader receives 2,000 margin + 1,000 profit = ~3,000 USDC
        assertApproxEqAbs(traderPayout, 3_000e6, 5e6, "Trader payout mismatch");
        assertApproxEqAbs(traderPostBalance - traderPreBalance, traderPayout, 2, "Trader balance mismatch");
        // LP receives 2,000 margin - 1,000 loss = ~1,000 USDC directly to wallet
        assertApproxEqAbs(lpPayout, 1_000e6, 5e6, "LP payout mismatch");
        assertApproxEqAbs(lpPostBalance - lpPreBalance, lpPayout, 2, "LP balance mismatch");

        // Position is closed and OI is 0
        PerpAquaApp.Position memory pos = app.getPosition(posId);
        assertFalse(pos.isOpen, "Position must be closed");
        assertEq(app.totalLongOi(), 0, "Long OI must be 0");
    }

    /// @notice Scenario 9: aToken rebasing correctness
    /// Advance time so Aave yield accrues on aUSDC held by contract; assert accounting doesn't leak or double-count accrued yield
    function test_Fork_Scenario9_ATokenRebasingCorrectness() public {
        _shipDefaultQuote(10_000e6);

        // Trader opens Long of 10,000 Notional at 5x leverage:
        // traderMargin = 2,000e6, spreadFee = 10e6, lpMargin = 2,000e6
        vm.startPrank(trader);
        aUsdc.approve(address(app), type(uint256).max);
        uint256 posId = app.openPosition(defaultStrategy, true, 10_000e6, 5);
        vm.stopPrank();

        uint256 initialAppBalance = aUsdc.balanceOf(address(app));
        // Total deposited: 2,000 (trader) + 10 (spread) + 2,000 (LP) = 4,010 aUSDC
        assertApproxEqAbs(initialAppBalance, 4_010e6, 2, "Initial balance mismatch");

        // Advance time 180 days into the future to accrue Aave lending yield
        vm.warp(block.timestamp + 180 days);
        vm.roll(block.number + (180 days / 12));

        uint256 accruedAppBalance = aUsdc.balanceOf(address(app));
        // Verify that Aave rebasing increased the aToken balance of the contract
        assertTrue(accruedAppBalance > initialAppBalance, "Aave yield should have accrued to contract");
        uint256 accruedYield = accruedAppBalance - initialAppBalance;

        // Set oracle price to break-even entry price ($60,060) so PnL = 0
        oracle.setPrice(A_USDC, 60_060e18);

        uint256 traderPreBalance = aUsdc.balanceOf(trader);
        uint256 lpPreBalance = aUsdc.balanceOf(lp);

        vm.prank(trader);
        (int256 pnl, uint256 traderPayout, uint256 lpPayout) = app.closePosition(posId);

        uint256 traderPostBalance = aUsdc.balanceOf(trader);
        uint256 lpPostBalance = aUsdc.balanceOf(lp);
        uint256 finalAppBalance = aUsdc.balanceOf(address(app));

        // PnL should be zero at entry price
        assertEq(pnl, 0, "PnL must be zero");
        // Trader must receive exactly their nominal margin (2,000 USDC), no leak of yield
        assertApproxEqAbs(traderPayout, 2_000e6, 2, "Trader payout must equal nominal margin");
        assertApproxEqAbs(traderPostBalance - traderPreBalance, 2_000e6, 2, "Trader balance diff mismatch");
        // LP must receive exactly their nominal counter-margin (2,000 USDC), no leak of yield
        assertApproxEqAbs(lpPayout, 2_000e6, 2, "LP payout must equal nominal margin");
        assertApproxEqAbs(lpPostBalance - lpPreBalance, 2_000e6, 2, "LP balance diff mismatch");

        // Contract must retain the collected spread fee + all accrued Aave interest as surplus
        assertApproxEqAbs(finalAppBalance, 10e6 + accruedYield, 2, "Remaining balance must equal fee + yield");
        assertTrue(finalAppBalance >= 10e6, "Contract must remain fully solvent");

        // Position is closed and OI is 0
        PerpAquaApp.Position memory pos = app.getPosition(posId);
        assertFalse(pos.isOpen, "Position must be closed");
        assertEq(app.totalLongOi(), 0, "Long OI must be 0");
    }
}
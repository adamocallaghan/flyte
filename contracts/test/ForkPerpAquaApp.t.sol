// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { PerpAquaApp } from "../src/PerpAquaApp.sol";
import { MockPriceOracle } from "../src/MockPriceOracle.sol";
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
    IAqua public aqua;
    IERC20 public aUsdc;
    IERC20 public usdc;

    address public lp = makeAddr("grimace");
    address public trader = makeAddr("hamburglar");
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

        // Setup real aTokens via Aave v3 supply on Arbitrum One fork
        _fundWithATokens(lp, 20_000e6);     // 20,000 aUSDC
        _fundWithATokens(trader, 20_000e6); // 20,000 aUSDC
        _fundWithATokens(keeper, 1_000e6);  // 1,000 aUSDC

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
}
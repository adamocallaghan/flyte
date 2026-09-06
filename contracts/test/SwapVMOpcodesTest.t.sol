// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { PerpSwapVMRouter } from "../src/swap-vm/routers/PerpSwapVMRouter.sol";
import { MarginCalc } from "../src/swap-vm/instructions/MarginCalc.sol";
import { FundingCalc } from "../src/swap-vm/instructions/FundingCalc.sol";

contract SwapVMOpcodesTest is Test {
    PerpSwapVMRouter public router;

    function setUp() public {
        router = new PerpSwapVMRouter(
            address(0x1111),
            address(0x2222),
            address(this),
            "FlytePerpSwapVM",
            "1"
        );
    }

    function test_Opcode_MarginCalc() public {
        uint64 notional = 10_000e6;
        uint16 leverage = 10;
        uint16 spreadBps = 10; // 0.10%

        bytes memory program = MarginCalc.build(notional, leverage, spreadBps);
        (uint256 amountIn, uint256 amountOut) = router.runPerpProgram(program);

        // traderMargin = 1,000e6, spreadFee = 10e6, total deposit = 1,010e6
        assertEq(amountIn, 1_010e6);
        // lpMargin = 1,000e6
        assertEq(amountOut, 1_000e6);
    }

    function test_Opcode_FundingCalc_LongsPayShorts() public {
        uint64 notional = 10_000e6;
        uint64 longOi = 30_000e6;
        uint64 shortOi = 10_000e6;
        uint32 timeElapsed = 8 hours;

        bytes memory program = FundingCalc.build(notional, longOi, shortOi, timeElapsed);
        (uint256 amountIn, uint256 amountOut) = router.runPerpProgram(program);

        // totalOi = 40,000e6, skew = 20,000e6, rate = 50 bps, funding = 50e6
        assertEq(amountIn, 50e6);
        // 1 represents long paying shorts
        assertEq(amountOut, 1);
    }

    function test_Opcode_FundingCalc_ShortsPayLongs() public {
        uint64 notional = 10_000e6;
        uint64 longOi = 10_000e6;
        uint64 shortOi = 30_000e6;
        uint32 timeElapsed = 4 hours; // half interval

        bytes memory program = FundingCalc.build(notional, longOi, shortOi, timeElapsed);
        (uint256 amountIn, uint256 amountOut) = router.runPerpProgram(program);

        // totalOi = 40,000e6, skew = 20,000e6, rate = 50 bps, scaled = 25 bps, funding = 25e6
        assertEq(amountIn, 25e6);
        // 0 represents shorts paying longs
        assertEq(amountOut, 0);
    }

    function test_Opcode_FundingCalc_BalancedOi() public {
        uint64 notional = 10_000e6;
        uint64 longOi = 20_000e6;
        uint64 shortOi = 20_000e6;
        uint32 timeElapsed = 8 hours;

        bytes memory program = FundingCalc.build(notional, longOi, shortOi, timeElapsed);
        (uint256 amountIn, ) = router.runPerpProgram(program);

        assertEq(amountIn, 0);
    }
}

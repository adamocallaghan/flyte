// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { PerpSwapVMRouter } from "../src/swap-vm/routers/PerpSwapVMRouter.sol";
import { MarginCalc } from "../src/swap-vm/instructions/MarginCalc.sol";

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
}
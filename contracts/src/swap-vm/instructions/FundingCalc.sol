// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Context } from "@1inch/swap-vm/src/libs/VM.sol";
import { Opcode } from "@1inch/swap-vm/src/libs/OpcodeList.sol";
import { MemoryPtr, MemoryPtrLib } from "@1inch/swap-vm/src/libs/MemoryPtr.sol";
import { InstructionBuilder } from "@1inch/swap-vm/src/libs/InstructionBuilder.sol";
import { InstructionArgs } from "@1inch/swap-vm/src/libs/InstructionArgs.sol";

/// @title FundingCalc
/// @notice Custom SwapVM instruction for perpetual futures OI skew-based funding calculation
/// @dev Uses Opcode slot _75
library FundingCalc {
    using InstructionArgs for bytes;
    using InstructionArgs for bytes32;
    using MemoryPtrLib for MemoryPtr;
    using InstructionBuilder for MemoryPtr;

    Opcode constant OPCODE = Opcode._75;
    uint256 public constant MAX_FUNDING_RATE_BPS = 100; // 1% per 8-hour interval
    uint256 public constant FUNDING_INTERVAL = 8 hours; // 28800 seconds

    function sizeOf(uint64, uint64, uint64, uint32) internal pure returns (uint256) {
        return InstructionBuilder.sizeOf() + 8 + 8 + 8 + 4;
    }

    function build(
        uint64 notional,
        uint64 longOi,
        uint64 shortOi,
        uint32 timeElapsed
    ) internal pure returns (bytes memory) {
        return build(MemoryPtrLib.alloc(sizeOf(notional, longOi, shortOi, timeElapsed)), notional, longOi, shortOi, timeElapsed).resolve();
    }

    function build(
        MemoryPtr ptrStart,
        uint64 notional,
        uint64 longOi,
        uint64 shortOi,
        uint32 timeElapsed
    ) internal pure returns (MemoryPtr ptr) {
        ptr = ptrStart.pushHeader(OPCODE);
        ptr = ptr.push(notional, 8);
        ptr = ptr.push(longOi, 8);
        ptr = ptr.push(shortOi, 8);
        ptr = ptr.push(timeElapsed, 4);
        ptrStart.patchLength(ptr);
    }

    function parse(bytes calldata args) internal pure returns (
        uint64 notional,
        uint64 longOi,
        uint64 shortOi,
        uint32 timeElapsed
    ) {
        notional = args.at(0).asU64();
        longOi = args.at(8).asU64();
        shortOi = args.at(16).asU64();
        timeElapsed = args.at(24).asU32();
    }

    function exec(Context memory ctx, bytes calldata args) internal pure {
        (uint64 notional, uint64 longOi, uint64 shortOi, uint32 timeElapsed) = parse(args);
        uint256 totalOi = uint256(longOi) + uint256(shortOi);
        if (totalOi == 0 || timeElapsed == 0 || notional == 0) {
            ctx.swap.amountIn = 0;
            ctx.swap.amountOut = 0;
            return;
        }

        bool longPaying = longOi >= shortOi;
        uint256 skew = longPaying ? (uint256(longOi) - uint256(shortOi)) : (uint256(shortOi) - uint256(longOi));
        uint256 rateBps = (skew * MAX_FUNDING_RATE_BPS) / totalOi;
        uint256 scaledRateBps = (rateBps * uint256(timeElapsed)) / FUNDING_INTERVAL;
        uint256 fundingAmount = (uint256(notional) * scaledRateBps) / 10_000;

        // amountIn: magnitude of funding payment (in collateral token units)
        // amountOut: direction flag (1 if longs pay shorts, 0 if shorts pay longs)
        ctx.swap.amountIn = fundingAmount;
        ctx.swap.amountOut = longPaying ? 1 : 0;
    }
}

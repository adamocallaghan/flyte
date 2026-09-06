// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Context } from "@1inch/swap-vm/src/libs/VM.sol";
import { Opcode } from "@1inch/swap-vm/src/libs/OpcodeList.sol";
import { MemoryPtr, MemoryPtrLib } from "@1inch/swap-vm/src/libs/MemoryPtr.sol";
import { InstructionBuilder } from "@1inch/swap-vm/src/libs/InstructionBuilder.sol";
import { InstructionArgs } from "@1inch/swap-vm/src/libs/InstructionArgs.sol";

/// @title MarginCalc
/// @notice Custom SwapVM instruction for perpetual futures margin & spread calculation
/// @dev Uses Opcode slot _74
library MarginCalc {
    using InstructionArgs for bytes;
    using InstructionArgs for bytes32;
    using MemoryPtrLib for MemoryPtr;
    using InstructionBuilder for MemoryPtr;

    Opcode constant OPCODE = Opcode._74;

    function sizeOf(uint64, uint16, uint16) internal pure returns (uint256) {
        return InstructionBuilder.sizeOf() + 8 + 2 + 2;
    }

    function build(uint64 notional, uint16 leverage, uint16 spreadBps) internal pure returns (bytes memory) {
        return build(MemoryPtrLib.alloc(sizeOf(notional, leverage, spreadBps)), notional, leverage, spreadBps).resolve();
    }

    function build(
        MemoryPtr ptrStart,
        uint64 notional,
        uint16 leverage,
        uint16 spreadBps
    ) internal pure returns (MemoryPtr ptr) {
        ptr = ptrStart.pushHeader(OPCODE);
        ptr = ptr.push(notional, 8);
        ptr = ptr.push(leverage, 2);
        ptr = ptr.push(spreadBps, 2);
        ptrStart.patchLength(ptr);
    }

    function parse(bytes calldata args) internal pure returns (uint64 notional, uint16 leverage, uint16 spreadBps) {
        notional = args.at(0).asU64();
        leverage = args.at(8).asU16();
        spreadBps = args.at(10).asU16();
    }

    function exec(Context memory ctx, bytes calldata args) internal pure {
        (uint64 notional, uint16 leverage, uint16 spreadBps) = parse(args);
        require(leverage > 0, "Invalid leverage");

        uint256 traderMargin = uint256(notional) / uint256(leverage);
        uint256 lpMargin = traderMargin;
        uint256 spreadFee = (uint256(notional) * uint256(spreadBps)) / 10_000;

        // amountIn = total deposit required from trader (margin + spread fee)
        // amountOut = counter-margin required from LP (pulled via Aqua)
        ctx.swap.amountIn = traderMargin + spreadFee;
        ctx.swap.amountOut = lpMargin;
    }
}
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Context } from "@1inch/swap-vm/src/libs/VM.sol";
import { AquaOpcodes } from "@1inch/swap-vm/src/opcodes/AquaOpcodes.sol";
import { MarginCalc } from "../instructions/MarginCalc.sol";

/// @title PerpOpcodes
/// @notice Opcode dispatcher extending AquaOpcodes with perp-specific instructions
contract PerpOpcodes is AquaOpcodes {
    uint256 public constant OP_MARGIN_CALC = 0x74;

    function _runOpcode(Context memory ctx, uint256 opcode, bytes calldata args) internal virtual override {
        if (opcode == OP_MARGIN_CALC) {
            MarginCalc.exec(ctx, args);
        } else {
            super._runOpcode(ctx, opcode, args);
        }
    }
}
// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Context, ContextLib, VM, SwapQuery, SwapRegisters, ProtocolFee } from "@1inch/swap-vm/src/libs/VM.sol";
import { CalldataPtrLib } from "@1inch/solidity-utils/contracts/libraries/CalldataPtr.sol";
import { Simulator } from "@1inch/solidity-utils/contracts/mixins/Simulator.sol";
import { SwapVM } from "@1inch/swap-vm/src/SwapVM.sol";
import { FeeMetaLib, FeeReceiverLib } from "@1inch/swap-vm/src/libs/ProtocolFee.sol";
import { PerpOpcodes } from "../opcodes/PerpOpcodes.sol";

/// @title PerpSwapVMRouter
/// @notice Redeployed SwapVM router extended with PerpOpcodes for perpetual futures margin calculations
contract PerpSwapVMRouter is Simulator, SwapVM, PerpOpcodes {
    using ContextLib for Context;

    constructor(
        address aqua,
        address weth,
        address owner,
        string memory name,
        string memory version
    ) SwapVM(aqua, weth, owner, name, version) {}

    /// @dev Dispatches opcode to PerpOpcodes implementation
    function _dispatch(Context memory ctx, uint256 opcode, bytes calldata args) internal override {
        _runOpcode(ctx, opcode, args);
    }

    /// @notice Runs a SwapVM bytecode program through the virtual machine loop
    /// @param program Calldata containing the bytecode sequence
    /// @return amountIn Result written to swap register amountIn
    /// @return amountOut Result written to swap register amountOut
    function runPerpProgram(bytes calldata program) external returns (uint256 amountIn, uint256 amountOut) {
        Context memory ctx = Context({
            vm: VM({
                isStaticContext: false,
                nextPC: 0,
                programPtr: CalldataPtrLib.from(program),
                takerArgsPtr: CalldataPtrLib.from(msg.data[0:0]),
                dispatch: _dispatch
            }),
            query: SwapQuery({
                orderHash: bytes32(0),
                maker: address(0),
                taker: msg.sender,
                tokenIn: address(0),
                tokenOut: address(0),
                isExactIn: true
            }),
            swap: SwapRegisters({
                balanceIn: 0,
                balanceOut: 0,
                amountIn: 0,
                amountOut: 0
            }),
            fee: ProtocolFee({
                meta: FeeMetaLib.init(),
                receivers: FeeReceiverLib.init(),
                feeTotal: 0
            })
        });

        (amountIn, amountOut) = ctx.runLoop();
    }
}
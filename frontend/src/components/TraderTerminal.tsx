'use client';

import React, { useState, useMemo } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { useMarket } from '../context/MarketContext';
import {
  A_USDC_ADDRESS,
  DEMO_ROLES,
  formatUsd,
  shortenAddress,
} from '../config/contracts';

export const TraderTerminal: React.FC = () => {
  const {
    account,
    role,
    balances,
    appContract,
    aUsdcContract,
    appAddress,
    refreshBalances,
  } = useWeb3();

  const { btcPrice, setMarketPrice } = useMarket();

  // Order Form State
  const [isLong, setIsLong] = useState<boolean>(true);
  const [marginInput, setMarginInput] = useState<string>('200');
  const [leverage, setLeverage] = useState<number>(5);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [orderStatus, setOrderStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Numeric Calculations
  const margin = parseFloat(marginInput) || 0;
  const notional = margin * leverage;
  const btcSize = btcPrice > 0 ? notional / btcPrice : 0;

  // Spread (10 bps = 0.10%)
  const spreadBps = 10;
  const spreadFee = (notional * spreadBps) / 10000;
  const totalTraderRequired = margin + spreadFee;

  // Entry Price with spread
  const entryPrice = isLong
    ? btcPrice * (1 + spreadBps / 10000)
    : btcPrice * (1 - spreadBps / 10000);

  // Liquidation Price (5% maintenance margin requirement)
  // Long: EntryPrice * (1 - 1/leverage + 0.05)
  // Short: EntryPrice * (1 + 1/leverage - 0.05)
  const liqPrice = useMemo(() => {
    if (leverage <= 0 || entryPrice <= 0) return 0;
    if (isLong) {
      const dropPct = 1 / leverage - 0.05;
      return entryPrice * Math.max(0, 1 - dropPct);
    } else {
      const risePct = 1 / leverage - 0.05;
      return entryPrice * (1 + risePct);
    }
  }, [isLong, leverage, entryPrice]);

  // Allowance check (6 decimals for aUSDC)
  const requiredAmountRaw = ethers.parseUnits(totalTraderRequired.toFixed(6), 6);
  const isAllowanceSufficient = balances.aUsdcAllowanceApp >= requiredAmountRaw;

  // Percentage quick-select
  const handleQuickPercent = (pct: number) => {
    const available = parseFloat(balances.aUsdc) || 1000;
    const computed = (available * pct) / 100;
    setMarginInput(computed.toFixed(2));
  };

  // 1. Approve aUSDC for PerpAquaApp
  const handleApprove = async () => {
    if (!aUsdcContract || !appAddress) return;
    setIsApproving(true);
    setOrderStatus({ type: 'info', text: 'Approving aUSDC collateral for Flyte...' });
    try {
      const tx = await (aUsdcContract as any).approve(appAddress, ethers.MaxUint256);
      await tx.wait();
      await refreshBalances();
      setOrderStatus({ type: 'success', text: '✅ aUSDC successfully approved!' });
      setTimeout(() => setOrderStatus(null), 3000);
    } catch (err: any) {
      console.error('Approve failed:', err);
      setOrderStatus({ type: 'error', text: err.message || 'Approval failed' });
    } finally {
      setIsApproving(false);
    }
  };

  // 2. Open Position against Grimace's JIT Aqua Quote
  const handleOpenPosition = async () => {
    if (margin <= 0) {
      alert('Please enter a valid margin amount');
      return;
    }

    setIsSubmitting(true);
    setOrderStatus({
      type: 'info',
      text: `Routing ${isLong ? 'LONG' : 'SHORT'} position via 1inch Aqua JIT sourcing...`,
    });

    try {
      const notionalRaw = ethers.parseUnits(notional.toFixed(6), 6);

      // Strategy for LP Grimace
      const strategy = {
        lp: DEMO_ROLES.lp.address,
        collateralToken: A_USDC_ADDRESS,
        maxNotional: ethers.parseUnits('50000', 6),
        maxLeverage: 10,
        spreadBps: 10,
        sideMask: 3, // Both long and short
        quoteExpiry: 0,
      };

      if (appContract && appContract.runner) {
        // Direct on-chain execution with dynamic gas estimation + 30% safety buffer
        let gasLimit: bigint | undefined;
        try {
          const est = await (appContract as any)['openPosition((address,address,uint256,uint256,uint256,uint8,uint256),bool,uint256,uint256)'].estimateGas(
            strategy,
            isLong,
            notionalRaw,
            BigInt(leverage)
          );
          gasLimit = (est * 130n) / 100n;
        } catch {
          gasLimit = 1_200_000n;
        }

        const tx = await (appContract as any)['openPosition((address,address,uint256,uint256,uint256,uint8,uint256),bool,uint256,uint256)'](
          strategy,
          isLong,
          notionalRaw,
          BigInt(leverage),
          gasLimit ? { gasLimit } : {}
        );
        const receipt = await tx.wait();
        await refreshBalances();

        setOrderStatus({
          type: 'success',
          text: `🎉 Position successfully opened! ${isLong ? 'LONG' : 'SHORT'} ${formatUsd(notional)} at ${formatUsd(entryPrice)}. Tx: ${shortenAddress(receipt.hash)}`,
        });
      } else {
        // Client-side fallback if contracts not deployed on anvil
        await new Promise((r) => setTimeout(r, 1000));
        setOrderStatus({
          type: 'success',
          text: `🎉 Position created (Demo Mode)! ${isLong ? 'LONG' : 'SHORT'} ${formatUsd(notional)} at ${formatUsd(entryPrice)}.`,
        });
      }
    } catch (err: any) {
      console.error('Open position failed:', err);
      setOrderStatus({
        type: 'error',
        text: err.reason || err.message || 'Failed to open position. Ensure LP Grimace has sufficient aUSDC on Anvil fork.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start font-headline">
      {/* LEFT: Order Entry Terminal (5 cols on lg) */}
      <div className="lg:col-span-5 bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 md:p-6">
        <div className="flex justify-between items-center pb-4 border-b-2 border-black mb-5">
          <div>
            <h2 className="text-xl font-black text-black uppercase tracking-tight">
              Place Order
            </h2>
            <span className="font-mono text-[11px] text-gray-500 uppercase">
              BTC/USD Perpetual
            </span>
          </div>
          <span className="bg-[#FFE600] border-2 border-black font-mono text-[10px] font-bold px-2 py-0.5 text-black uppercase shadow-[2px_2px_0px_0px_#000000]">
            1inch Aqua RFQ
          </span>
        </div>

        {/* 1. Long / Short Selector */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <button
            type="button"
            onClick={() => setIsLong(true)}
            id="order-side-long"
            className={`h-14 px-8 font-black border-2 border-black font-headline font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-transform ${
              isLong
                ? 'bg-[#00F076] text-black shadow-[3px_3px_0px_0px_#000000] -translate-y-0.5'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            } active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`}
          >
            <span>📈</span>
            <span>Long (Buy)</span>
          </button>
          <button
            type="button"
            onClick={() => setIsLong(false)}
            id="order-side-short"
            className={`h-14 px-8 font-black border-2 border-black font-headline font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-transform ${
              !isLong
                ? 'bg-[#FF3366] text-white shadow-[3px_3px_0px_0px_#000000] -translate-y-0.5'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            } active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`}
          >
            <span>📉</span>
            <span>Short (Sell)</span>
          </button>
        </div>

        {/* 2. Margin Input */}
        <div className="mb-5">
          <div className="flex justify-between items-center mb-1.5 font-mono text-xs">
            <span className="font-bold text-black uppercase">Collateral (Margin)</span>
            <span className="text-gray-600">
              Avail: <strong className="text-black font-bold">{balances.aUsdc} aUSDC</strong>
            </span>
          </div>

          <div className="relative flex items-center">
            <input
              type="number"
              step="10"
              min="10"
              max="50000"
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              id="input-margin-amount"
              className="w-full bg-[#FAFAFA] border-2 border-black p-3 pr-20 font-mono text-xl font-bold text-black focus:outline-none focus:bg-white focus:shadow-[2px_2px_0px_0px_#000000]"
            />
            <span className="absolute right-3 font-mono font-bold text-xs bg-black text-[#FFE600] px-2 py-1 border border-black select-none">
              aUSDC
            </span>
          </div>

          {/* Quick % buttons */}
          <div className="grid grid-cols-4 gap-2 mt-2">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handleQuickPercent(pct)}
                className="bg-white hover:bg-[#00E5FF] text-black border-2 border-black font-mono font-bold text-xs py-2 px-4 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-colors cursor-pointer tracking-wider"
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* 3. Leverage Selector */}
        <div className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <span className="font-mono text-xs font-bold text-black uppercase">Leverage</span>
            <span className="bg-black text-[#00E5FF] font-mono font-black text-xs px-2 py-0.5 border border-black">
              {leverage}x
            </span>
          </div>

          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={leverage}
            onChange={(e) => setLeverage(parseInt(e.target.value))}
            id="input-leverage-slider"
            className="w-full accent-black cursor-pointer mb-2.5 h-2 bg-gray-200 rounded-none border border-black"
          />

          <div className="grid grid-cols-6 gap-1.5">
            {[1, 2, 3, 5, 7, 10].map((lev) => (
              <button
                key={lev}
                type="button"
                onClick={() => setLeverage(lev)}
                className={`py-2 px-3.5 text-center font-mono font-bold text-xs border-2 border-black cursor-pointer transition-transform tracking-wider ${
                  leverage === lev
                    ? 'bg-black text-[#00E5FF] shadow-[2px_2px_0px_0px_#000000]'
                    : 'bg-white hover:bg-gray-100 text-black shadow-[1px_1px_0px_0px_#000000]'
                } active:translate-x-[1px] active:translate-y-[1px] active:shadow-none`}
              >
                {lev}x
              </button>
            ))}
          </div>
        </div>

        {/* 4. Execution / Summary Breakdown */}
        <div className="bg-[#FAFAFA] border-2 border-black p-4 mb-5 flex flex-col gap-2 font-mono text-xs">
          <div className="flex justify-between text-gray-700">
            <span>Position Size</span>
            <span className="text-black font-bold">
              {formatUsd(notional)} ({btcSize.toFixed(4)} BTC)
            </span>
          </div>

          <div className="flex justify-between text-gray-700">
            <span>Entry Price (0.1% spread)</span>
            <span className="text-black font-bold">{formatUsd(entryPrice)}</span>
          </div>

          <div className="flex justify-between text-gray-700">
            <span>Est. Liquidation Price</span>
            <span
              className={`font-bold ${
                isLong ? 'text-[#d9044b]' : 'text-[#006d32]'
              }`}
            >
              {formatUsd(liqPrice)}
            </span>
          </div>

          <div className="border-b-2 border-black my-1" />

          <div className="flex justify-between text-gray-700">
            <span>SwapVM Execution Fee (10 bps)</span>
            <span className="text-black">{formatUsd(spreadFee)} aUSDC</span>
          </div>

          <div className="flex justify-between items-center bg-[#FFE600] p-2 border border-black text-black font-bold">
            <span className="uppercase text-[11px]">Total Deposit Required</span>
            <span className="text-sm">{formatUsd(totalTraderRequired)} aUSDC</span>
          </div>
        </div>

        {/* 5. Action Buttons (Approve / Submit) */}
        {!isAllowanceSufficient ? (
          <button
            type="button"
            onClick={handleApprove}
            disabled={isApproving}
            id="btn-approve-collateral"
            className="w-full h-14 px-8 font-black bg-[#00E5FF] hover:bg-[#00cbe2] text-black border-2 border-black font-headline font-black text-sm uppercase tracking-wider shadow-[4px_4px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-colors cursor-pointer"
          >
            {isApproving ? 'Approving aUSDC...' : '1. Approve aUSDC for Flyte'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleOpenPosition}
            disabled={isSubmitting || margin <= 0}
            id="btn-open-position"
            className={`w-full h-14 px-8 font-black border-2 border-black font-headline font-black text-base uppercase tracking-wider shadow-[4px_4px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer ${
              isLong
                ? 'bg-[#00F076] hover:bg-[#00d669] text-black'
                : 'bg-[#FF3366] hover:bg-[#e62957] text-white'
            } ${isSubmitting || margin <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSubmitting
              ? 'Opening Position via Aqua...'
              : `${isLong ? 'Open Long' : 'Open Short'} (${formatUsd(notional)})`}
          </button>
        )}

        {/* Status Message */}
        {orderStatus && (
          <div
            className={`mt-4 p-3 border-2 border-black shadow-[3px_3px_0px_0px_#000000] font-mono text-xs font-bold leading-snug ${
              orderStatus.type === 'success'
                ? 'bg-[#00F076] text-black'
                : orderStatus.type === 'error'
                ? 'bg-[#FF3366] text-white'
                : 'bg-[#00E5FF] text-black'
            }`}
          >
            {orderStatus.text}
          </div>
        )}
      </div>

      {/* RIGHT: Architecture Highlights & JIT RFQ Quote Inspector (7 cols on lg) */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        {/* JIT RFQ Counterparty Quote Card */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 md:p-6">
          <div className="flex justify-between items-start pb-4 border-b-2 border-black mb-5 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#00E5FF] border-2 border-black flex items-center justify-center text-xl shadow-[2px_2px_0px_0px_#000000] shrink-0">
                💧
              </div>
              <div>
                <h3 className="text-lg font-black text-black uppercase tracking-tight">
                  Active JIT Liquidity Quote
                </h3>
                <span className="font-mono text-[11px] text-gray-500 uppercase">
                  Sourced Just-In-Time from LP Maker via 1inch Aqua Registry
                </span>
              </div>
            </div>
            <span className="bg-[#00F076] border-2 border-black font-mono text-[10px] font-bold px-2 py-0.5 text-black uppercase shadow-[2px_2px_0px_0px_#000000] shrink-0">
              🟢 LIVE QUOTE
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <div className="bg-[#FAFAFA] border-2 border-black p-3 shadow-[2px_2px_0px_0px_#000000]">
              <span className="block font-mono text-[10px] text-gray-500 uppercase">LP Maker</span>
              <div className="font-mono text-xs md:text-sm font-bold text-black mt-0.5 truncate">
                Grimace ({shortenAddress(DEMO_ROLES.lp.address)})
              </div>
            </div>

            <div className="bg-[#FAFAFA] border-2 border-black p-3 shadow-[2px_2px_0px_0px_#000000]">
              <span className="block font-mono text-[10px] text-gray-500 uppercase">Available JIT Depth</span>
              <div className="font-mono text-xs md:text-sm font-black text-[#006d32] mt-0.5">
                $50,000 aUSDC
              </div>
            </div>

            <div className="bg-[#FAFAFA] border-2 border-black p-3 shadow-[2px_2px_0px_0px_#000000]">
              <span className="block font-mono text-[10px] text-gray-500 uppercase">LP Counter-Margin JIT Pulled</span>
              <div className="font-mono text-xs md:text-sm font-bold text-black mt-0.5">
                {formatUsd(margin)} aUSDC
              </div>
            </div>

            <div className="bg-[#FAFAFA] border-2 border-black p-3 shadow-[2px_2px_0px_0px_#000000]">
              <span className="block font-mono text-[10px] text-gray-500 uppercase">Native Aave Yield</span>
              <div className="font-mono text-xs md:text-sm font-black text-black mt-0.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00F076]"></span>
                ~4.25% APY
              </div>
            </div>
          </div>

          <div className="bg-[#FFE600] border-2 border-black p-4 shadow-[3px_3px_0px_0px_#000000] text-black font-mono text-xs leading-relaxed">
            <strong className="uppercase font-black block mb-1">⚡ The Flyte Innovation:</strong>
            The LP’s $50,000 capital is <span className="underline font-bold">NOT</span> locked idle in the perp contract. It remains in Grimace’s wallet earning Aave v3 supply yield until the moment you click &quot;Open Position&quot;, when 1inch Aqua executes a single atomic <code className="bg-black text-[#FFE600] px-1 py-0.5 font-bold">AQUA.pull()</code> for exactly {formatUsd(margin)} counter-margin!
          </div>
        </div>

        {/* SwapVM Instruction Breakdown */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 md:p-6">
          <div className="flex items-center gap-3 pb-3 border-b-2 border-black mb-4">
            <div className="w-8 h-8 bg-black text-[#FFE600] border-2 border-black flex items-center justify-center text-base shadow-[2px_2px_0px_0px_#000000]">
              ⚙️
            </div>
            <h4 className="text-base font-black text-black uppercase tracking-tight">
              SwapVM Custom Opcode Execution
            </h4>
          </div>

          <div className="flex flex-col gap-3 font-mono text-xs">
            <div className="p-3 bg-[#FAFAFA] border-2 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-[2px_2px_0px_0px_#000000]">
              <span className="bg-black text-[#00E5FF] font-mono text-[11px] font-black px-2 py-1 border border-black shrink-0">
                OP_MARGIN_CALC (0x74)
              </span>
              <span className="text-gray-700 text-[11px] sm:text-right">
                Validates notional {formatUsd(notional)}, computes trader margin {formatUsd(margin)} &amp; LP counter-margin
              </span>
            </div>

            <div className="p-3 bg-[#FAFAFA] border-2 border-black flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-[2px_2px_0px_0px_#000000]">
              <span className="bg-black text-[#FFE600] font-mono text-[11px] font-black px-2 py-1 border border-black shrink-0">
                OP_FUNDING_CALC (0x75)
              </span>
              <span className="text-gray-700 text-[11px] sm:text-right">
                Computes OI skew-based rate adjustment against 8h funding interval
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

'use client';

import { TradingChart } from './TradingChart';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { useMarket } from '../context/MarketContext';
import {
  A_USDC_ADDRESS,
  DEMO_ROLES,
  formatUsd,
  shortenAddress,
} from '../config/contracts';

interface ActiveAquaQuote {
  strategyHash: string;
  maker: string;
  collateralToken: string;
  maxNotional: number;
  currentBalance: number;
  maxLeverage: number;
  spreadBps: number;
  sideMask: number;
  quoteExpiry: number;
  rawStrategy: {
    lp: string;
    collateralToken: string;
    maxNotional: bigint;
    maxLeverage: bigint;
    spreadBps: bigint;
    sideMask: number;
    quoteExpiry: bigint;
  };
}

export const TraderTerminal: React.FC = () => {
  const {
    account,
    role,
    balances,
    appContract,
    aUsdcContract,
    aquaContract,
    provider,
    appAddress,
    refreshBalances,
  } = useWeb3();

  const { btcPrice, setMarketPrice } = useMarket();

  // Order Form State
  const [isLong, setIsLong] = useState<boolean>(false);
  const [marginInput, setMarginInput] = useState<string>('100');
  const [leverage, setLeverage] = useState<number>(2);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [orderStatus, setOrderStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Live Aqua strategies state
  const [activeQuotes, setActiveQuotes] = useState<ActiveAquaQuote[]>([]);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState<boolean>(true);

  // Load live on-chain Shipped quotes from 1inch Aqua
  const loadQuotes = useCallback(async () => {
    if (!aquaContract || !provider || !ethers.isAddress(appAddress)) return;

    try {
      const currentBlock = await provider.getBlockNumber();
      const startBlock = Math.max(0, currentBlock - 2000);

      const [shippedLogs, dockedLogs] = await Promise.all([
        aquaContract.queryFilter(aquaContract.filters.Shipped(), startBlock, 'latest').catch(() => []),
        aquaContract.queryFilter(aquaContract.filters.Docked(), startBlock, 'latest').catch(() => []),
      ]);

      const dockedHashes = new Set(
        dockedLogs.map((log: any) => log.args[2].toLowerCase())
      );

      const appShipped = shippedLogs.filter(
        (log: any) => log.args[1].toLowerCase() === appAddress.toLowerCase()
      );

      const strategyAbi = [
        'tuple(address lp, address collateralToken, uint256 maxNotional, uint256 maxLeverage, uint256 spreadBps, uint8 sideMask, uint256 quoteExpiry)',
      ];

      const quoteMap = new Map<string, ActiveAquaQuote>();

      for (const log of appShipped) {
        const maker = (log as any).args?.[0];
        const strategyHash = (log as any).args?.[2];
        const strategyBytes = (log as any).args?.[3];
        if (!maker || !strategyHash || !strategyBytes) continue;

        try {
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(strategyAbi, strategyBytes)[0];
          const collateralToken = decoded[1];
          const maxNotionalRaw = decoded[2];
          const maxNotional = parseFloat(ethers.formatUnits(maxNotionalRaw, 6));
          const maxLeverage = Number(decoded[3]);
          const spreadBps = Number(decoded[4]);
          const sideMask = Number(decoded[5]);
          const quoteExpiry = Number(decoded[6]);

          if (dockedHashes.has(strategyHash.toLowerCase())) continue;

          let currentBalance = 0;
          try {
            const [bal] = await (aquaContract as any).rawBalances(maker, appAddress, strategyHash, collateralToken);
            currentBalance = parseFloat(ethers.formatUnits(bal, 6));
          } catch {}

          if (currentBalance > 0) {
            quoteMap.set(strategyHash.toLowerCase(), {
              strategyHash,
              maker,
              collateralToken,
              maxNotional,
              currentBalance,
              maxLeverage,
              spreadBps,
              sideMask,
              quoteExpiry,
              rawStrategy: {
                lp: maker,
                collateralToken,
                maxNotional: maxNotionalRaw,
                maxLeverage: BigInt(maxLeverage),
                spreadBps: BigInt(spreadBps),
                sideMask,
                quoteExpiry: BigInt(quoteExpiry),
              },
            });
          }
        } catch (e) {
          console.warn('Failed to parse Aqua quote in TraderTerminal:', e);
        }
      }

      setActiveQuotes(Array.from(quoteMap.values()));
    } catch (err) {
      console.warn('Could not load Aqua quotes in TraderTerminal:', err);
    } finally {
      setIsLoadingQuotes(false);
    }
  }, [aquaContract, provider, appAddress]);

  useEffect(() => {
    loadQuotes();
    const interval = setInterval(loadQuotes, 4000);
    return () => clearInterval(interval);
  }, [loadQuotes]);

  // Numeric Calculations
  const margin = parseFloat(marginInput) || 0;
  const notional = margin * leverage;
  const btcSize = btcPrice > 0 ? notional / btcPrice : 0;

  // Matching Logic: Find best active Aqua quote supporting this trade
  const { matchedQuote, unmatchedReason } = useMemo(() => {
    if (activeQuotes.length === 0) {
      return {
        matchedQuote: null,
        unmatchedReason: 'No active LP liquidity found on 1inch Aqua. Please ship a strategy in the 1inch Aqua LP Vault tab.',
      };
    }

    const matchingSide = activeQuotes.filter((q) =>
      isLong ? (q.sideMask & 1) !== 0 : (q.sideMask & 2) !== 0
    );
    if (matchingSide.length === 0) {
      return {
        matchedQuote: null,
        unmatchedReason: `No active LP quotes accept ${isLong ? 'LONGS' : 'SHORTS'}. Shipped quotes only accept ${isLong ? 'SHORTS' : 'LONGS'}.`,
      };
    }

    const matchingLev = matchingSide.filter((q) => q.maxLeverage >= leverage);
    if (matchingLev.length === 0) {
      const maxAvailable = Math.max(...matchingSide.map((q) => q.maxLeverage));
      return {
        matchedQuote: null,
        unmatchedReason: `Requested leverage (${leverage}x) exceeds maximum allowed by active LP quotes (${maxAvailable}x).`,
      };
    }

    const matchingNotional = matchingLev.filter((q) => q.maxNotional >= notional);
    if (matchingNotional.length === 0) {
      const maxNotionalAvail = Math.max(...matchingLev.map((q) => q.maxNotional));
      return {
        matchedQuote: null,
        unmatchedReason: `Requested notional (${formatUsd(notional)}) exceeds maximum position size (${formatUsd(maxNotionalAvail)}).`,
      };
    }

    const matchingDepth = matchingNotional.filter((q) => q.currentBalance >= margin);
    if (matchingDepth.length === 0) {
      const maxBal = Math.max(...matchingNotional.map((q) => q.currentBalance));
      return {
        matchedQuote: null,
        unmatchedReason: `Required LP counter-margin (${formatUsd(margin)}) exceeds available LP depth (${formatUsd(maxBal)} aUSDC).`,
      };
    }

    const matchingValid = matchingDepth.filter(
      (q) => q.quoteExpiry === 0 || q.quoteExpiry > Math.floor(Date.now() / 1000)
    );
    if (matchingValid.length === 0) {
      return {
        matchedQuote: null,
        unmatchedReason: 'Matching LP quote has expired.',
      };
    }

    // Sort by lowest spread (best execution for trader)
    const sorted = matchingValid.sort((a, b) => a.spreadBps - b.spreadBps);
    return {
      matchedQuote: sorted[0],
      unmatchedReason: null,
    };
  }, [activeQuotes, isLong, leverage, notional, margin]);

  // Dynamic Spread & Fee based on matched quote
  const activeSpreadBps = matchedQuote ? matchedQuote.spreadBps : 10;
  const spreadFee = (notional * activeSpreadBps) / 10000;
  const totalTraderRequired = margin + spreadFee;

  // Entry Price with spread
  const entryPrice = isLong
    ? btcPrice * (1 + activeSpreadBps / 10000)
    : btcPrice * (1 - activeSpreadBps / 10000);

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

  // 2. Open Position against dynamically matched Aqua Quote
  const handleOpenPosition = async () => {
    if (margin <= 0) {
      alert('Please enter a valid margin amount');
      return;
    }
    if (!matchedQuote) {
      setOrderStatus({
        type: 'error',
        text: unmatchedReason || 'No eligible Aqua LP quote available for this trade.',
      });
      return;
    }

    setIsSubmitting(true);
    setOrderStatus({
      type: 'info',
      text: `Routing ${isLong ? 'LONG' : 'SHORT'} position via 1inch Aqua JIT sourcing (${shortenAddress(matchedQuote.maker)})...`,
    });

    try {
      const notionalRaw = ethers.parseUnits(notional.toFixed(6), 6);
      const strategy = matchedQuote.rawStrategy;

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
        await loadQuotes();

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
        text: err.reason || err.message || 'Failed to open position. Ensure LP has sufficient aUSDC on Anvil fork.',
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
            <span className="font-mono text-sm font-black text-black bg-[#FFE600] px-2 py-0.5 border border-black">
              {leverage}x
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {[2, 5, 10, 15, 20].map((lev) => (
              <button
                key={lev}
                type="button"
                onClick={() => setLeverage(lev)}
                className={`py-2 px-1 border-2 border-black font-mono font-bold text-xs cursor-pointer transition-all ${
                  leverage === lev
                    ? 'bg-black text-[#FFE600] shadow-[2px_2px_0px_0px_#000000]'
                    : 'bg-white text-black hover:bg-gray-100'
                }`}
              >
                {lev}x
              </button>
            ))}
          </div>

          <input
            type="range"
            min="1"
            max={matchedQuote ? Math.max(20, matchedQuote.maxLeverage) : 20}
            value={leverage}
            onChange={(e) => setLeverage(parseInt(e.target.value))}
            className="w-full accent-black cursor-pointer"
          />
        </div>

        {/* 4. Order Summary Card */}
        <div className="bg-[#FAFAFA] border-2 border-black p-4 mb-5 font-mono text-xs space-y-2">
          <div className="flex justify-between text-gray-700">
            <span>Position Size (Notional)</span>
            <span className="text-black font-bold">
              {formatUsd(notional)} ({btcSize.toFixed(4)} BTC)
            </span>
          </div>

          <div className="flex justify-between text-gray-700">
            <span>Entry Price (Spread: {activeSpreadBps} bps)</span>
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
            <span>SwapVM Execution Fee ({activeSpreadBps} bps)</span>
            <span className="text-black">{formatUsd(spreadFee)} aUSDC</span>
          </div>

          <div className="flex justify-between items-center bg-[#FFE600] p-2 border border-black text-black font-bold">
            <span className="uppercase text-[11px]">Total Deposit Required</span>
            <span className="text-sm">{formatUsd(totalTraderRequired)} aUSDC</span>
          </div>
        </div>

        {/* Unmatched liquidity warning */}
        {unmatchedReason && (
          <div className="mb-4 p-3 bg-[#FFF0F2] border-2 border-[#FF3366] text-black font-mono text-xs shadow-[2px_2px_0px_0px_#000000]">
            <strong className="text-[#FF3366] uppercase block mb-0.5">⚠️ Insufficient Liquidity:</strong>
            {unmatchedReason}
          </div>
        )}

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
            disabled={isSubmitting || margin <= 0 || !matchedQuote}
            id="btn-open-position"
            className={`w-full h-14 px-8 font-black border-2 border-black font-headline font-black text-base uppercase tracking-wider shadow-[4px_4px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer ${
              isLong
                ? 'bg-[#00F076] hover:bg-[#00d669] text-black'
                : 'bg-[#FF3366] hover:bg-[#e62957] text-white'
            } ${isSubmitting || margin <= 0 || !matchedQuote ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSubmitting
              ? 'Opening Position...'
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

      {/* RIGHT: Professional Trading Chart Component (7 cols on lg) */}
      <div className="lg:col-span-7">
        <TradingChart />
      </div>
    </div>
  );
};
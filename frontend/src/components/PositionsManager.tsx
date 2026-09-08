'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import { useMarket } from '../context/MarketContext';
import {
  formatUsd,
  shortenAddress,
  DEMO_ROLES,
  LOCAL_RPC_URL,
} from '../config/contracts';

export interface DisplayPosition {
  id: number;
  trader: string;
  lp: string;
  isLong: boolean;
  notional: number;
  leverage: number;
  entryPrice: number;
  traderMargin: number;
  lpMargin: number;
  isOpen: boolean;
  openTimestamp: number;
}

export const PositionsManager: React.FC = () => {
  const {
    account,
    role,
    appContract,
    isFork,
    refreshBalances,
  } = useWeb3();

  const { btcPrice } = useMarket();

  const [positions, setPositions] = useState<DisplayPosition[]>([]);
  const [filterMine, setFilterMine] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [actionStatus, setActionStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Fetch all open positions from PerpAquaApp contract
  const fetchPositions = useCallback(async () => {
    if (!appContract) return;

    setIsLoading(true);
    try {
      const nextIdRaw = await appContract.nextPositionId().catch(() => BigInt(1));
      const nextId = Number(nextIdRaw);

      const fetchedList: DisplayPosition[] = [];

      for (let i = 1; i < nextId; i++) {
        try {
          const pos = await appContract.positions(i);
          if (pos && pos.isOpen) {
            fetchedList.push({
              id: Number(pos.id),
              trader: pos.trader,
              lp: pos.lp,
              isLong: pos.isLong,
              notional: parseFloat(ethers.formatUnits(pos.notional, 6)),
              leverage: Number(pos.leverage),
              entryPrice: parseFloat(ethers.formatUnits(pos.entryPrice, 18)),
              traderMargin: parseFloat(ethers.formatUnits(pos.traderMargin, 6)),
              lpMargin: parseFloat(ethers.formatUnits(pos.lpMargin, 6)),
              isOpen: pos.isOpen,
              openTimestamp: Number(pos.openTimestamp),
            });
          }
        } catch {}
      }

      setPositions(fetchedList);
    } catch (err) {
      console.warn('Could not query on-chain positions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [appContract]);

  // Poll positions every 4 seconds
  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 4000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  // Execute 1-click Close Position
  const handleClosePosition = async (pos: DisplayPosition) => {
    setClosingId(pos.id);
    setActionStatus({
      type: 'info',
      text: `Closing Position #${pos.id} (${pos.isLong ? 'LONG' : 'SHORT'} ${formatUsd(pos.notional)})...`,
    });

    try {
      if (appContract && appContract.runner) {
        let contractToCall = appContract;

        // In Anvil fork mode, if current signer is not the trader who opened it, use Hamburglar's signer
        if (isFork && pos.trader.toLowerCase() !== account?.toLowerCase()) {
          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          const traderWallet = new ethers.Wallet(DEMO_ROLES.trader.privateKey, anvilProv);
          contractToCall = appContract.connect(traderWallet) as any;
        }

        const tx = await (contractToCall as any).closePosition(pos.id);
        const receipt = await tx.wait();

        setActionStatus({
          type: 'success',
          text: `🎉 Position #${pos.id} successfully closed! PnL settled and collateral released. Tx: ${shortenAddress(receipt.hash)}`,
        });

        await fetchPositions();
        await refreshBalances();
      } else {
        // Fallback simulation
        await new Promise((r) => setTimeout(r, 800));
        setPositions((prev) => prev.filter((p) => p.id !== pos.id));
        setActionStatus({
          type: 'success',
          text: `🎉 Position #${pos.id} closed (Demo Mode)! PnL settled.`,
        });
      }
    } catch (err: any) {
      console.error('Close position failed:', err);
      setActionStatus({
        type: 'error',
        text: err.reason || err.message || 'Failed to close position',
      });
    } finally {
      setClosingId(null);
      setTimeout(() => setActionStatus(null), 5000);
    }
  };

  // Filter positions
  const displayedPositions = filterMine && account
    ? positions.filter((p) => p.trader.toLowerCase() === account.toLowerCase())
    : positions;

  return (
    <div className="w-full bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 md:p-6 mt-6 font-headline">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-2 border-black mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black text-[#00F076] border-2 border-black flex items-center justify-center font-bold text-base shadow-[2px_2px_0px_0px_#000000]">
            ⚡
          </div>
          <h3 className="text-xl font-black text-black uppercase tracking-tight">
            Active Positions
          </h3>
          <span className="bg-[#FFE600] border-2 border-black font-mono text-[11px] font-black px-2 py-0.5 text-black shadow-[1px_1px_0px_0px_#000000]">
            {displayedPositions.length} OPEN
          </span>
          {isLoading && (
            <span className="font-mono text-xs text-gray-500 animate-pulse">
              SYNCING...
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Segmented Filter Toggle */}
          <div className="flex bg-white border-2 border-black p-0.5 shadow-[2px_2px_0px_0px_#000000]">
            <button
              type="button"
              onClick={() => setFilterMine(false)}
              className={`font-mono text-xs font-bold px-5 py-2 uppercase cursor-pointer transition-colors tracking-wider ${
                !filterMine
                  ? 'bg-black text-[#00E5FF]'
                  : 'bg-transparent text-gray-700 hover:bg-gray-100'
              }`}
            >
              All Positions
            </button>
            <button
              type="button"
              onClick={() => setFilterMine(true)}
              className={`font-mono text-xs font-bold px-5 py-2 uppercase cursor-pointer transition-colors tracking-wider ${
                filterMine
                  ? 'bg-black text-[#00E5FF]'
                  : 'bg-transparent text-gray-700 hover:bg-gray-100'
              }`}
            >
              My Account
            </button>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchPositions}
            title="Refresh positions"
            className="w-8 h-8 bg-white hover:bg-gray-100 border-2 border-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center justify-center font-bold text-sm cursor-pointer"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Action Notification Toast */}
      {actionStatus && (
        <div
          className={`mb-5 p-3.5 border-2 border-black shadow-[3px_3px_0px_0px_#000000] font-mono text-xs font-bold leading-snug ${
            actionStatus.type === 'success'
              ? 'bg-[#00F076] text-black'
              : actionStatus.type === 'error'
              ? 'bg-[#FF3366] text-white'
              : 'bg-[#00E5FF] text-black'
          }`}
        >
          {actionStatus.text}
        </div>
      )}

      {/* Positions Content */}
      {displayedPositions.length === 0 ? (
        <div className="text-center py-12 px-4 bg-[#FAFAFA] border-2 border-dashed border-black">
          <div className="text-4xl mb-3">📊</div>
          <h4 className="text-lg font-black text-black uppercase tracking-tight mb-1">
            No Open Positions
          </h4>
          <p className="text-gray-600 font-mono text-xs max-w-md mx-auto leading-relaxed">
            Use the order terminal above to open your first 1inch Aqua JIT-leveraged perpetual position!
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000000]">
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead>
              <tr className="bg-black text-[#FFE600] uppercase font-bold text-[11px] tracking-wider border-b-2 border-black">
                <th className="py-3 px-3 border-r border-gray-800">Position</th>
                <th className="py-3 px-3 border-r border-gray-800">Size / Notional</th>
                <th className="py-3 px-3 border-r border-gray-800">Entry Price</th>
                <th className="py-3 px-3 border-r border-gray-800">Mark Price</th>
                <th className="py-3 px-3 border-r border-gray-800">Unrealized PnL (ROE)</th>
                <th className="py-3 px-3 border-r border-gray-800">Margin / Health</th>
                <th className="py-3 px-3 border-r border-gray-800">Liquidation</th>
                <th className="py-3 px-3 border-r border-gray-800">Counterparty LP</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayedPositions.map((pos, idx) => {
                // PnL Calculation
                const priceDelta = pos.isLong ? btcPrice - pos.entryPrice : pos.entryPrice - btcPrice;
                const pnlUsd = (pos.notional * priceDelta) / pos.entryPrice;
                const roePercent = (pnlUsd / pos.traderMargin) * 100;
                const isProfitable = pnlUsd >= 0;

                // Margin Ratio & Health
                const remainingMargin = pos.traderMargin + pnlUsd;
                const marginRatio = (remainingMargin / pos.notional) * 100;
                const isLiquidatable = marginRatio <= 5.0;
                const isWarning = marginRatio < 8.0 && !isLiquidatable;

                // Est. Liquidation Price
                const dropPct = 1 / pos.leverage - 0.05;
                const liqPrice = pos.isLong
                  ? pos.entryPrice * Math.max(0, 1 - dropPct)
                  : pos.entryPrice * (1 + dropPct);

                return (
                  <tr
                    key={pos.id}
                    className={`border-b-2 border-black transition-colors ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'
                    } hover:bg-[#FFFBEA]`}
                  >
                    {/* 1. Position ID & Side */}
                    <td className="py-3 px-3 border-r border-black">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-black text-[10px] px-1.5 py-0.5 border border-black uppercase ${
                            pos.isLong
                              ? 'bg-[#00F076] text-black'
                              : 'bg-[#FF3366] text-white'
                          }`}
                        >
                          {pos.isLong ? 'LONG' : 'SHORT'}
                        </span>
                        <span className="font-bold text-black">BTC/USD</span>
                        <span className="text-gray-500 font-normal">#{pos.id}</span>
                      </div>
                    </td>

                    {/* 2. Size & Leverage */}
                    <td className="py-3 px-3 border-r border-black">
                      <div className="font-bold text-black">
                        {formatUsd(pos.notional)}
                      </div>
                      <div className="text-[11px] text-gray-700 font-medium">
                        {pos.leverage}x • {(pos.notional / btcPrice).toFixed(4)} BTC
                      </div>
                    </td>

                    {/* 3. Entry Price */}
                    <td className="py-3 px-3 border-r border-black text-gray-800">
                      {formatUsd(pos.entryPrice)}
                    </td>

                    {/* 4. Mark Price */}
                    <td className="py-3 px-3 border-r border-black font-bold text-black">
                      {formatUsd(btcPrice)}
                    </td>

                    {/* 5. Unrealized PnL (ROE) */}
                    <td className="py-3 px-3 border-r border-black">
                      <div
                        className={`font-black text-sm ${
                          isProfitable ? 'text-[#006d32]' : 'text-[#d9044b]'
                        }`}
                      >
                        {isProfitable ? `+${formatUsd(pnlUsd)}` : formatUsd(pnlUsd)}
                      </div>
                      <div
                        className={`text-[11px] font-bold ${
                          isProfitable ? 'text-[#006d32]' : 'text-[#d9044b]'
                        }`}
                      >
                        {isProfitable ? `+${roePercent.toFixed(2)}%` : `${roePercent.toFixed(2)}%`}
                      </div>
                    </td>

                    {/* 6. Margin & Health */}
                    <td className="py-3 px-3 border-r border-black">
                      <div className="text-black font-medium">
                        {formatUsd(pos.traderMargin)} aUSDC
                      </div>
                      <span
                        className={`inline-block mt-0.5 text-[10px] font-black px-1.5 py-0.5 border border-black uppercase ${
                          isLiquidatable
                            ? 'bg-[#FF3366] text-white animate-pulse'
                            : isWarning
                            ? 'bg-[#FFE600] text-black'
                            : 'bg-[#00F076] text-black'
                        }`}
                      >
                        {isLiquidatable ? 'LIQUIDATABLE' : `${marginRatio.toFixed(1)}% RATIO`}
                      </span>
                    </td>

                    {/* 7. Liquidation Price */}
                    <td className="py-3 px-3 border-r border-black font-bold text-[#d9044b]">
                      {formatUsd(liqPrice)}
                    </td>

                    {/* 8. Counterparty LP */}
                    <td className="py-3 px-3 border-r border-black">
                      <div className="font-bold text-black">
                        {shortenAddress(pos.lp)}
                      </div>
                      <span className="text-[10px] text-gray-500 uppercase">
                        Aqua JIT Collateral
                      </span>
                    </td>

                    {/* 9. Action: Close */}
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleClosePosition(pos)}
                        disabled={closingId === pos.id}
                        id={`btn-close-position-${pos.id}`}
                        className="bg-[#FF3366] hover:bg-[#e62957] text-white font-headline font-black text-xs uppercase px-5 py-2 tracking-wider border-2 border-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {closingId === pos.id ? 'CLOSING...' : 'CLOSE'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

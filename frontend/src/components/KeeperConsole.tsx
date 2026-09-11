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

interface MonitoredPosition {
  id: number;
  trader: string;
  lp: string;
  isLong: boolean;
  notional: number;
  leverage: number;
  entryPrice: number;
  traderMargin: number;
  lpMargin: number;
  openTimestamp: number;
  lastFundingTimestamp: number;
  isLiquidatable: boolean;
  isFundingReady: boolean;
  hoursRemaining?: number;
  keeperRewardEst: number;
  marginRatio: number;
}

export const KeeperConsole: React.FC = () => {
  const {
    account,
    role,
    setRole,
    appContract,
    provider,
    isFork,
    refreshBalances,
  } = useWeb3();

  const { btcPrice, refreshMarketStats } = useMarket();

  // Active keeper address: injected MetaMask when connected as browser, else Ronald
  const activeKeeper = (role === 'browser' && account)
    ? account
    : (role === 'keeper' ? account || DEMO_ROLES.keeper.address : DEMO_ROLES.keeper.address);
  const isBrowserKeeper = role === 'browser' && !!account;
  const keeperLabel = isBrowserKeeper ? shortenAddress(activeKeeper) : (activeKeeper ? shortenAddress(activeKeeper) : 'Keeper Bot');

  const [monitoredPositions, setMonitoredPositions] = useState<MonitoredPosition[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [totalRewardsClaimed, setTotalRewardsClaimed] = useState<number>(0);
  const [executingId, setExecutingId] = useState<number | null>(null);
  const [executingType, setExecutingType] = useState<'liquidate' | 'funding' | 'warp' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Scan on-chain positions and evaluate health
  const scanPositions = useCallback(async () => {
    if (!appContract) return;
    setIsScanning(true);

    try {
      let currentTimestamp = Math.floor(Date.now() / 1000);
      try {
        if (provider) {
          const block = await provider.getBlock('latest');
          if (block) currentTimestamp = block.timestamp;
        }
      } catch {}

      const nextIdRaw = await appContract.nextPositionId().catch(() => BigInt(1));
      const nextId = Number(nextIdRaw);
      const list: MonitoredPosition[] = [];

      for (let i = 1; i < nextId; i++) {
        try {
          const pos = await appContract.positions(i);
          if (pos && pos.isOpen) {
            const notional = parseFloat(ethers.formatUnits(pos.notional, 6));
            const leverage = Number(pos.leverage);
            const entryPrice = parseFloat(ethers.formatUnits(pos.entryPrice, 18));
            const traderMargin = parseFloat(ethers.formatUnits(pos.traderMargin, 6));
            const lpMargin = parseFloat(ethers.formatUnits(pos.lpMargin, 6));
            const lastFunding = Number(pos.lastFundingTimestamp);

            // Real-time PnL
            const priceDelta = pos.isLong ? btcPrice - entryPrice : entryPrice - btcPrice;
            const pnl = (notional * priceDelta) / entryPrice;
            const remainingMargin = traderMargin + pnl;
            const marginRatio = (remainingMargin / notional) * 100;

            // Liquidatable check (<= 5% maintenance margin)
            const isLiq = marginRatio <= 5.0 || remainingMargin <= 0;

            // Funding ready check (>= 8 hours = 28,800s on-chain)
            const elapsed = currentTimestamp - lastFunding;
            const isFundingReady = elapsed >= 28800;
            const hoursRemaining = Math.max(0, Math.ceil((28800 - elapsed) / 3600));

            // 1% Keeper Fee reward = 100 bps
            const keeperReward = notional * 0.01;

            list.push({
              id: Number(pos.id),
              trader: pos.trader,
              lp: pos.lp,
              isLong: pos.isLong,
              notional,
              leverage,
              entryPrice,
              traderMargin,
              lpMargin,
              openTimestamp: Number(pos.openTimestamp),
              lastFundingTimestamp: lastFunding,
              isLiquidatable: isLiq,
              isFundingReady,
              hoursRemaining,
              keeperRewardEst: keeperReward,
              marginRatio,
            });
          }
        } catch {}
      }

      setMonitoredPositions(list);
    } catch (err) {
      console.warn('Error scanning keeper positions:', err);
    } finally {
      setIsScanning(false);
    }
  }, [appContract, provider, btcPrice]);

  useEffect(() => {
    scanPositions();
    const interval = setInterval(scanPositions, 4000);
    return () => clearInterval(interval);
  }, [scanPositions]);

  // 1. Execute Liquidation
  const handleLiquidate = async (pos: MonitoredPosition) => {
    setExecutingId(pos.id);
    setExecutingType('liquidate');
    setStatusMessage({
      type: 'info',
      text: `${keeperLabel} executing liquidation on Position #${pos.id} (Claiming ${formatUsd(pos.keeperRewardEst)} reward)...`,
    });

    try {
      if (appContract && appContract.runner) {
        let contractToCall = appContract;

        // In Demo simulation mode (not browser wallet), sign as Ronald
        if (role !== 'browser' && isFork) {
          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          const keeperWallet = new ethers.Wallet(DEMO_ROLES.keeper.privateKey, anvilProv);
          contractToCall = appContract.connect(keeperWallet) as any;
        }

        let gasLimit: bigint | undefined;
        try {
          const est = await (contractToCall as any).liquidate.estimateGas(pos.id);
          gasLimit = (est * 130n) / 100n;
        } catch {
          gasLimit = 650_000n;
        }

        const tx = await (contractToCall as any).liquidate(pos.id, gasLimit ? { gasLimit } : {});
        const receipt = await tx.wait();

        let actualReward = pos.keeperRewardEst;
        if (receipt && receipt.logs && appContract) {
          for (const log of receipt.logs) {
            try {
              const parsed = appContract.interface.parseLog({
                topics: [...log.topics],
                data: log.data,
              });
              if (parsed && parsed.name === 'PositionLiquidated') {
                actualReward = Number(ethers.formatUnits(parsed.args.reward, 6));
                break;
              }
            } catch {
              // Not a matching PerpAquaApp event log
            }
          }
        }

        setTotalRewardsClaimed((prev) => prev + actualReward);
        setStatusMessage({
          type: 'success',
          text: `🎉 Liquidation successful! Position #${pos.id} liquidated. Keeper reward of ${formatUsd(actualReward)} aUSDC sent to ${keeperLabel}! Tx: ${shortenAddress(receipt.hash)}`,
        });

        await scanPositions();
        await refreshBalances();
      } else {
        // Demo fallback
        await new Promise((r) => setTimeout(r, 900));
        setTotalRewardsClaimed((prev) => prev + pos.keeperRewardEst);
        setMonitoredPositions((prev) => prev.filter((p) => p.id !== pos.id));
        setStatusMessage({
          type: 'success',
          text: `🎉 Liquidation simulated! Keeper reward of ${formatUsd(pos.keeperRewardEst)} aUSDC awarded to ${keeperLabel}.`,
        });
      }
    } catch (err: any) {
      console.error('Liquidation failed:', err);
      setStatusMessage({
        type: 'error',
        text: err.reason || err.message || 'Liquidation reverted. Ensure mark price has breached 5% maintenance margin.',
      });
    } finally {
      setExecutingId(null);
      setExecutingType(null);
      setTimeout(() => setStatusMessage(null), 6000);
    }
  };

  // 2. Settle Funding Interval
  const handleSettleFunding = async (pos: MonitoredPosition) => {
    setExecutingId(pos.id);
    setExecutingType('funding');
    setStatusMessage({
      type: 'info',
      text: `${keeperLabel} settling 8h funding interval for Position #${pos.id} via SwapVM Opcode 0x75...`,
    });

    try {
      if (appContract && appContract.runner) {
        let contractToCall = appContract;

        // In Demo simulation mode (not browser wallet), sign as Ronald
        if (role !== 'browser' && isFork) {
          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          const keeperWallet = new ethers.Wallet(DEMO_ROLES.keeper.privateKey, anvilProv);
          contractToCall = appContract.connect(keeperWallet) as any;
        }

        let gasLimit: bigint | undefined;
        try {
          const est = await (contractToCall as any).settleFunding.estimateGas(pos.id);
          gasLimit = (est * 130n) / 100n;
        } catch {
          gasLimit = 500_000n;
        }

        const tx = await (contractToCall as any).settleFunding(pos.id, gasLimit ? { gasLimit } : {});
        const receipt = await tx.wait();

        setStatusMessage({
          type: 'success',
          text: `✅ Funding successfully settled for Position #${pos.id}! Tx: ${shortenAddress(receipt.hash)}`,
        });

        await scanPositions();
        await refreshBalances();
      } else {
        await new Promise((r) => setTimeout(r, 800));
        setStatusMessage({
          type: 'success',
          text: `✅ Funding settled (Demo Mode) for Position #${pos.id}!`,
        });
      }
    } catch (err: any) {
      console.error('Funding settlement failed:', err);
      const data = err.data || (err.info && err.info.error && err.info.error.data) || (err.error && err.error.data) || '';
      const isIntervalError = (typeof data === 'string' && data.includes('908058d1')) || (err.message && err.message.includes('908058d1'));

      if (isIntervalError) {
        setStatusMessage({
          type: 'error',
          text: '⏳ Funding interval (8 hours) has not elapsed yet. Fast-forward block time using the ⚙️ Dev Tools button in the top navigation on Anvil!',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: err.reason || err.message || 'Funding interval (8 hours) not reached yet.',
        });
      }
    } finally {
      setExecutingId(null);
      setExecutingType(null);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };



  const liquidatableCount = monitoredPositions.filter((p) => p.isLiquidatable).length;

  return (
    <div className="flex flex-col gap-6 font-headline">




      {/* TOP: Keeper Metrics Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Metric 1: Keeper Bounty Rate */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 flex flex-col justify-between">
          <div>
            <span className="font-mono text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
              Keeper Bounty Rate
            </span>
            <div className="font-mono text-3xl font-black text-black">
              1.00%
            </div>
          </div>
          <span className="font-mono text-[11px] text-gray-600 mt-2">
            100 bps notional reward on successful liquidation
          </span>
        </div>

        {/* Metric 2: Liquidatable Positions Radar */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 flex flex-col justify-between">
          <div>
            <span className="font-mono text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
              Liquidation Radar
            </span>
            <div className={`font-mono text-3xl font-black ${
              liquidatableCount > 0 ? 'text-[#d9044b]' : 'text-[#006d32]'
            }`}>
              {liquidatableCount} Positions
            </div>
          </div>
          <span className="font-mono text-[11px] text-gray-600 mt-2">
            Positions breaching 5.0% maintenance margin
          </span>
        </div>

        {/* Metric 3: Keeper Rewards Claimed */}
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 flex flex-col justify-between">
          <div>
            <span className="font-mono text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
              Rewards Claimed
            </span>
            <div className="font-mono text-3xl font-black text-[#006d32]">
              {formatUsd(totalRewardsClaimed)}
            </div>
          </div>
          <span className="font-mono text-[11px] text-gray-600 mt-2">
            Collateral bounty paid in aUSDC
          </span>
        </div>
      </div>

      {/* Action Notification Toast */}
      {statusMessage && (
        <div
          className={`p-3.5 border-2 border-black shadow-[3px_3px_0px_0px_#000000] font-mono text-xs font-bold leading-snug ${
            statusMessage.type === 'success'
              ? 'bg-[#00F076] text-black'
              : statusMessage.type === 'error'
              ? 'bg-[#FF3366] text-white'
              : 'bg-[#00E5FF] text-black'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {/* BOTTOM SECTION: Protocol Positions Radar Table */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between pb-4 border-b-2 border-black mb-5 gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-black text-black uppercase tracking-tight">
              Protocol Positions Health Radar
            </h3>
            <span
              className={`font-mono text-xs font-black px-2.5 py-0.5 border-2 border-black shadow-[2px_2px_0px_0px_#000000] uppercase ${
                liquidatableCount > 0
                  ? 'bg-[#FF3366] text-white animate-pulse'
                  : 'bg-[#00F076] text-black'
              }`}
            >
              {liquidatableCount > 0 ? `🚨 ${liquidatableCount} LIQUIDATABLE` : `${monitoredPositions.length} MONITORED`}
            </span>
            {isScanning && (
              <span className="font-mono text-xs text-gray-500 animate-pulse">
                SCANNING...
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={scanPositions}
            title="Scan on-chain positions"
            className="w-8 h-8 bg-white hover:bg-gray-100 border-2 border-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center justify-center font-bold text-sm cursor-pointer"
          >
            🔄
          </button>
        </div>

        {monitoredPositions.length === 0 ? (
          <div className="text-center py-12 px-4 bg-[#FAFAFA] border-2 border-dashed border-black">
            <div className="text-4xl mb-3">📡</div>
            <h4 className="text-lg font-black text-black uppercase tracking-tight mb-1">
              No Active Positions Found
            </h4>
            <p className="text-gray-600 font-mono text-xs max-w-md mx-auto leading-relaxed">
              No positions currently active on-chain to monitor. Open a position in the Trade tab to test keeper liquidation and funding bots.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000000]">
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead>
                <tr className="bg-black text-[#FFE600] uppercase font-bold text-[11px] tracking-wider border-b-2 border-black">
                  <th className="py-3 px-3 border-r border-gray-800">Position</th>
                  <th className="py-3 px-3 border-r border-gray-800">Trader</th>
                  <th className="py-3 px-3 border-r border-gray-800">Notional</th>
                  <th className="py-3 px-3 border-r border-gray-800">Margin Health</th>
                  <th className="py-3 px-3 border-r border-gray-800">1% Keeper Bounty</th>
                  <th className="py-3 px-3 border-r border-gray-800">Funding Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {monitoredPositions.map((pos, idx) => (
                  <tr
                    key={pos.id}
                    className={`border-b-2 border-black transition-colors ${
                      pos.isLiquidatable
                        ? 'bg-[#FFF0F2] '
                        : idx % 2 === 0
                        ? 'bg-white'
                        : 'bg-[#FAFAFA]'
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
                        <span className="font-bold text-black">BTC #{pos.id}</span>
                      </div>
                    </td>

                    {/* 2. Trader */}
                    <td className="py-3 px-3 border-r border-black font-bold text-black">
                      {shortenAddress(pos.trader)}
                    </td>

                    {/* 3. Notional */}
                    <td className="py-3 px-3 border-r border-black font-black text-black">
                      {formatUsd(pos.notional)}
                    </td>

                    {/* 4. Margin Health */}
                    <td className="py-3 px-3 border-r border-black">
                      <span
                        className={`inline-block font-black text-[10px] px-2 py-0.5 border border-black uppercase ${
                          pos.isLiquidatable
                            ? 'bg-[#FF3366] text-white animate-pulse'
                            : pos.marginRatio < 8
                            ? 'bg-[#FFE600] text-black'
                            : 'bg-[#00F076] text-black'
                        }`}
                      >
                        {pos.isLiquidatable ? '🔴 LIQUIDATABLE' : `${pos.marginRatio.toFixed(1)}% RATIO`}
                      </span>
                    </td>

                    {/* 5. 1% Keeper Bounty */}
                    <td className="py-3 px-3 border-r border-black font-black text-[#006d32]">
                      +{formatUsd(pos.keeperRewardEst)} aUSDC
                    </td>

                    {/* 6. Funding Status */}
                    <td className="py-3 px-3 border-r border-black">
                      <span
                        className={`font-bold text-[11px] px-2 py-0.5 border border-black ${
                          pos.isFundingReady
                            ? 'bg-[#00F076] text-black font-black'
                            : 'bg-[#FAFAFA] text-gray-600'
                        }`}
                      >
                        {pos.isFundingReady ? '⚡ ELIGIBLE (≥8H)' : `RUNNING (${pos.hoursRemaining || 8}H LEFT)`}
                      </span>
                    </td>

                    {/* 7. Actions */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex gap-2 justify-end items-center">
                        {pos.isLiquidatable && (
                          <button
                            type="button"
                            onClick={() => handleLiquidate(pos)}
                            disabled={executingId === pos.id}
                            id={`btn-liquidate-${pos.id}`}
                            className="bg-[#FF3366] hover:bg-[#e62957] text-white font-headline font-black text-xs uppercase px-5 py-2 tracking-wider border-2 border-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer transition-colors disabled:opacity-50"
                          >
                            {executingId === pos.id && executingType === 'liquidate'
                              ? 'LIQUIDATING...'
                              : `⚡ LIQUIDATE (${formatUsd(pos.keeperRewardEst)})`}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (!pos.isFundingReady) {
                              setStatusMessage({
                                type: 'info',
                                text: `⏳ Position #${pos.id} funding interval not reached (${pos.hoursRemaining || 8}h remaining). Click "Warp Time (+8 Hours)" above to advance time!`,
                              });
                              return;
                            }
                            handleSettleFunding(pos);
                          }}
                          disabled={executingId === pos.id}
                          id={`btn-settle-funding-${pos.id}`}
                          className={`font-headline font-black text-xs uppercase px-5 py-2 tracking-wider border-2 border-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer transition-colors disabled:opacity-50 ${
                            pos.isFundingReady
                              ? 'bg-[#00F076] hover:bg-[#00d669] text-black'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
                          }`}
                        >
                          {executingId === pos.id && executingType === 'funding'
                            ? 'SETTLING...'
                            : pos.isFundingReady
                            ? '⚡ SETTLE FUNDING'
                            : `WAIT (${pos.hoursRemaining || 8}H)`}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

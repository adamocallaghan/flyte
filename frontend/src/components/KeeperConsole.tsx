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
  keeperRewardEst: number;
  marginRatio: number;
}

export const KeeperConsole: React.FC = () => {
  const {
    account,
    role,
    setRole,
    appContract,
    isFork,
    refreshBalances,
  } = useWeb3();

  const { btcPrice, refreshMarketStats } = useMarket();

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

            // Funding ready check (>= 8 hours)
            const now = Math.floor(Date.now() / 1000);
            const isFundingReady = (now - lastFunding) >= 28800;

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
  }, [appContract, btcPrice]);

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
      text: `Keeper Ronald executing liquidation on Position #${pos.id} (Claiming ${formatUsd(pos.keeperRewardEst)} reward)...`,
    });

    try {
      if (appContract && appContract.runner) {
        let contractToCall = appContract;

        // In Anvil fork, ensure Keeper Ronald is the caller
        if (isFork && role !== 'keeper') {
          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          const keeperWallet = new ethers.Wallet(DEMO_ROLES.keeper.privateKey, anvilProv);
          contractToCall = appContract.connect(keeperWallet) as any;
        }

        const tx = await (contractToCall as any).liquidate(pos.id);
        const receipt = await tx.wait();

        setTotalRewardsClaimed((prev) => prev + pos.keeperRewardEst);
        setStatusMessage({
          type: 'success',
          text: `🎉 Liquidation successful! Position #${pos.id} liquidated. Keeper reward of ${formatUsd(pos.keeperRewardEst)} aUSDC sent to Ronald! Tx: ${shortenAddress(receipt.hash)}`,
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
          text: `🎉 Liquidation simulated! Keeper reward of ${formatUsd(pos.keeperRewardEst)} aUSDC awarded to Ronald.`,
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
      text: `Settling 8h funding interval for Position #${pos.id} via SwapVM Opcode 0x75...`,
    });

    try {
      if (appContract && appContract.runner) {
        let contractToCall = appContract;
        if (isFork && role !== 'keeper') {
          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          const keeperWallet = new ethers.Wallet(DEMO_ROLES.keeper.privateKey, anvilProv);
          contractToCall = appContract.connect(keeperWallet) as any;
        }

        const tx = await (contractToCall as any).settleFunding(pos.id);
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
      setStatusMessage({
        type: 'error',
        text: err.reason || err.message || 'Funding interval (8 hours) not reached yet.',
      });
    } finally {
      setExecutingId(null);
      setExecutingType(null);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  // 3. Fast Forward Time (+8 Hours) on Anvil Fork
  const handleFastForwardTime = async () => {
    setExecutingType('warp');
    setStatusMessage({ type: 'info', text: 'Fast-forwarding block timestamp by 8 hours (28,800s)...' });

    try {
      if (isFork) {
        const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
        await anvilProv.send('evm_increaseTime', [28800]);
        await anvilProv.send('evm_mine', []);

        setStatusMessage({
          type: 'success',
          text: '⏩ Time fast-forwarded by +8 hours! Funding intervals are now eligible for settlement.',
        });

        await scanPositions();
        await refreshMarketStats();
      } else {
        setStatusMessage({
          type: 'info',
          text: 'Time warp is only available on local Anvil fork.',
        });
      }
    } catch (err: any) {
      console.error('Time warp failed:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Could not fast forward time' });
    } finally {
      setExecutingType(null);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const liquidatableCount = monitoredPositions.filter((p) => p.isLiquidatable).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Role Alert Banner if not Ronald */}
      {role !== 'keeper' && (
        <div
          style={{
            background: 'rgba(147, 51, 234, 0.1)',
            border: '1px solid rgba(147, 51, 234, 0.3)',
            borderRadius: '12px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🤖</span>
            <span style={{ fontSize: '0.85rem', color: '#d8b4fe' }}>
              You are currently viewing as <strong>{role.toUpperCase()}</strong>. Switch to <strong>Keeper (Ronald)</strong> to execute 1-click keeper liquidations.
            </span>
          </div>
          <button
            onClick={() => setRole('keeper')}
            style={{
              background: '#9333ea',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 14px',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Switch to Ronald
          </button>
        </div>
      )}

      {/* TOP: Keeper Metrics & Fast-Forward Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Metric 1: Keeper Reward Rate */}
        <div
          style={{
            background: '#0d1424',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Keeper Bounty Rate
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace', margin: '4px 0' }}>
            1.00%
          </div>
          <span style={{ fontSize: '0.8rem', color: '#10b981' }}>
            100 bps fee paid directly on each liquidation
          </span>
        </div>

        {/* Metric 2: Earned Rewards */}
        <div
          style={{
            background: '#0d1424',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Bounties Claimed
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', fontFamily: 'monospace', margin: '4px 0' }}>
            +{formatUsd(totalRewardsClaimed)}
          </div>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Keeper Ronald (0x90F7...b906)
          </span>
        </div>

        {/* Metric 3: Time Warp Tool */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0d1424 0%, #171128 100%)',
            border: '1px solid rgba(147, 51, 234, 0.25)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
              Anvil Time Controller
            </div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
              Advance EVM timestamp by 8 hours to test funding settlement epochs.
            </div>
          </div>
          <button
            onClick={handleFastForwardTime}
            disabled={executingType === 'warp'}
            style={{
              marginTop: '12px',
              background: 'rgba(147, 51, 234, 0.15)',
              border: '1px solid rgba(147, 51, 234, 0.4)',
              borderRadius: '8px',
              padding: '8px 14px',
              color: '#c084fc',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: executingType === 'warp' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>⏩</span>
            <span>Fast-Forward +8 Hours</span>
          </button>
        </div>
      </div>

      {/* Demo Liquidation Tip Banner */}
      <div
        style={{
          background: 'rgba(0, 240, 255, 0.05)',
          border: '1px solid rgba(0, 240, 255, 0.15)',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '0.85rem',
          color: '#cbd5e1',
          lineHeight: 1.5,
        }}
      >
        <span style={{ fontSize: '1.2rem' }}>💡</span>
        <div>
          <strong style={{ color: '#00f0ff' }}>Judging &amp; Demo Walkthrough:</strong> Want to trigger a live liquidation? Use the <strong>⚡ Simulate Price</strong> button in the top bar, click <strong>-10% Liquidate ($54k)</strong> to crash the mark price. The position below will turn red and become eligible for instant liquidation!
        </div>
      </div>

      {/* Action Notification Toast */}
      {statusMessage && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '0.85rem',
            lineHeight: 1.4,
            background:
              statusMessage.type === 'success'
                ? 'rgba(16, 185, 129, 0.12)'
                : statusMessage.type === 'error'
                ? 'rgba(244, 63, 94, 0.12)'
                : 'rgba(0, 240, 255, 0.12)',
            border: `1px solid ${
              statusMessage.type === 'success'
                ? 'rgba(16, 185, 129, 0.3)'
                : statusMessage.type === 'error'
                ? 'rgba(244, 63, 94, 0.3)'
                : 'rgba(0, 240, 255, 0.3)'
            }`,
            color:
              statusMessage.type === 'success'
                ? '#10b981'
                : statusMessage.type === 'error'
                ? '#f43f5e'
                : '#00f0ff',
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Monitored Positions Table */}
      <div
        style={{
          background: '#0d1424',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', fontWeight: 800 }}>
              Protocol Position Radar
            </h4>
            <span
              style={{
                fontSize: '0.75rem',
                background: liquidatableCount > 0 ? 'rgba(244, 63, 94, 0.2)' : 'rgba(0, 240, 255, 0.12)',
                color: liquidatableCount > 0 ? '#f43f5e' : '#00f0ff',
                padding: '2px 8px',
                borderRadius: '999px',
                fontWeight: 700,
                border: `1px solid ${liquidatableCount > 0 ? 'rgba(244, 63, 94, 0.4)' : 'rgba(0, 240, 255, 0.2)'}`,
              }}
            >
              {liquidatableCount > 0 ? `🚨 ${liquidatableCount} LIQUIDATABLE` : `${monitoredPositions.length} Monitored`}
            </span>
            {isScanning && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>scanning...</span>}
          </div>

          <button
            onClick={scanPositions}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '6px 12px',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            🔄 Scan
          </button>
        </div>

        {monitoredPositions.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              background: 'rgba(15, 23, 42, 0.4)',
              borderRadius: '12px',
              border: '1px dashed rgba(255, 255, 255, 0.08)',
              color: '#94a3b8',
            }}
          >
            No active positions found in protocol to monitor. Open a position in the Trade tab to test keeper functions.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                  <th style={{ padding: '12px 8px' }}>Position</th>
                  <th style={{ padding: '12px 8px' }}>Trader</th>
                  <th style={{ padding: '12px 8px' }}>Notional</th>
                  <th style={{ padding: '12px 8px' }}>Margin Health</th>
                  <th style={{ padding: '12px 8px' }}>1% Keeper Bounty</th>
                  <th style={{ padding: '12px 8px' }}>Funding Status</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {monitoredPositions.map((pos) => (
                  <tr
                    key={pos.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      background: pos.isLiquidatable ? 'rgba(244, 63, 94, 0.08)' : 'transparent',
                      transition: 'background 0.3s ease',
                    }}
                  >
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            background: pos.isLong ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                            color: pos.isLong ? '#10b981' : '#f43f5e',
                          }}
                        >
                          {pos.isLong ? 'LONG' : 'SHORT'}
                        </span>
                        <span style={{ fontWeight: 700, color: '#f8fafc' }}>BTC #{pos.id}</span>
                      </div>
                    </td>

                    <td style={{ padding: '12px 8px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                      {shortenAddress(pos.trader)}
                    </td>

                    <td style={{ padding: '12px 8px', fontWeight: 700, fontFamily: 'monospace', color: '#f8fafc' }}>
                      {formatUsd(pos.notional)}
                    </td>

                    <td style={{ padding: '12px 8px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: pos.isLiquidatable
                            ? 'rgba(244, 63, 94, 0.25)'
                            : pos.marginRatio < 8
                            ? 'rgba(245, 158, 11, 0.2)'
                            : 'rgba(16, 185, 129, 0.15)',
                          color: pos.isLiquidatable ? '#f43f5e' : pos.marginRatio < 8 ? '#f59e0b' : '#10b981',
                        }}
                      >
                        {pos.isLiquidatable ? '🔴 LIQUIDATABLE' : `${pos.marginRatio.toFixed(1)}% Ratio`}
                      </span>
                    </td>

                    <td style={{ padding: '12px 8px', color: '#10b981', fontWeight: 700, fontFamily: 'monospace' }}>
                      +{formatUsd(pos.keeperRewardEst)} aUSDC
                    </td>

                    <td style={{ padding: '12px 8px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: pos.isFundingReady ? '#c084fc' : '#94a3b8',
                          fontWeight: pos.isFundingReady ? 700 : 400,
                        }}
                      >
                        {pos.isFundingReady ? '⚡ Eligible (≥8h)' : 'Running (8h epoch)'}
                      </span>
                    </td>

                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {pos.isLiquidatable ? (
                          <button
                            onClick={() => handleLiquidate(pos)}
                            disabled={executingId === pos.id}
                            style={{
                              background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              color: '#ffffff',
                              fontWeight: 800,
                              fontSize: '0.75rem',
                              cursor: executingId === pos.id ? 'not-allowed' : 'pointer',
                              boxShadow: '0 2px 10px rgba(244, 63, 94, 0.4)',
                            }}
                          >
                            {executingId === pos.id && executingType === 'liquidate'
                              ? 'Liquidating...'
                              : `⚡ Liquidate (${formatUsd(pos.keeperRewardEst)})`}
                          </button>
                        ) : null}

                        <button
                          onClick={() => handleSettleFunding(pos)}
                          disabled={executingId === pos.id}
                          style={{
                            background: 'rgba(147, 51, 234, 0.12)',
                            border: '1px solid rgba(147, 51, 234, 0.3)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            color: '#c084fc',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: executingId === pos.id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {executingId === pos.id && executingType === 'funding'
                            ? 'Settling...'
                            : 'Settle Funding'}
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

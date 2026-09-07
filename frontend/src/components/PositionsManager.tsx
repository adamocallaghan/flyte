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
    <div
      style={{
        background: '#0d1424',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Header & Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: 800 }}>
            Active Positions
          </h3>
          <span
            style={{
              fontSize: '0.75rem',
              background: 'rgba(0, 240, 255, 0.12)',
              color: '#00f0ff',
              padding: '2px 8px',
              borderRadius: '999px',
              fontWeight: 700,
            }}
          >
            {displayedPositions.length} Open
          </span>
          {isLoading && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>syncing...</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              background: 'rgba(15, 23, 42, 0.8)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <button
              onClick={() => setFilterMine(false)}
              style={{
                background: !filterMine ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                color: !filterMine ? '#00f0ff' : '#94a3b8',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              All Positions
            </button>
            <button
              onClick={() => setFilterMine(true)}
              style={{
                background: filterMine ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                color: filterMine ? '#00f0ff' : '#94a3b8',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              My Account
            </button>
          </div>

          <button
            onClick={fetchPositions}
            title="Refresh positions"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '6px 10px',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            🔄
          </button>
        </div>
      </div>

      {/* Action Notification Toast */}
      {actionStatus && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '0.85rem',
            lineHeight: 1.4,
            background:
              actionStatus.type === 'success'
                ? 'rgba(16, 185, 129, 0.12)'
                : actionStatus.type === 'error'
                ? 'rgba(244, 63, 94, 0.12)'
                : 'rgba(0, 240, 255, 0.12)',
            border: `1px solid ${
              actionStatus.type === 'success'
                ? 'rgba(16, 185, 129, 0.3)'
                : actionStatus.type === 'error'
                ? 'rgba(244, 63, 94, 0.3)'
                : 'rgba(0, 240, 255, 0.3)'
            }`,
            color:
              actionStatus.type === 'success'
                ? '#10b981'
                : actionStatus.type === 'error'
                ? '#f43f5e'
                : '#00f0ff',
          }}
        >
          {actionStatus.text}
        </div>
      )}

      {/* Positions Content */}
      {displayedPositions.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 20px',
            background: 'rgba(15, 23, 42, 0.4)',
            borderRadius: '12px',
            border: '1px dashed rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📊</div>
          <h4 style={{ margin: '0 0 8px', color: '#f8fafc', fontSize: '1.1rem' }}>
            No Open Positions
          </h4>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto', lineHeight: 1.5 }}>
            Use the order terminal above to open your first 1inch Aqua JIT-leveraged perpetual position!
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                <th style={{ padding: '12px 8px' }}>Position</th>
                <th style={{ padding: '12px 8px' }}>Size / Notional</th>
                <th style={{ padding: '12px 8px' }}>Entry Price</th>
                <th style={{ padding: '12px 8px' }}>Mark Price</th>
                <th style={{ padding: '12px 8px' }}>Unrealized PnL (ROE)</th>
                <th style={{ padding: '12px 8px' }}>Margin / Health</th>
                <th style={{ padding: '12px 8px' }}>Liquidation</th>
                <th style={{ padding: '12px 8px' }}>Counterparty LP</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayedPositions.map((pos) => {
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
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      background: 'transparent',
                      transition: 'background 0.2s ease',
                    }}
                  >
                    {/* 1. Position ID & Side */}
                    <td style={{ padding: '14px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            background: pos.isLong ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                            color: pos.isLong ? '#10b981' : '#f43f5e',
                            border: `1px solid ${pos.isLong ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                          }}
                        >
                          {pos.isLong ? 'LONG' : 'SHORT'}
                        </span>
                        <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                          BTC/USD
                        </span>
                        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>#{pos.id}</span>
                      </div>
                    </td>

                    {/* 2. Size & Leverage */}
                    <td style={{ padding: '14px 8px' }}>
                      <div style={{ fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>
                        {formatUsd(pos.notional)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#00f0ff', fontWeight: 600 }}>
                        {pos.leverage}x Lev • {(pos.notional / btcPrice).toFixed(4)} BTC
                      </div>
                    </td>

                    {/* 3. Entry Price */}
                    <td style={{ padding: '14px 8px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                      {formatUsd(pos.entryPrice)}
                    </td>

                    {/* 4. Mark Price */}
                    <td style={{ padding: '14px 8px', fontFamily: 'monospace', color: '#f8fafc', fontWeight: 600 }}>
                      {formatUsd(btcPrice)}
                    </td>

                    {/* 5. Unrealized PnL (ROE) */}
                    <td style={{ padding: '14px 8px' }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          color: isProfitable ? '#10b981' : '#f43f5e',
                        }}
                      >
                        {isProfitable ? `+${formatUsd(pnlUsd)}` : formatUsd(pnlUsd)}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: isProfitable ? '#10b981' : '#f43f5e',
                        }}
                      >
                        {isProfitable ? `+${roePercent.toFixed(2)}%` : `${roePercent.toFixed(2)}%`}
                      </div>
                    </td>

                    {/* 6. Margin & Health */}
                    <td style={{ padding: '14px 8px' }}>
                      <div style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>
                        {formatUsd(pos.traderMargin)} aUSDC
                      </div>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: isLiquidatable
                            ? 'rgba(244, 63, 94, 0.2)'
                            : isWarning
                            ? 'rgba(245, 158, 11, 0.2)'
                            : 'rgba(16, 185, 129, 0.15)',
                          color: isLiquidatable ? '#f43f5e' : isWarning ? '#f59e0b' : '#10b981',
                        }}
                      >
                        {isLiquidatable ? 'LIQUIDATABLE' : `${marginRatio.toFixed(1)}% Ratio`}
                      </span>
                    </td>

                    {/* 7. Liquidation Price */}
                    <td style={{ padding: '14px 8px', fontFamily: 'monospace', color: '#f43f5e', fontWeight: 600 }}>
                      {formatUsd(liqPrice)}
                    </td>

                    {/* 8. Counterparty LP */}
                    <td style={{ padding: '14px 8px' }}>
                      <div style={{ fontSize: '0.8rem', color: '#cbd5e1', fontFamily: 'monospace' }}>
                        {shortenAddress(pos.lp)}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        Aqua JIT Collateral
                      </span>
                    </td>

                    {/* 9. Action: Close */}
                    <td style={{ padding: '14px 8px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleClosePosition(pos)}
                        disabled={closingId === pos.id}
                        id={`btn-close-position-${pos.id}`}
                        style={{
                          background: 'rgba(244, 63, 94, 0.12)',
                          border: '1px solid rgba(244, 63, 94, 0.3)',
                          borderRadius: '8px',
                          padding: '6px 14px',
                          color: '#f43f5e',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: closingId === pos.id ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {closingId === pos.id ? 'Closing...' : 'Close'}
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

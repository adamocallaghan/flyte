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
        // Direct on-chain execution: openPosition(strategy, isLong, notional, leverage)
        const tx = await (appContract as any)['openPosition((address,address,uint256,uint256,uint256,uint8,uint256),bool,uint256,uint256)'](
          strategy,
          isLong,
          notionalRaw,
          BigInt(leverage)
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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 420px) 1fr',
        gap: '24px',
        alignItems: 'start',
      }}
    >
      {/* LEFT: Order Entry Terminal */}
      <div
        style={{
          background: '#0d1424',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', fontWeight: 800 }}>
            Place Order
          </h3>
          <span
            style={{
              fontSize: '0.75rem',
              color: '#00f0ff',
              background: 'rgba(0, 240, 255, 0.1)',
              padding: '3px 8px',
              borderRadius: '6px',
              fontWeight: 600,
            }}
          >
            1inch Aqua RFQ
          </span>
        </div>

        {/* 1. Long / Short Selector */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            background: 'rgba(15, 23, 42, 0.8)',
            padding: '4px',
            borderRadius: '10px',
            marginBottom: '20px',
          }}
        >
          <button
            onClick={() => setIsLong(true)}
            id="order-side-long"
            style={{
              background: isLong ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
              color: isLong ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: '8px',
              padding: '10px',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            📈 Long (Buy)
          </button>
          <button
            onClick={() => setIsLong(false)}
            id="order-side-short"
            style={{
              background: !isLong ? 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' : 'transparent',
              color: !isLong ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: '8px',
              padding: '10px',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            📉 Short (Sell)
          </button>
        </div>

        {/* 2. Margin Input */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
            <span style={{ color: '#cbd5e1', fontWeight: 600 }}>Collateral (Margin)</span>
            <span style={{ color: '#94a3b8' }}>
              Avail: <strong style={{ color: '#00f0ff' }}>{balances.aUsdc} aUSDC</strong>
            </span>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              step="10"
              min="10"
              max="50000"
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              id="input-margin-amount"
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '10px',
                padding: '12px 70px 12px 14px',
                color: '#f8fafc',
                fontSize: '1.1rem',
                fontWeight: 700,
                fontFamily: 'monospace',
              }}
            />
            <span
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: '0.85rem',
              }}
            >
              aUSDC
            </span>
          </div>

          {/* Quick % buttons */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => handleQuickPercent(pct)}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '4px',
                  color: '#94a3b8',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* 3. Leverage Selector */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '8px' }}>
            <span style={{ color: '#cbd5e1', fontWeight: 600 }}>Leverage</span>
            <span style={{ color: '#00f0ff', fontWeight: 800, fontFamily: 'monospace' }}>
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
            style={{
              width: '100%',
              accentColor: '#00f0ff',
              cursor: 'pointer',
              marginBottom: '10px',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {[1, 2, 3, 5, 7, 10].map((lev) => (
              <button
                key={lev}
                type="button"
                onClick={() => setLeverage(lev)}
                style={{
                  background: leverage === lev ? 'rgba(0, 240, 255, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                  border: leverage === lev ? '1px solid #00f0ff' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  color: leverage === lev ? '#00f0ff' : '#94a3b8',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {lev}x
              </button>
            ))}
          </div>
        </div>

        {/* 4. Execution / Summary Breakdown */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '10px',
            padding: '14px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '0.8rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>Position Size</span>
            <span style={{ color: '#f8fafc', fontWeight: 600, fontFamily: 'monospace' }}>
              {formatUsd(notional)} ({btcSize.toFixed(4)} BTC)
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>Entry Price (0.1% spread)</span>
            <span style={{ color: '#f8fafc', fontFamily: 'monospace' }}>{formatUsd(entryPrice)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>Est. Liquidation Price</span>
            <span
              style={{
                color: isLong ? '#f43f5e' : '#10b981',
                fontWeight: 700,
                fontFamily: 'monospace',
              }}
            >
              {formatUsd(liqPrice)}
            </span>
          </div>

          <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '4px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>SwapVM Execution Fee (10 bps)</span>
            <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{formatUsd(spreadFee)} aUSDC</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#00f0ff', fontWeight: 600 }}>Total Required Deposit</span>
            <span style={{ color: '#00f0ff', fontWeight: 700, fontFamily: 'monospace' }}>
              {formatUsd(totalTraderRequired)} aUSDC
            </span>
          </div>
        </div>

        {/* 5. Action Buttons (Approve / Submit) */}
        {!isAllowanceSufficient ? (
          <button
            type="button"
            onClick={handleApprove}
            disabled={isApproving}
            id="btn-approve-collateral"
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              border: 'none',
              borderRadius: '10px',
              padding: '14px',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
            }}
          >
            {isApproving ? 'Approving aUSDC...' : '1. Approve aUSDC for Flyte'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleOpenPosition}
            disabled={isSubmitting || margin <= 0}
            id="btn-open-position"
            style={{
              width: '100%',
              background: isLong
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
              border: 'none',
              borderRadius: '10px',
              padding: '14px',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '1rem',
              cursor: isSubmitting || margin <= 0 ? 'not-allowed' : 'pointer',
              boxShadow: isLong
                ? '0 4px 16px rgba(16, 185, 129, 0.4)'
                : '0 4px 16px rgba(244, 63, 94, 0.4)',
              transition: 'all 0.2s ease',
            }}
          >
            {isSubmitting
              ? 'Opening Position via Aqua...'
              : `${isLong ? 'Open Long' : 'Open Short'} (${formatUsd(notional)})`}
          </button>
        )}

        {/* Status Message */}
        {orderStatus && (
          <div
            style={{
              marginTop: '14px',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              lineHeight: 1.4,
              background:
                orderStatus.type === 'success'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : orderStatus.type === 'error'
                  ? 'rgba(244, 63, 94, 0.12)'
                  : 'rgba(0, 240, 255, 0.12)',
              border: `1px solid ${
                orderStatus.type === 'success'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : orderStatus.type === 'error'
                  ? 'rgba(244, 63, 94, 0.3)'
                  : 'rgba(0, 240, 255, 0.3)'
              }`,
              color:
                orderStatus.type === 'success'
                  ? '#10b981'
                  : orderStatus.type === 'error'
                  ? '#f43f5e'
                  : '#00f0ff',
            }}
          >
            {orderStatus.text}
          </div>
        )}
      </div>

      {/* RIGHT: Architecture Highlights & JIT RFQ Quote Inspector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* JIT RFQ Counterparty Quote Card */}
        <div
          style={{
            background: '#0d1424',
            border: '1px solid rgba(0, 240, 255, 0.25)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.4rem' }}>💧</span>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', fontWeight: 800 }}>
                  Active JIT Liquidity Quote
                </h4>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Sourced Just-In-Time from LP Maker via 1inch Aqua Registry
                </span>
              </div>
            </div>
            <span
              style={{
                fontSize: '0.7rem',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                padding: '3px 8px',
                borderRadius: '6px',
                fontWeight: 700,
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              🟢 LIVE QUOTE
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '12px', borderRadius: '10px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>LP Maker</span>
              <div style={{ fontSize: '0.9rem', color: '#f8fafc', fontWeight: 700, fontFamily: 'monospace' }}>
                Grimace ({shortenAddress(DEMO_ROLES.lp.address)})
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '12px', borderRadius: '10px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Available JIT Depth</span>
              <div style={{ fontSize: '0.9rem', color: '#00f0ff', fontWeight: 700, fontFamily: 'monospace' }}>
                $50,000 aUSDC
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '12px', borderRadius: '10px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>LP Margin JIT Pulled</span>
              <div style={{ fontSize: '0.9rem', color: '#f8fafc', fontWeight: 700, fontFamily: 'monospace' }}>
                {formatUsd(margin)} aUSDC
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '12px', borderRadius: '10px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Native Aave Yield</span>
              <div style={{ fontSize: '0.9rem', color: '#10b981', fontWeight: 700, fontFamily: 'monospace' }}>
                ~4.25% APY
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'rgba(0, 240, 255, 0.05)',
              border: '1px solid rgba(0, 240, 255, 0.15)',
              borderRadius: '10px',
              padding: '12px 16px',
              fontSize: '0.8rem',
              color: '#94a3b8',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: '#00f0ff' }}>The Flyte Innovation:</strong> The LP’s $50,000 capital is NOT locked idle in the perp contract. It remains in Grimace’s wallet earning Aave v3 supply yield until the moment you click "Open Position", when 1inch Aqua executes a single atomic <code>AQUA.pull()</code> for exactly {formatUsd(margin)} counter-margin!
          </div>
        </div>

        {/* SwapVM Instruction Breakdown */}
        <div
          style={{
            background: '#0d1424',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span style={{ fontSize: '1.2rem' }}>⚙️</span>
            <h4 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc', fontWeight: 700 }}>
              SwapVM Custom Opcode Execution
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(15, 23, 42, 0.7)',
                borderRadius: '8px',
              }}
            >
              <span style={{ color: '#c084fc', fontFamily: 'monospace' }}>OP_MARGIN_CALC (0x74)</span>
              <span style={{ color: '#cbd5e1' }}>
                Validates notional {formatUsd(notional)}, computes trader margin {formatUsd(margin)} &amp; LP margin {formatUsd(margin)}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(15, 23, 42, 0.7)',
                borderRadius: '8px',
              }}
            >
              <span style={{ color: '#c084fc', fontFamily: 'monospace' }}>OP_FUNDING_CALC (0x75)</span>
              <span style={{ color: '#cbd5e1' }}>
                Computes OI skew-based rate adjustment against 8h funding interval
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

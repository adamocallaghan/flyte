'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import {
  A_USDC_ADDRESS,
  AQUA_REGISTRY_ADDRESS,
  DEMO_ROLES,
  formatUsd,
  shortenAddress,
  LOCAL_RPC_URL,
} from '../config/contracts';

export interface ShippedQuote {
  strategyHash: string;
  maker: string;
  collateralToken: string;
  maxNotional: number;
  maxLeverage: number;
  spreadBps: number;
  sideMask: number;
  quoteExpiry: number;
  status: 'active' | 'docked';
}

const DEFAULT_DEFAULT_QUOTE: ShippedQuote = {
  strategyHash: '0x8f2d5e3c7b1a40992384a6c8e5f1b0a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
  maker: DEMO_ROLES.lp.address,
  collateralToken: A_USDC_ADDRESS,
  maxNotional: 50000,
  maxLeverage: 10,
  spreadBps: 10,
  sideMask: 3,
  quoteExpiry: 0,
  status: 'active',
};

export const LPConsole: React.FC = () => {
  const {
    account,
    role,
    setRole,
    balances,
    aquaContract,
    aUsdcContract,
    appAddress,
    isFork,
    refreshBalances,
  } = useWeb3();

  // Quote Shipper Form State
  const [maxNotionalInput, setMaxNotionalInput] = useState<string>('50000');
  const [maxLeverage, setMaxLeverage] = useState<number>(10);
  const [spreadBps, setSpreadBps] = useState<number>(10);
  const [sideMask, setSideMask] = useState<number>(3); // 3 = Both, 1 = Long, 2 = Short
  const [quoteExpiry, setQuoteExpiry] = useState<number>(0); // 0 = perpetual

  const [shippedQuotes, setShippedQuotes] = useState<ShippedQuote[]>([DEFAULT_DEFAULT_QUOTE]);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isShipping, setIsShipping] = useState<boolean>(false);
  const [dockingHash, setDockingHash] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Aave v3 Yield Calculation (4.25% APY)
  const apy = 4.25;
  const lpBalance = parseFloat(balances.aUsdc) > 0 ? parseFloat(balances.aUsdc) : 50000;
  const annualInterest = (lpBalance * apy) / 100;
  const monthlyInterest = annualInterest / 12;
  const dailyInterest = annualInterest / 365;

  // Real-time ticking interest counter (adds simulated micro-yield)
  const [accruedYield, setAccruedYield] = useState<number>(12.458);

  useEffect(() => {
    const interval = setInterval(() => {
      // Accrue interest every second based on APY
      const perSecond = annualInterest / (365 * 86400);
      setAccruedYield((prev) => prev + perSecond);
    }, 1000);
    return () => clearInterval(interval);
  }, [annualInterest]);

  // Allowance check for 1inch Aqua
  const notionalAmount = parseFloat(maxNotionalInput) || 0;
  const notionalRaw = ethers.parseUnits(notionalAmount > 0 ? notionalAmount.toFixed(6) : '0', 6);
  const isAquaAllowanceSufficient = balances.aUsdcAllowanceAqua >= notionalRaw && notionalRaw > BigInt(0);

  // 1. Approve aUSDC for 1inch Aqua Registry
  const handleApproveAqua = async () => {
    if (!aUsdcContract) return;
    setIsApproving(true);
    setStatusMessage({ type: 'info', text: 'Approving aUSDC for 1inch Aqua Registry...' });

    try {
      let tokenContract = aUsdcContract;

      // In Anvil fork mode, ensure Grimace is the signer
      if (isFork && role !== 'lp') {
        const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
        const lpWallet = new ethers.Wallet(DEMO_ROLES.lp.privateKey, anvilProv);
        tokenContract = aUsdcContract.connect(lpWallet) as any;
      }

      const tx = await (tokenContract as any).approve(AQUA_REGISTRY_ADDRESS, ethers.MaxUint256);
      await tx.wait();
      await refreshBalances();

      setStatusMessage({ type: 'success', text: '✅ aUSDC successfully approved for 1inch Aqua!' });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      console.error('Aqua approval failed:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Approval failed' });
    } finally {
      setIsApproving(false);
    }
  };

  // 2. Ship Strategy to 1inch Aqua
  const handleShipStrategy = async () => {
    if (notionalAmount <= 0) {
      alert('Please enter a valid notional depth');
      return;
    }

    setIsShipping(true);
    setStatusMessage({
      type: 'info',
      text: `Shipping JIT quote (${formatUsd(notionalAmount)} aUSDC depth) to 1inch Aqua...`,
    });

    try {
      const lpAddr = role === 'lp' ? account || DEMO_ROLES.lp.address : DEMO_ROLES.lp.address;

      // Strategy Struct tuple
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const strategyBytes = abiCoder.encode(
        ['tuple(address lp, address collateralToken, uint256 maxNotional, uint256 maxLeverage, uint256 spreadBps, uint8 sideMask, uint256 quoteExpiry)'],
        [[
          lpAddr,
          A_USDC_ADDRESS,
          notionalRaw,
          BigInt(maxLeverage),
          BigInt(spreadBps),
          sideMask,
          BigInt(quoteExpiry),
        ]]
      );

      const computedHash = ethers.keccak256(strategyBytes);

      if (aquaContract && aquaContract.runner) {
        let contractToCall = aquaContract;

        // In Anvil fork, use Grimace signer for 1-click execution
        if (isFork && role !== 'lp') {
          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          const lpWallet = new ethers.Wallet(DEMO_ROLES.lp.privateKey, anvilProv);
          contractToCall = aquaContract.connect(lpWallet) as any;
        }

        const tx = await (contractToCall as any).ship(
          appAddress,
          strategyBytes,
          [A_USDC_ADDRESS],
          [notionalRaw]
        );
        const receipt = await tx.wait();

        const newQuote: ShippedQuote = {
          strategyHash: computedHash,
          maker: lpAddr,
          collateralToken: A_USDC_ADDRESS,
          maxNotional: notionalAmount,
          maxLeverage,
          spreadBps,
          sideMask,
          quoteExpiry,
          status: 'active',
        };

        setShippedQuotes((prev) => [newQuote, ...prev.filter((q) => q.strategyHash !== computedHash)]);
        await refreshBalances();

        setStatusMessage({
          type: 'success',
          text: `🎉 Quote shipped to 1inch Aqua! Hash: ${shortenAddress(computedHash)}. Tx: ${shortenAddress(receipt.hash)}`,
        });
      } else {
        // Demo fallback
        await new Promise((r) => setTimeout(r, 1000));
        const newQuote: ShippedQuote = {
          strategyHash: computedHash,
          maker: lpAddr,
          collateralToken: A_USDC_ADDRESS,
          maxNotional: notionalAmount,
          maxLeverage,
          spreadBps,
          sideMask,
          quoteExpiry,
          status: 'active',
        };
        setShippedQuotes((prev) => [newQuote, ...prev]);
        setStatusMessage({
          type: 'success',
          text: `🎉 Quote shipped (Demo Mode)! Hash: ${shortenAddress(computedHash)}`,
        });
      }
    } catch (err: any) {
      console.error('Ship strategy failed:', err);
      setStatusMessage({
        type: 'error',
        text: err.reason || err.message || 'Failed to ship quote to Aqua',
      });
    } finally {
      setIsShipping(false);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  // 3. Dock (Deactivate) Strategy on Aqua
  const handleDockStrategy = async (quote: ShippedQuote) => {
    setDockingHash(quote.strategyHash);
    setStatusMessage({ type: 'info', text: `Docking strategy ${shortenAddress(quote.strategyHash)} on Aqua...` });

    try {
      if (aquaContract && aquaContract.runner) {
        let contractToCall = aquaContract;
        if (isFork && role !== 'lp') {
          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          const lpWallet = new ethers.Wallet(DEMO_ROLES.lp.privateKey, anvilProv);
          contractToCall = aquaContract.connect(lpWallet) as any;
        }

        const tx = await (contractToCall as any).dock(
          appAddress,
          quote.strategyHash,
          [A_USDC_ADDRESS]
        );
        await tx.wait();
      }

      setShippedQuotes((prev) =>
        prev.map((q) => (q.strategyHash === quote.strategyHash ? { ...q, status: 'docked' } : q))
      );

      setStatusMessage({
        type: 'success',
        text: `✅ Strategy ${shortenAddress(quote.strategyHash)} successfully docked and revoked!`,
      });
    } catch (err: any) {
      console.error('Dock failed:', err);
      setStatusMessage({ type: 'error', text: err.reason || err.message || 'Failed to dock strategy' });
    } finally {
      setDockingHash(null);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Role Notice Banner (if not in LP role) */}
      {role !== 'lp' && (
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '12px',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>💡</span>
            <span style={{ fontSize: '0.85rem', color: '#93c5fd' }}>
              You are currently viewing as <strong>{role.toUpperCase()}</strong>. Switch to <strong>LP Maker (Grimace)</strong> for 1-click LP quote operations.
            </span>
          </div>
          <button
            onClick={() => setRole('lp')}
            style={{
              background: '#2563eb',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 14px',
              color: '#ffffff',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Switch to Grimace
          </button>
        </div>
      )}

      {/* TOP SECTION: Aave v3 Yield & Capital Efficiency Monitor */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Card 1: Aave v3 Supply Yield */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0d1424 0%, #111d38 100%)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Aave v3 Yield Accrual
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                padding: '2px 8px',
                borderRadius: '6px',
                fontWeight: 700,
              }}
            >
              {apy}% Supply APY
            </span>
          </div>

          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981', fontFamily: 'monospace', marginBottom: '4px' }}>
            +${accruedYield.toFixed(4)}
          </div>
          <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#94a3b8' }}>
            Live interest accrued in Grimace&apos;s wallet while JIT quotes remain active on 1inch Aqua.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '12px',
              fontSize: '0.75rem',
            }}
          >
            <div>
              <span style={{ color: '#64748b' }}>Daily</span>
              <div style={{ color: '#f8fafc', fontWeight: 600, fontFamily: 'monospace' }}>
                +${dailyInterest.toFixed(2)}
              </div>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Monthly</span>
              <div style={{ color: '#f8fafc', fontWeight: 600, fontFamily: 'monospace' }}>
                +${monthlyInterest.toFixed(2)}
              </div>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Annual</span>
              <div style={{ color: '#f8fafc', fontWeight: 600, fontFamily: 'monospace' }}>
                +${annualInterest.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Capital Efficiency Comparison */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0d1424 0%, #15162e 100%)',
            border: '1px solid rgba(0, 240, 255, 0.25)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Capital Efficiency Multiplier
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                background: 'rgba(0, 240, 255, 0.15)',
                color: '#00f0ff',
                padding: '2px 8px',
                borderRadius: '6px',
                fontWeight: 700,
              }}
            >
              2.8x Efficiency
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, color: '#00f0ff', fontFamily: 'monospace' }}>
              280%
            </span>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>vs Traditional Vaults</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
              <span>Standard Isolated Vaults</span>
              <span style={{ color: '#f43f5e', fontWeight: 600 }}>0% Money Market Yield</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
              <span>Flyte JIT Aqua Sourcing</span>
              <span style={{ color: '#10b981', fontWeight: 600 }}>4.25% Aave + Spread Fees</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
              <span>Liquidity Mobility</span>
              <span style={{ color: '#00f0ff', fontWeight: 600 }}>Zero Lockup (Instant Withdrawal)</span>
            </div>
          </div>
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

      {/* MIDDLE SECTION: Interactive Quote Shipper Form */}
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
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: 800 }}>
              Ship JIT Liquidity Strategy to 1inch Aqua
            </h3>
            <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
              Publish your orderbook quote parameters. Capital remains in your wallet earning Aave yield until matched.
            </p>
          </div>
          <span
            style={{
              fontSize: '0.75rem',
              background: 'rgba(147, 51, 234, 0.15)',
              color: '#c084fc',
              border: '1px solid rgba(147, 51, 234, 0.3)',
              padding: '4px 10px',
              borderRadius: '8px',
              fontWeight: 700,
            }}
          >
            aqua.ship(...)
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '18px',
            marginBottom: '20px',
          }}
        >
          {/* 1. Max Notional Depth */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px', fontWeight: 600 }}>
              Max Notional Depth (aUSDC)
            </label>
            <input
              type="number"
              step="5000"
              min="1000"
              max="500000"
              value={maxNotionalInput}
              onChange={(e) => setMaxNotionalInput(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#f8fafc',
                fontFamily: 'monospace',
                fontSize: '1rem',
                fontWeight: 700,
              }}
            />
          </div>

          {/* 2. Max Leverage Offered */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px', fontWeight: 600 }}>
              Max Leverage Offered
            </label>
            <select
              value={maxLeverage}
              onChange={(e) => setMaxLeverage(parseInt(e.target.value))}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#f8fafc',
                fontSize: '0.9rem',
              }}
            >
              <option value="2">2x Maximum</option>
              <option value="5">5x Maximum</option>
              <option value="10">10x Maximum (Standard)</option>
            </select>
          </div>

          {/* 3. Bid/Ask Spread (bps) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px', fontWeight: 600 }}>
              Maker Spread Fee
            </label>
            <select
              value={spreadBps}
              onChange={(e) => setSpreadBps(parseInt(e.target.value))}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#f8fafc',
                fontSize: '0.9rem',
              }}
            >
              <option value="5">5 bps (0.05% competitive)</option>
              <option value="10">10 bps (0.10% standard)</option>
              <option value="25">25 bps (0.25% high vol)</option>
            </select>
          </div>

          {/* 4. Side Mask */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px', fontWeight: 600 }}>
              Permitted Trader Sides
            </label>
            <select
              value={sideMask}
              onChange={(e) => setSideMask(parseInt(e.target.value))}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#f8fafc',
                fontSize: '0.9rem',
              }}
            >
              <option value="3">Both Longs &amp; Shorts (Mask = 3)</option>
              <option value="1">Longs Only (Mask = 1)</option>
              <option value="2">Shorts Only (Mask = 2)</option>
            </select>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {!isAquaAllowanceSufficient ? (
            <button
              type="button"
              onClick={handleApproveAqua}
              disabled={isApproving}
              id="btn-approve-aqua"
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                border: 'none',
                borderRadius: '10px',
                padding: '12px 24px',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              {isApproving ? 'Approving 1inch Aqua...' : '1. Approve aUSDC for 1inch Aqua'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleShipStrategy}
              disabled={isShipping}
              id="btn-ship-strategy"
              style={{
                background: 'linear-gradient(135deg, #00f0ff 0%, #0070f3 100%)',
                border: 'none',
                borderRadius: '10px',
                padding: '12px 24px',
                color: '#0a0e1a',
                fontWeight: 800,
                fontSize: '0.9rem',
                cursor: isShipping ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 16px rgba(0, 240, 255, 0.3)',
              }}
            >
              {isShipping ? 'Shipping to Aqua...' : 'Ship Strategy to 1inch Aqua'}
            </button>
          )}
        </div>
      </div>

      {/* BOTTOM SECTION: Active Shipped Quotes Inspector */}
      <div
        style={{
          background: '#0d1424',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', fontWeight: 800 }}>
            Active Shipped Strategies on 1inch Aqua
          </h4>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            Registry: {shortenAddress(AQUA_REGISTRY_ADDRESS)}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                <th style={{ padding: '12px 8px' }}>Strategy Hash</th>
                <th style={{ padding: '12px 8px' }}>Maker (LP)</th>
                <th style={{ padding: '12px 8px' }}>Committed Depth</th>
                <th style={{ padding: '12px 8px' }}>Max Lev</th>
                <th style={{ padding: '12px 8px' }}>Spread</th>
                <th style={{ padding: '12px 8px' }}>Permitted Sides</th>
                <th style={{ padding: '12px 8px' }}>Status</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {shippedQuotes.map((q) => (
                <tr
                  key={q.strategyHash}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    opacity: q.status === 'docked' ? 0.5 : 1,
                  }}
                >
                  <td style={{ padding: '12px 8px', fontFamily: 'monospace', color: '#00f0ff' }}>
                    {shortenAddress(q.strategyHash, 6)}
                  </td>
                  <td style={{ padding: '12px 8px', fontFamily: 'monospace', color: '#f8fafc' }}>
                    {shortenAddress(q.maker)}
                  </td>
                  <td style={{ padding: '12px 8px', fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>
                    {formatUsd(q.maxNotional)} aUSDC
                  </td>
                  <td style={{ padding: '12px 8px', color: '#cbd5e1' }}>
                    {q.maxLeverage}x
                  </td>
                  <td style={{ padding: '12px 8px', color: '#cbd5e1' }}>
                    {q.spreadBps} bps ({(q.spreadBps / 100).toFixed(2)}%)
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: 'rgba(255, 255, 255, 0.06)',
                        color: '#cbd5e1',
                      }}
                    >
                      {q.sideMask === 3 ? 'Long & Short' : q.sideMask === 1 ? 'Longs Only' : 'Shorts Only'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: q.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                        color: q.status === 'active' ? '#10b981' : '#f43f5e',
                      }}
                    >
                      {q.status === 'active' ? '🟢 ACTIVE' : 'DOCKED'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                    {q.status === 'active' ? (
                      <button
                        onClick={() => handleDockStrategy(q)}
                        disabled={dockingHash === q.strategyHash}
                        style={{
                          background: 'rgba(244, 63, 94, 0.12)',
                          border: '1px solid rgba(244, 63, 94, 0.3)',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          color: '#f43f5e',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {dockingHash === q.strategyHash ? 'Docking...' : 'Dock / Revoke'}
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Revoked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

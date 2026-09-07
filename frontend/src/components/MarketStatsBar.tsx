'use client';

import React, { useState, useEffect } from 'react';
import { useMarket } from '../context/MarketContext';
import { formatUsd } from '../config/contracts';

interface MarketStatsBarProps {
  onOpenPriceController: () => void;
}

export const MarketStatsBar: React.FC<MarketStatsBarProps> = ({ onOpenPriceController }) => {
  const {
    btcPrice,
    priceDirection,
    priceChange24h,
    longOiUsd,
    shortOiUsd,
    longOiPercent,
    shortOiPercent,
    fundingRate8hPercent,
    isOracleLoading,
  } = useMarket();

  // Next funding countdown (mock 8h epoch countdown)
  const [countdown, setCountdown] = useState('05:32:19');

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const hours = 7 - (now.getUTCHours() % 8);
      const minutes = 59 - now.getUTCMinutes();
      const seconds = 59 - now.getUTCSeconds();
      setCountdown(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  const isPositiveChange = priceChange24h >= 0;
  const isPositiveFunding = fundingRate8hPercent >= 0;

  return (
    <div
      style={{
        background: '#0d1424',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '16px 24px',
        marginBottom: '24px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
      }}
    >
      {/* 1. Market Pair & Type */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #f7931a 0%, #ffab40 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            fontWeight: 800,
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(247, 147, 26, 0.35)',
          }}
        >
          ₿
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
              BTC / USD
            </span>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                background: 'rgba(0, 240, 255, 0.12)',
                color: '#00f0ff',
                border: '1px solid rgba(0, 240, 255, 0.25)',
                padding: '2px 6px',
                borderRadius: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Perp
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            Aave aUSDC Margin • Up to 10x
          </span>
        </div>
      </div>

      {/* 2. Live Oracle & Mark Price */}
      <div style={{ minWidth: '160px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Oracle Mark Price
          </span>
          <span
            className={`status-dot ${isOracleLoading ? 'amber' : 'green'}`}
            style={{ width: '6px', height: '6px' }}
            title={isOracleLoading ? 'Fetching from oracle...' : 'Live oracle connected'}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              fontFamily: 'monospace',
              color: priceDirection === 'up' ? '#10b981' : priceDirection === 'down' ? '#f43f5e' : '#f8fafc',
              transition: 'color 0.3s ease',
            }}
          >
            {formatUsd(btcPrice)}
          </span>
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: isPositiveChange ? '#10b981' : '#f43f5e',
              background: isPositiveChange ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
              padding: '2px 8px',
              borderRadius: '6px',
            }}
          >
            {isPositiveChange ? `+${priceChange24h.toFixed(2)}%` : `${priceChange24h.toFixed(2)}%`}
          </span>
        </div>
      </div>

      {/* 3. 8h Skew-Based Funding Rate */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Funding Rate (8h)
          </span>
          <span
            style={{
              fontSize: '0.65rem',
              background: 'rgba(147, 51, 234, 0.15)',
              color: '#c084fc',
              padding: '1px 5px',
              borderRadius: '4px',
              fontFamily: 'monospace',
            }}
            title="Computed on-chain via SwapVM Opcode 0x75"
          >
            SwapVM 0x75
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span
            style={{
              fontSize: '1.15rem',
              fontWeight: 700,
              fontFamily: 'monospace',
              color: isPositiveFunding ? '#10b981' : '#f43f5e',
            }}
          >
            {isPositiveFunding ? `+${fundingRate8hPercent.toFixed(4)}%` : `${fundingRate8hPercent.toFixed(4)}%`}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            in {countdown}
          </span>
        </div>
      </div>

      {/* 4. Open Interest Skew Meter */}
      <div style={{ minWidth: '220px', flex: '1 1 220px', maxWidth: '300px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
          <span style={{ color: '#00f0ff', fontWeight: 600 }}>
            Long {longOiPercent.toFixed(1)}% (${(longOiUsd / 1000).toFixed(0)}k)
          </span>
          <span style={{ color: '#f43f5e', fontWeight: 600 }}>
            Short {shortOiPercent.toFixed(1)}% (${(shortOiUsd / 1000).toFixed(0)}k)
          </span>
        </div>
        <div
          style={{
            height: '8px',
            background: '#1e293b',
            borderRadius: '999px',
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          <div
            style={{
              width: `${longOiPercent}%`,
              background: 'linear-gradient(90deg, #00f0ff, #0070f3)',
              transition: 'width 0.4s ease',
            }}
          />
          <div
            style={{
              width: `${shortOiPercent}%`,
              background: 'linear-gradient(90deg, #f43f5e, #e11d48)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* 5. Simulate Price Button */}
      <div>
        <button
          onClick={onOpenPriceController}
          id="btn-open-price-controller"
          style={{
            background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.12) 0%, rgba(147, 51, 234, 0.12) 100%)',
            border: '1px solid rgba(0, 240, 255, 0.35)',
            borderRadius: '10px',
            padding: '10px 16px',
            color: '#00f0ff',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: '0 0 16px rgba(0, 240, 255, 0.15)',
          }}
        >
          <span>⚡</span>
          <span>Simulate Price</span>
        </button>
      </div>
    </div>
  );
};

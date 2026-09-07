'use client';

import React, { useState } from 'react';
import { useMarket } from '../context/MarketContext';
import { formatUsd } from '../config/contracts';

interface PriceControllerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PriceController: React.FC<PriceControllerProps> = ({ isOpen, onClose }) => {
  const { btcPrice, setMarketPrice, isUpdatingPrice } = useMarket();

  const [customPrice, setCustomPrice] = useState<string>(btcPrice.toString());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQuickChange = async (targetPrice: number, label: string) => {
    setStatusMessage(`Updating oracle price to ${formatUsd(targetPrice)} (${label})...`);
    const success = await setMarketPrice(targetPrice);
    if (success) {
      setCustomPrice(targetPrice.toString());
      setStatusMessage(`✅ Mock oracle successfully updated to ${formatUsd(targetPrice)}!`);
      setTimeout(() => setStatusMessage(null), 3000);
    } else {
      setStatusMessage(`❌ Failed to update price`);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customPrice);
    if (isNaN(val) || val <= 0) {
      alert('Please enter a valid positive price');
      return;
    }
    setStatusMessage(`Updating oracle price to ${formatUsd(val)}...`);
    const success = await setMarketPrice(val);
    if (success) {
      setStatusMessage(`✅ Mock oracle successfully updated to ${formatUsd(val)}!`);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0f172a',
          border: '1px solid rgba(0, 240, 255, 0.3)',
          borderRadius: '20px',
          padding: '28px',
          width: '92%',
          maxWidth: '540px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7), 0 0 40px rgba(0, 240, 255, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.5rem' }}>⚡</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#f8fafc', fontWeight: 800 }}>
                Live Mock Oracle Controller
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#00f0ff', fontWeight: 600 }}>
                Interactive Demo &amp; Stress-Testing Suite
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.3rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '20px' }}>
          Directly manipulate the on-chain BTC/USD oracle price on your local Anvil fork. Test PnL swings,
          observe SwapVM funding rate calculations, or crash the price to trigger <strong>keeper liquidations</strong>!
        </p>

        {/* Current Price Banner */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '16px',
            textAlign: 'center',
            marginBottom: '20px',
          }}
        >
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Current Spot Oracle Price
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#00f0ff', fontFamily: 'monospace' }}>
            {formatUsd(btcPrice)}
          </div>
        </div>

        {/* Quick Presets */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '10px' }}>
            Quick Demo Actions
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            <button
              onClick={() => handleQuickChange(66000, '+10% Pump')}
              disabled={isUpdatingPrice}
              style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '10px',
                padding: '12px',
                color: '#10b981',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>🚀</span>
              <span>+10% Pump ($66k)</span>
            </button>

            <button
              onClick={() => handleQuickChange(63000, '+5% Bump')}
              disabled={isUpdatingPrice}
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: '10px',
                padding: '12px',
                color: '#34d399',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>📈</span>
              <span>+5% Bump ($63k)</span>
            </button>

            <button
              onClick={() => handleQuickChange(57000, '-5% Dip')}
              disabled={isUpdatingPrice}
              style={{
                background: 'rgba(244, 63, 94, 0.08)',
                border: '1px solid rgba(244, 63, 94, 0.2)',
                borderRadius: '10px',
                padding: '12px',
                color: '#fb7185',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>📉</span>
              <span>-5% Dip ($57k)</span>
            </button>

            <button
              onClick={() => handleQuickChange(54000, '-10% Liquidation')}
              disabled={isUpdatingPrice}
              style={{
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.4)',
                borderRadius: '10px',
                padding: '12px',
                color: '#f43f5e',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>🩸</span>
              <span>-10% Liquidate ($54k)</span>
            </button>
          </div>

          <div style={{ marginTop: '10px' }}>
            <button
              onClick={() => handleQuickChange(60000, 'Baseline Reset')}
              disabled={isUpdatingPrice}
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                padding: '10px',
                color: '#94a3b8',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>🔄</span>
              <span>Reset to Baseline ($60,000)</span>
            </button>
          </div>
        </div>

        {/* Custom Price Form */}
        <form onSubmit={handleCustomSubmit} style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 600, marginBottom: '8px' }}>
            Set Custom Target Price
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
              >
                $
              </span>
              <input
                type="number"
                step="100"
                min="1000"
                max="500000"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  padding: '10px 12px 10px 28px',
                  color: '#f8fafc',
                  fontFamily: 'monospace',
                  fontSize: '0.95rem',
                }}
              />
            </div>
            <button
              type="submit"
              disabled={isUpdatingPrice}
              style={{
                background: 'linear-gradient(135deg, #00f0ff 0%, #0070f3 100%)',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 20px',
                color: '#0a0e1a',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {isUpdatingPrice ? 'Updating...' : 'Set Price'}
            </button>
          </div>
        </form>

        {/* Status Toast */}
        {statusMessage && (
          <div
            style={{
              marginTop: '16px',
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(0, 240, 255, 0.1)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              color: '#00f0ff',
              fontSize: '0.85rem',
              textAlign: 'center',
            }}
          >
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
};

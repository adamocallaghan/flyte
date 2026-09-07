'use client';

import React, { useState } from 'react';
import { Header } from '../components/Header';
import { MarketStatsBar } from '../components/MarketStatsBar';
import { PriceController } from '../components/PriceController';
import { TraderTerminal } from '../components/TraderTerminal';
import { PositionsManager } from '../components/PositionsManager';
import { LPConsole } from '../components/LPConsole';
import { useWeb3 } from '../context/Web3Context';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'trade' | 'lp' | 'keeper' | 'coverage'>('trade');
  const [isPriceControllerOpen, setIsPriceControllerOpen] = useState<boolean>(false);

  const {
    role,
    roleConfig,
    balances,
    refreshBalances,
  } = useWeb3();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Main Container */}
      <main style={{ flex: 1, padding: '24px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
        {/* Market Stats Bar (Phase 7 - Step 4) */}
        <MarketStatsBar onOpenPriceController={() => setIsPriceControllerOpen(true)} />

        {/* Role & Connection Summary Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(19, 27, 46, 0.8) 0%, rgba(13, 20, 36, 0.8) 100%)',
            border: '1px solid rgba(0, 240, 255, 0.2)',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(0, 240, 255, 0.1)',
                border: '1px solid rgba(0, 240, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
              }}
            >
              {role === 'trader' ? '📈' : role === 'lp' ? '💧' : role === 'keeper' ? '🤖' : '🦊'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.95rem' }}>
                  {roleConfig ? roleConfig.name : 'Browser Wallet'}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: 'rgba(0, 240, 255, 0.15)',
                    color: '#00f0ff',
                    fontWeight: 600,
                  }}
                >
                  {role.toUpperCase()}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: '0.8rem' }}>
                {roleConfig ? roleConfig.description : 'Connected via injected Web3 browser provider'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ETH Balance</div>
              <div style={{ fontWeight: 600, color: '#f8fafc', fontFamily: 'monospace' }}>{balances.eth} ETH</div>
            </div>
            <div style={{ height: '24px', width: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>USDC</div>
              <div style={{ fontWeight: 600, color: '#f8fafc', fontFamily: 'monospace' }}>{balances.usdc} USDC</div>
            </div>
            <div style={{ height: '24px', width: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Aave aUSDC</div>
              <div style={{ fontWeight: 600, color: '#00f0ff', fontFamily: 'monospace' }}>{balances.aUsdc} aUSDC</div>
            </div>
            <button
              onClick={refreshBalances}
              title="Refresh balances"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#94a3b8',
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              🔄
            </button>
          </div>
        </div>

        {/* Tab View Content */}
        {activeTab === 'trade' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Phase 7 - Step 5 Trader Terminal */}
            <TraderTerminal />

            {/* Phase 7 - Step 6 Positions Manager */}
            <PositionsManager />
          </section>
        )}

        {activeTab === 'lp' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Phase 7 - Step 7 LP Console & Aave Yield Tracker */}
            <LPConsole />
          </section>
        )}

        {activeTab === 'keeper' && (
          <section
            style={{
              background: 'rgba(19, 27, 46, 0.5)',
              border: '1px dashed rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: '1.3rem', color: '#f8fafc' }}>🤖 Keeper Automation Console</h2>
            <p style={{ color: '#94a3b8', marginTop: '8px' }}>
              Scheduled for implementation in Step 8.
            </p>
          </section>
        )}

        {activeTab === 'coverage' && (
          <section
            style={{
              background: 'rgba(19, 27, 46, 0.5)',
              border: '1px dashed rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: '1.3rem', color: '#f8fafc' }}>🛡️ Shared Liquidity Coverage Dashboard</h2>
            <p style={{ color: '#94a3b8', marginTop: '8px' }}>
              Scheduled for implementation in Step 9.
            </p>
          </section>
        )}
      </main>

      {/* Interactive Price Controller Modal */}
      <PriceController
        isOpen={isPriceControllerOpen}
        onClose={() => setIsPriceControllerOpen(false)}
      />
    </div>
  );
}

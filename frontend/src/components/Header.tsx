'use client';

import React, { useState } from 'react';
import { useWeb3, UserRole } from '../context/Web3Context';
import { shortenAddress, DEMO_ROLES, ANVIL_CHAIN_ID } from '../config/contracts';

interface HeaderProps {
  activeTab: 'trade' | 'lp' | 'keeper' | 'coverage';
  onTabChange: (tab: 'trade' | 'lp' | 'keeper' | 'coverage') => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange }) => {
  const {
    account,
    role,
    setRole,
    chainId,
    blockNumber,
    isFork,
    balances,
    appAddress,
    oracleAddress,
    setAppAddress,
    setOracleAddress,
    resetToDefaultAddresses,
    connectBrowserWallet,
  } = useWeb3();

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [tempAppAddress, setTempAppAddress] = useState(appAddress);
  const [tempOracleAddress, setTempOracleAddress] = useState(oracleAddress);

  const handleSaveAddresses = () => {
    setAppAddress(tempAppAddress);
    setOracleAddress(tempOracleAddress);
    setShowConfigModal(false);
  };

  const handleResetAddresses = () => {
    resetToDefaultAddresses();
    setShowConfigModal(false);
  };

  const roleList = Object.values(DEMO_ROLES);

  return (
    <>
      <header className="app-header">
        {/* Brand / Logo */}
        <div className="header-brand">
          <div className="brand-icon">⚡</div>
          <div className="brand-info">
            <span className="brand-title">FLYTE</span>
            <span className="brand-subtitle">1inch Aqua JIT Perps</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-tabs" aria-label="Main Navigation">
          <button
            className={`nav-tab ${activeTab === 'trade' ? 'active' : ''}`}
            onClick={() => onTabChange('trade')}
            id="nav-tab-trade"
          >
            📈 Trade
          </button>
          <button
            className={`nav-tab ${activeTab === 'lp' ? 'active' : ''}`}
            onClick={() => onTabChange('lp')}
            id="nav-tab-lp"
          >
            💧 LP &amp; Quotes
          </button>
          <button
            className={`nav-tab ${activeTab === 'keeper' ? 'active' : ''}`}
            onClick={() => onTabChange('keeper')}
            id="nav-tab-keeper"
          >
            🤖 Keeper Console
          </button>
          <button
            className={`nav-tab ${activeTab === 'coverage' ? 'active' : ''}`}
            onClick={() => onTabChange('coverage')}
            id="nav-tab-coverage"
          >
            🛡️ Shared Coverage
          </button>
        </nav>

        {/* Right Section: Network, Role Switcher, Balance & Settings */}
        <div className="header-actions">
          {/* Network Indicator */}
          <div className="network-badge" title={isFork ? 'Connected to local Anvil fork of Arbitrum One' : 'Connected to Arbitrum One'}>
            <span className="status-dot green"></span>
            <span>{isFork ? `Arb Fork (${chainId || ANVIL_CHAIN_ID})` : 'Arbitrum One'}</span>
            {blockNumber > 0 && <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>#{blockNumber}</span>}
          </div>

          {/* Role Switcher Pill */}
          <div className="role-switcher" title="Switch active account/role for demo">
            <span className="role-label">Role:</span>
            {roleList.map((r) => (
              <button
                key={r.id}
                className={`role-btn ${role === r.id ? 'active' : ''}`}
                onClick={() => setRole(r.id as UserRole)}
                id={`role-select-${r.id}`}
              >
                {r.badge}
              </button>
            ))}
            <button
              className={`role-btn ${role === 'browser' ? 'active' : ''}`}
              onClick={connectBrowserWallet}
              id="role-select-browser"
              title="Connect MetaMask / Rabby"
            >
              🦊 Wallet
            </button>
          </div>

          {/* Account & Balances Pill */}
          <div className="account-pill">
            <span className="account-badge-text">
              {balances.aUsdc} aUSDC
            </span>
            <span className="account-address" title={account || ''}>
              {account ? shortenAddress(account) : 'Disconnected'}
            </span>
          </div>

          {/* Contract Config Settings Trigger */}
          <button
            className="btn-icon"
            onClick={() => {
              setTempAppAddress(appAddress);
              setTempOracleAddress(oracleAddress);
              setShowConfigModal(true);
            }}
            title="Configure Deployed Contract Addresses"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px 10px',
              fontSize: '0.85rem',
            }}
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Contract Addresses Configuration Modal */}
      {showConfigModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowConfigModal(false)}
        >
          <div
            style={{
              background: '#131b2e',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              borderRadius: '16px',
              padding: '24px',
              width: '90%',
              maxWidth: '520px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(0, 240, 255, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚙️</span> Contract Configuration
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '16px', lineHeight: 1.4 }}>
              Configure deployed Flyte contract addresses on your local Anvil fork or Arbitrum One.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px' }}>
                  PerpAquaApp Contract Address
                </label>
                <input
                  type="text"
                  value={tempAppAddress}
                  onChange={(e) => setTempAppAddress(e.target.value)}
                  placeholder="0x..."
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px' }}>
                  MockPriceOracle Contract Address
                </label>
                <input
                  type="text"
                  value={tempOracleAddress}
                  onChange={(e) => setTempOracleAddress(e.target.value)}
                  placeholder="0x..."
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
              <button
                onClick={handleResetAddresses}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  color: '#94a3b8',
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                Reset Defaults
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowConfigModal(false)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    padding: '8px 14px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAddresses}
                  style={{
                    background: 'linear-gradient(135deg, #00f0ff 0%, #0070f3 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#0a0e1a',
                    fontWeight: 600,
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Save Addresses
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

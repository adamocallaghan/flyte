'use client';

import React, { useState } from 'react';
import { formatUsd, shortenAddress, DEMO_ROLES, A_USDC_ADDRESS, AQUA_REGISTRY_ADDRESS } from '../config/contracts';
import { useWeb3 } from '../context/Web3Context';

interface ConnectedApp {
  id: string;
  name: string;
  category: string;
  badge: string;
  committedDepth: number;
  utilizedDepth: number;
  baseYieldApy: number;
  appYieldApy: number;
  icon: string;
  status: 'active' | 'standby';
  description: string;
}

export const SharedCoverage: React.FC = () => {
  const { appAddress } = useWeb3();

  // Base LP Capital
  const baseCapital = 50000;
  const [simulatedPulls, setSimulatedPulls] = useState<{ app: string; amount: number; time: string }[]>([]);
  const [activeSimulation, setActiveSimulation] = useState<string | null>(null);

  // Total pulled so far
  const totalPulled = simulatedPulls.reduce((acc, curr) => acc + curr.amount, 0);
  const remainingCapital = Math.max(0, baseCapital - totalPulled);

  // Connected Aqua Apps
  const apps: ConnectedApp[] = [
    {
      id: 'flyte',
      name: 'Flyte Perpetual Futures',
      category: 'Perpetual DEX',
      badge: 'Current App',
      committedDepth: remainingCapital,
      utilizedDepth: simulatedPulls.filter((p) => p.app === 'Flyte').reduce((a, b) => a + b.amount, 0),
      baseYieldApy: 4.25,
      appYieldApy: 14.8,
      icon: '📈',
      status: 'active',
      description: 'Counter-margin JIT pulled via Aqua on position opening. SwapVM opcodes 0x74/0x75 calculate margin & skew funding.',
    },
    {
      id: '1inch_spot',
      name: '1inch Spot Aggregator (Fusion+)',
      category: 'Spot Aggregation',
      badge: '1inch Network',
      committedDepth: remainingCapital,
      utilizedDepth: simulatedPulls.filter((p) => p.app === '1inch Spot').reduce((a, b) => a + b.amount, 0),
      baseYieldApy: 4.25,
      appYieldApy: 8.5,
      icon: '🦄',
      status: 'active',
      description: 'PMM RFQ maker liquidity for spot token swaps. Zero gas wasted on unexecuted maker orders.',
    },
    {
      id: 'continuity',
      name: 'Continuity Basis Vaults',
      category: 'Structured Products',
      badge: 'Continuity Track',
      committedDepth: remainingCapital,
      utilizedDepth: simulatedPulls.filter((p) => p.app === 'Continuity').reduce((a, b) => a + b.amount, 0),
      baseYieldApy: 4.25,
      appYieldApy: 11.2,
      icon: '🛡️',
      status: 'active',
      description: 'Automated delta-neutral funding rate arbitrage and structured yield harvesting.',
    },
  ];

  // Simulation Triggers
  const handleSimulatePull = (appName: string, amount: number) => {
    if (remainingCapital < amount) {
      alert('Not enough remaining LP capital for this simulation pull!');
      return;
    }
    setActiveSimulation(`Simulating AQUA.pull() from ${appName} for ${formatUsd(amount)}...`);
    setTimeout(() => {
      const now = new Date().toLocaleTimeString();
      setSimulatedPulls((prev) => [{ app: appName, amount, time: now }, ...prev]);
      setActiveSimulation(null);
    }, 600);
  };

  const handleResetSimulation = () => {
    setSimulatedPulls([]);
    setActiveSimulation(null);
  };

  // Efficiency Multipliers
  const totalVirtualCoverage = remainingCapital * apps.length;
  const efficiencyMultiplier = (totalVirtualCoverage / baseCapital).toFixed(1);
  const capitalSavings = totalVirtualCoverage - baseCapital;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* 1. Header Banner & Thesis */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(13, 20, 36, 0.9) 0%, rgba(19, 27, 46, 0.9) 100%)',
          border: '1px solid rgba(0, 240, 255, 0.25)',
          borderRadius: '20px',
          padding: '28px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4), 0 0 30px rgba(0, 240, 255, 0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '1.6rem' }}>🛡️</span>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#f8fafc', fontWeight: 800 }}>
                1inch Aqua Shared Liquidity Layer
              </h2>
              <span
                style={{
                  background: 'rgba(0, 240, 255, 0.15)',
                  color: '#00f0ff',
                  border: '1px solid rgba(0, 240, 255, 0.3)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                Zero-Lockup Architecture
              </span>
            </div>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem', maxWidth: '780px', lineHeight: 1.5 }}>
              In traditional DeFi, liquidity is fragmented into isolated silos (e.g. $50k in GMX is locked and cannot be used in 1inch Spot).
              With <strong>1inch Aqua</strong>, LP Grimace holds <strong>{formatUsd(baseCapital)} aUSDC</strong> in their own wallet, earning <strong>4.25% Aave v3 supply yield</strong> while simultaneously committing that exact same capital across <strong>3 distinct protocols</strong>!
            </p>
          </div>

          {/* Quick Metrics Badge */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '14px 20px',
              textAlign: 'right',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Effective Multiplier
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#00f0ff', fontFamily: 'monospace' }}>
              {efficiencyMultiplier}x
            </div>
            <span style={{ fontSize: '0.75rem', color: '#10b981' }}>
              +{formatUsd(capitalSavings)} Capital Freed
            </span>
          </div>
        </div>

        {/* Live Capital Slicing Bar */}
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '8px' }}>
            <span style={{ color: '#cbd5e1' }}>
              Grimace Wallet Capital: <strong style={{ color: '#f8fafc', fontFamily: 'monospace' }}>{formatUsd(remainingCapital)} Available</strong>
            </span>
            <span style={{ color: '#94a3b8' }}>
              {simulatedPulls.length > 0 ? `${formatUsd(totalPulled)} Pulled via Aqua` : '100% Unencumbered'}
            </span>
          </div>
          <div
            style={{
              height: '10px',
              background: '#1e293b',
              borderRadius: '999px',
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            <div
              style={{
                width: `${(remainingCapital / baseCapital) * 100}%`,
                background: 'linear-gradient(90deg, #10b981 0%, #00f0ff 100%)',
                transition: 'width 0.4s ease',
              }}
            />
            <div
              style={{
                width: `${(totalPulled / baseCapital) * 100}%`,
                background: 'linear-gradient(90deg, #f43f5e 0%, #e11d48 100%)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* 2. Connected Application Nodes */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', fontWeight: 800 }}>
            Simultaneously Covered Protocols
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Shared via 1inch Aqua Registry ({shortenAddress(AQUA_REGISTRY_ADDRESS)})
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {apps.map((app) => (
            <div
              key={app.id}
              style={{
                background: '#0d1424',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
                transition: 'transform 0.2s ease, border-color 0.2s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.3rem',
                      }}
                    >
                      {app.icon}
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc', fontWeight: 700 }}>
                        {app.name}
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{app.category}</span>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      background: 'rgba(0, 240, 255, 0.12)',
                      color: '#00f0ff',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontWeight: 600,
                    }}
                  >
                    {app.badge}
                  </span>
                </div>

                <p style={{ color: '#94a3b8', fontSize: '0.825rem', lineHeight: 1.5, marginBottom: '18px' }}>
                  {app.description}
                </p>

                {/* Depth & Yield Info */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    fontSize: '0.8rem',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Available JIT Depth</span>
                    <span style={{ color: '#00f0ff', fontWeight: 700, fontFamily: 'monospace' }}>
                      {formatUsd(app.committedDepth)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Utilized / Pulled</span>
                    <span style={{ color: app.utilizedDepth > 0 ? '#f43f5e' : '#64748b', fontFamily: 'monospace', fontWeight: 600 }}>
                      {formatUsd(app.utilizedDepth)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Effective Combined APY</span>
                    <span style={{ color: '#10b981', fontWeight: 700, fontFamily: 'monospace' }}>
                      {app.baseYieldApy}% Aave + {app.appYieldApy}% Fees
                    </span>
                  </div>
                </div>
              </div>

              {/* Action: Simulate Pull */}
              <div>
                <button
                  onClick={() => handleSimulatePull(app.name.split(' ')[0], 5000)}
                  disabled={remainingCapital < 5000}
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#f8fafc',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: remainingCapital < 5000 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  ⚡ Simulate {formatUsd(5000)} AQUA.pull()
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Interactive JIT Event Log & Simulation Monitor */}
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
          <div>
            <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', fontWeight: 800 }}>
              Live 1inch Aqua Pull Audit Log
            </h4>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Real-time trace of atomic token pulls across connected decentralized protocols
            </span>
          </div>
          {simulatedPulls.length > 0 && (
            <button
              onClick={handleResetSimulation}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                padding: '4px 10px',
                color: '#94a3b8',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Reset Simulation
            </button>
          )}
        </div>

        {activeSimulation && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(0, 240, 255, 0.1)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              color: '#00f0ff',
              fontSize: '0.85rem',
              marginBottom: '14px',
            }}
          >
            {activeSimulation}
          </div>
        )}

        {simulatedPulls.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 16px',
              background: 'rgba(15, 23, 42, 0.4)',
              borderRadius: '10px',
              border: '1px dashed rgba(255, 255, 255, 0.08)',
              color: '#94a3b8',
              fontSize: '0.85rem',
            }}
          >
            No active pulls yet. Click &quot;Simulate AQUA.pull()&quot; on any application card above to observe real-time multi-app JIT liquidity drawdown!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {simulatedPulls.map((pull, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '0.825rem',
                  fontFamily: 'monospace',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#10b981' }}>EVENT:</span>
                  <span style={{ color: '#00f0ff' }}>AQUA.pull()</span>
                  <span style={{ color: '#94a3b8' }}>from</span>
                  <span style={{ color: '#f8fafc', fontWeight: 600 }}>Grimace ({shortenAddress(DEMO_ROLES.lp.address)})</span>
                  <span style={{ color: '#94a3b8' }}>by</span>
                  <span style={{ color: '#c084fc', fontWeight: 600 }}>{pull.app}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ color: '#f43f5e', fontWeight: 700 }}>
                    -{formatUsd(pull.amount)} aUSDC
                  </span>
                  <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{pull.time}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Hackathon Track Integrations Matrix */}
      <div
        style={{
          background: '#0d1424',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '24px',
        }}
      >
        <h4 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#f8fafc', fontWeight: 800 }}>
          ETHGlobal Hackathon Track Alignment
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ color: '#00f0ff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px' }}>
              1. 1inch: &quot;Build an Aqua App&quot;
            </div>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.5 }}>
              First-ever Perpetual Futures DEX native to 1inch Aqua. Eliminates fragmented LP vaults by JIT-pulling counterparty margin only upon position execution.
            </p>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ color: '#c084fc', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px' }}>
              2. 1inch: &quot;SwapVM Custom Opcode&quot;
            </div>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.5 }}>
              Implemented custom SwapVM opcodes: <code>0x74</code> (Margin Calculation) and <code>0x75</code> (Open Interest Skew Funding Rate) for trustless on-chain execution.
            </p>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px' }}>
              3. Continuity &amp; The Graph Tracks
            </div>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.5 }}>
              Continuous multi-protocol capital efficiency with Aave v3 supply yield and subgraphs indexing position lifetimes, liquidations, and keeper bounties.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

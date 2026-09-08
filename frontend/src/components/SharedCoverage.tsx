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
      id: 'aave_lending',
      name: 'Aave v3 Money Market',
      category: 'Lending & Yield',
      badge: 'Collateral Base',
      committedDepth: remainingCapital,
      utilizedDepth: simulatedPulls.filter((p) => p.app === 'Aave').reduce((a, b) => a + b.amount, 0),
      baseYieldApy: 4.25,
      appYieldApy: 4.25,
      icon: '👻',
      status: 'active',
      description: 'Native interest-bearing aUSDC supply yield while simultaneously acting as 1inch Aqua backing collateral.',
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
    <div className="flex flex-col gap-6 font-headline">
      {/* 1. Header Banner & Thesis */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 md:p-6">
        <div className="flex flex-wrap justify-between items-start gap-4 pb-4 border-b-2 border-black mb-5">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🛡️</span>
              <h2 className="text-xl md:text-2xl font-black text-black uppercase tracking-tight">
                1inch Aqua Shared Liquidity Layer
              </h2>
              <span className="bg-[#FFE600] border-2 border-black font-mono text-[10px] font-black px-2 py-0.5 text-black uppercase shadow-[1px_1px_0px_0px_#000000]">
                Zero-Lockup Architecture
              </span>
            </div>
            <p className="text-gray-700 font-mono text-xs leading-relaxed">
              In traditional DeFi, liquidity is fragmented into isolated silos (e.g. $50k in an isolated vault cannot be used in 1inch Spot).
              With <strong className="text-black">1inch Aqua</strong>, LP Grimace holds <strong className="text-black font-black">{formatUsd(baseCapital)} aUSDC</strong> in their own wallet, earning <strong className="text-[#006d32] font-black">4.25% Aave v3 supply yield</strong> while simultaneously committing that exact same capital across <strong className="text-black font-black">3 distinct protocols</strong>!
            </p>
          </div>

          {/* Quick Metrics Badge */}
          <div className="bg-[#FAFAFA] border-2 border-black p-4 text-right shadow-[3px_3px_0px_0px_#000000] shrink-0">
            <div className="font-mono text-[10px] text-gray-500 uppercase font-bold tracking-wider">
              Effective Multiplier
            </div>
            <div className="font-mono text-3xl md:text-4xl font-black text-black my-0.5">
              {efficiencyMultiplier}x
            </div>
            <span className="font-mono text-xs font-bold text-[#006d32]">
              +{formatUsd(capitalSavings)} Capital Freed
            </span>
          </div>
        </div>

        {/* Live Capital Slicing Bar */}
        <div>
          <div className="flex justify-between items-center font-mono text-xs mb-2">
            <span className="text-gray-700">
              Grimace Wallet Capital: <strong className="text-black font-black">{formatUsd(remainingCapital)} Available</strong>
            </span>
            <span className="font-bold text-black">
              {simulatedPulls.length > 0 ? `${formatUsd(totalPulled)} Pulled via Aqua` : '100% Unencumbered'}
            </span>
          </div>

          <div className="w-full h-7 bg-[#FAFAFA] border-2 border-black flex items-stretch p-0.5 gap-0.5 shadow-[2px_2px_0px_0px_#000000]">
            <div
              style={{ width: `${(remainingCapital / baseCapital) * 100}%` }}
              className="bg-[#00F076] border border-black flex items-center justify-center font-mono text-[10px] font-black text-black transition-all duration-300 overflow-hidden whitespace-nowrap"
            >
              {remainingCapital > 0 ? `AVAILABLE: ${formatUsd(remainingCapital)}` : ''}
            </div>
            {totalPulled > 0 && (
              <div
                style={{ width: `${(totalPulled / baseCapital) * 100}%` }}
                className="bg-[#FF3366] border border-black flex items-center justify-center font-mono text-[10px] font-black text-white transition-all duration-300 overflow-hidden whitespace-nowrap"
              >
                PULLED: {formatUsd(totalPulled)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Connected Application Nodes */}
      <div>
        <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
          <h3 className="text-xl font-black text-black uppercase tracking-tight">
            Simultaneously Covered Protocols
          </h3>
          <span className="font-mono text-xs text-gray-600 bg-white border border-black px-2 py-0.5 shadow-[1px_1px_0px_0px_#000000]">
            Shared via 1inch Aqua Registry ({shortenAddress(AQUA_REGISTRY_ADDRESS)})
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {apps.map((app) => (
            <div
              key={app.id}
              className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start pb-3 border-b-2 border-black mb-3 gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 bg-[#FAFAFA] border-2 border-black flex items-center justify-center text-xl shadow-[2px_2px_0px_0px_#000000] shrink-0">
                      {app.icon}
                    </div>
                    <div>
                      <h4 className="text-base font-black text-black uppercase tracking-tight">
                        {app.name}
                      </h4>
                      <span className="font-mono text-[11px] text-gray-500 uppercase block">
                        {app.category}
                      </span>
                    </div>
                  </div>
                  <span className="bg-[#00E5FF] border border-black font-mono text-[9px] font-black px-1.5 py-0.5 text-black uppercase shadow-[1px_1px_0px_0px_#000000] shrink-0">
                    {app.badge}
                  </span>
                </div>

                <p className="text-gray-700 font-mono text-xs leading-relaxed mb-4">
                  {app.description}
                </p>

                {/* Depth & Yield Info */}
                <div className="bg-[#FAFAFA] border-2 border-black p-3 flex flex-col gap-2 font-mono text-xs mb-4 shadow-[2px_2px_0px_0px_#000000]">
                  <div className="flex justify-between text-gray-700">
                    <span>Available JIT Depth</span>
                    <span className="font-black text-black">
                      {formatUsd(app.committedDepth)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-700">
                    <span>Utilized / Pulled</span>
                    <span className={`font-black ${
                      app.utilizedDepth > 0 ? 'text-[#d9044b]' : 'text-gray-500'
                    }`}>
                      {formatUsd(app.utilizedDepth)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-700">
                    <span>Combined APY</span>
                    <span className="font-black text-[#006d32]">
                      {app.baseYieldApy}% Aave + {app.appYieldApy}% Fees
                    </span>
                  </div>
                </div>
              </div>

              {/* Action: Simulate Pull */}
              <button
                type="button"
                onClick={() => handleSimulatePull(app.name.split(' ')[0], 5000)}
                disabled={remainingCapital < 5000}
                className="w-full h-11 bg-[#FFE600] hover:bg-[#ffe100] text-black border-2 border-black font-headline font-black text-xs uppercase px-3 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
              >
                <span>⚡</span>
                <span>Simulate {formatUsd(5000)} AQUA.pull()</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Interactive JIT Event Log & Simulation Monitor */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 md:p-6">
        <div className="flex flex-wrap justify-between items-center pb-4 border-b-2 border-black mb-4 gap-3">
          <div>
            <h4 className="text-xl font-black text-black uppercase tracking-tight">
              Live 1inch Aqua Pull Audit Log
            </h4>
            <span className="font-mono text-xs text-gray-600">
              Real-time trace of atomic token pulls across connected decentralized protocols
            </span>
          </div>

          {simulatedPulls.length > 0 && (
            <button
              type="button"
              onClick={handleResetSimulation}
              className="bg-white hover:bg-gray-100 text-black border-2 border-black font-mono text-xs font-bold px-3 py-1 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer transition-transform"
            >
              Reset Simulation
            </button>
          )}
        </div>

        {activeSimulation && (
          <div className="p-3 bg-[#00E5FF] border-2 border-black text-black font-mono text-xs font-bold mb-4 shadow-[2px_2px_0px_0px_#000000] animate-pulse">
            {activeSimulation}
          </div>
        )}

        {simulatedPulls.length === 0 ? (
          <div className="text-center py-10 px-4 bg-[#FAFAFA] border-2 border-dashed border-black font-mono text-xs text-gray-600">
            No active pulls yet. Click &quot;Simulate AQUA.pull()&quot; on any application card above to observe real-time multi-app JIT liquidity drawdown!
          </div>
        ) : (
          <div className="flex flex-col gap-2 font-mono text-xs">
            {simulatedPulls.map((pull, idx) => (
              <div
                key={idx}
                className="bg-[#FAFAFA] border-2 border-black p-3 flex flex-wrap justify-between items-center gap-2 shadow-[2px_2px_0px_0px_#000000]"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-black text-[#00F076] font-mono text-[10px] font-black px-1.5 py-0.5 border border-black">
                    EVENT: AQUA.pull()
                  </span>
                  <span className="text-gray-600">from</span>
                  <span className="font-bold text-black">Grimace ({shortenAddress(DEMO_ROLES.lp.address)})</span>
                  <span className="text-gray-600">by</span>
                  <span className="bg-[#FFE600] text-black font-bold px-1.5 py-0.5 border border-black">
                    {pull.app}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-black text-sm text-[#d9044b]">
                    -{formatUsd(pull.amount)} aUSDC
                  </span>
                  <span className="text-gray-500 text-[11px]">{pull.time}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

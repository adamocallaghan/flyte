'use client';

import React, { useState } from 'react';
import { Header } from '../components/Header';
import { MarketStatsBar } from '../components/MarketStatsBar';
import { PriceController } from '../components/PriceController';
import { TraderTerminal } from '../components/TraderTerminal';
import { PositionsManager } from '../components/PositionsManager';
import { LPConsole } from '../components/LPConsole';
import { KeeperConsole } from '../components/KeeperConsole';
import { SharedCoverage } from '../components/SharedCoverage';
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
    <div className="min-h-screen bg-[#f4f4f4] text-[#1b1b1b] flex flex-col font-headline selection:bg-[#FFE600] selection:text-black">
      {/* Neo-Brutalist Two-Tier Navigation Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Main Content Cockpit Area */}
      <main className="w-full pt-28 pb-12 bg-[#f4f4f4] flex-1">
        <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Market Stats Bar */}
          <MarketStatsBar onOpenPriceController={() => setIsPriceControllerOpen(true)} />

          {/* Role & Connection Summary Banner */}
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-4 md:p-5 mb-6 flex flex-wrap items-center justify-between gap-4 text-black">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 bg-black text-[#FFE600] border-2 border-black flex items-center justify-center text-xl shadow-[2px_2px_0px_0px_#000000] shrink-0">
                {role === 'trader' ? '📈' : role === 'lp' ? '💧' : role === 'keeper' ? '🤖' : '🦊'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-black text-base uppercase tracking-tight">
                    {roleConfig ? roleConfig.name : 'Browser Wallet'}
                  </span>
                  <span className="bg-[#00E5FF] border border-black font-mono text-[10px] font-black px-2 py-0.5 text-black uppercase shadow-[1px_1px_0px_0px_#000000]">
                    {role.toUpperCase()}
                  </span>
                </div>
                <p className="font-mono text-xs text-gray-600 mt-0.5">
                  {roleConfig ? roleConfig.description : 'Connected via injected Web3 browser provider'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-[#FAFAFA] border-2 border-black px-3 py-1.5 shadow-[2px_2px_0px_0px_#000000] text-right font-mono">
                <span className="block text-[9px] text-gray-500 uppercase font-bold">ETH Balance</span>
                <span className="text-xs font-black text-black">{balances.eth} ETH</span>
              </div>

              <div className="bg-[#FAFAFA] border-2 border-black px-3 py-1.5 shadow-[2px_2px_0px_0px_#000000] text-right font-mono">
                <span className="block text-[9px] text-gray-500 uppercase font-bold">USDC</span>
                <span className="text-xs font-black text-black">{balances.usdc} USDC</span>
              </div>

              <div className="bg-[#FAFAFA] border-2 border-black px-3 py-1.5 shadow-[2px_2px_0px_0px_#000000] text-right font-mono">
                <span className="block text-[9px] text-gray-500 uppercase font-bold">Aave aUSDC</span>
                <span className="text-xs font-black text-[#006d32]">{balances.aUsdc} aUSDC</span>
              </div>

              <button
                type="button"
                onClick={refreshBalances}
                title="Refresh balances"
                className="w-9 h-9 bg-white hover:bg-gray-100 border-2 border-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center justify-center font-bold text-sm cursor-pointer transition-transform"
              >
                🔄
              </button>
            </div>
          </div>

          {/* Tab Views */}
          {activeTab === 'trade' && (
            <section className="flex flex-col gap-6">
              <TraderTerminal />
              <PositionsManager />
            </section>
          )}

          {activeTab === 'lp' && (
            <section className="flex flex-col gap-6">
              <LPConsole />
            </section>
          )}

          {activeTab === 'keeper' && (
            <section className="flex flex-col gap-6">
              <KeeperConsole />
            </section>
          )}

          {activeTab === 'coverage' && (
            <section className="flex flex-col gap-6">
              <SharedCoverage />
            </section>
          )}
        </div>
      </main>

      {/* Neo-Brutalist Cockpit Footer */}
      <footer className="w-full bg-white border-t-2 border-black mt-16 py-8 px-4 sm:px-6 lg:px-8 font-headline">
        <div className="w-full max-w-[1680px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-black text-[#FFE600] border-2 border-black flex items-center justify-center font-headline font-black text-lg shadow-[2px_2px_0px_0px_#000000]">
              ✈️
            </div>
            <div>
              <span className="text-lg font-black text-black tracking-tight block">
                FLYTE DEX
              </span>
              <span className="font-mono text-xs text-gray-600 block">
                JIT-Sourced RFQ Perpetual Futures on 1inch Aqua &amp; SwapVM
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 font-mono text-[11px] font-bold">
            <span className="bg-[#00F076] border border-black px-2.5 py-1 text-black shadow-[1px_1px_0px_0px_#000000]">
              CHAIN ID: 31337 (ANVIL)
            </span>
            <span className="bg-[#00E5FF] border border-black px-2.5 py-1 text-black shadow-[1px_1px_0px_0px_#000000]">
              1INCH AQUA REGISTRY
            </span>
            <span className="bg-[#FFE600] border border-black px-2.5 py-1 text-black shadow-[1px_1px_0px_0px_#000000]">
              SWAPVM OPCODES 0x74/0x75
            </span>
          </div>
        </div>

        <div className="w-full max-w-[1680px] mx-auto border-t-2 border-black mt-6 pt-4 text-center font-mono text-xs text-gray-600">
          Flyte Protocol • Zero fragmented LP vaults, 100% non-custodial capital mobility.
        </div>
      </footer>

      {/* Interactive Price Controller Modal */}
      <PriceController
        isOpen={isPriceControllerOpen}
        onClose={() => setIsPriceControllerOpen(false)}
      />
    </div>
  );
}

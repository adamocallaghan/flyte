'use client';

import React, { useState } from 'react';
import { Header } from '../components/Header';
import { MarketStatsBar } from '../components/MarketStatsBar';
import { TraderTerminal } from '../components/TraderTerminal';
import { PositionsManager } from '../components/PositionsManager';
import { LPConsole } from '../components/LPConsole';
import { KeeperConsole } from '../components/KeeperConsole';
import { SharedCoverage } from '../components/SharedCoverage';
import { OracleConsole } from '../components/OracleConsole';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'trade' | 'lp' | 'keeper' | 'coverage' | 'oracles'>('trade');



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
          <MarketStatsBar />



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

          {activeTab === 'oracles' && (
            <section className="flex flex-col gap-6">
              <OracleConsole />
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


    </div>
  );
}

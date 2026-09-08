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
    <div className="w-full flex flex-col gap-4 mb-6 font-headline">
      {/* 1. TOP MARKET STATS CARD */}
      <div className="w-full bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-4 md:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left: BTC/USD Brand, Icon & Mark Price */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-black text-[#FFE600] border-2 border-black flex items-center justify-center font-headline text-2xl font-bold shadow-[2px_2px_0px_0px_#000000] shrink-0">
            ₿
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-extrabold text-black uppercase tracking-tight">
                BTC / USD PERPETUAL
              </h1>
              <span className="bg-[#00F076] border border-black font-mono px-2 py-0.5 text-[11px] font-bold text-black uppercase">
                LIVE
              </span>
              <span className="bg-[#00E5FF] border border-black font-mono px-1.5 py-0.5 text-[10px] font-bold text-black uppercase">
                10x MAX
              </span>
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="font-mono text-2xl md:text-3xl font-extrabold text-black tracking-tight">
                {formatUsd(btcPrice)}
              </span>
              <span
                className={`font-mono text-xs font-bold px-1.5 py-0.5 border border-black ${
                  isPositiveChange ? 'bg-[#00F076] text-black' : 'bg-[#FF3366] text-white'
                }`}
              >
                {isPositiveChange ? `+${priceChange24h.toFixed(2)}%` : `${priceChange24h.toFixed(2)}%`} (24H)
              </span>
            </div>
          </div>
        </div>

        {/* Middle: Open Interest & Funding Metrics */}
        <div className="flex flex-wrap items-center gap-6 md:gap-8 border-t lg:border-t-0 lg:border-l-2 border-black pt-4 lg:pt-0 lg:pl-6">
          <div>
            <span className="block font-mono text-[11px] text-gray-500 uppercase">
              Funding Rate (8h)
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`font-mono text-sm font-bold ${
                  isPositiveFunding ? 'text-[#006d32]' : 'text-[#d9044b]'
                }`}
              >
                {isPositiveFunding ? `+${fundingRate8hPercent.toFixed(4)}%` : `${fundingRate8hPercent.toFixed(4)}%`}
              </span>
              <span className="bg-black text-[#FFE600] font-mono text-[9px] px-1 py-0.2 font-bold uppercase">
                0x75
              </span>
            </div>
            <span className="text-[10px] text-gray-400 font-mono">epoch: {countdown}</span>
          </div>

          <div>
            <span className="block font-mono text-[11px] text-gray-500 uppercase">
              Margin Source
            </span>
            <span className="font-mono text-sm font-bold text-black mt-0.5 block">
              1inch Aqua JIT
            </span>
            <span className="text-[10px] text-gray-400 font-mono">Zero LP Vault Lockup</span>
          </div>

          <div>
            <span className="block font-mono text-[11px] text-gray-500 uppercase">
              Open Interest Skew
            </span>
            <div className="flex items-center gap-2 mt-0.5 font-mono text-xs font-bold">
              <span className="text-[#006d32]">L: {longOiPercent.toFixed(0)}%</span>
              <span className="text-gray-400">|</span>
              <span className="text-[#d9044b]">S: {shortOiPercent.toFixed(0)}%</span>
            </div>
            <span className="text-[10px] text-gray-400 font-mono">${(longOiUsd / 1000).toFixed(0)}k / ${(shortOiUsd / 1000).toFixed(0)}k</span>
          </div>
        </div>

        {/* Right: Simulate Price Trigger */}
        <div className="shrink-0 flex items-center">
          <button
            type="button"
            onClick={onOpenPriceController}
            id="btn-open-price-controller"
            className="h-11 bg-[#FFE600] hover:bg-[#ffe100] text-black font-headline font-bold text-xs uppercase px-4 border-2 border-black shadow-[3px_3px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none flex items-center gap-2 cursor-pointer select-none tracking-wider"
          >
            <span>⚡</span>
            <span>SIMULATE PRICE</span>
          </button>
        </div>
      </div>

      {/* 2. SWAPVM LIQUIDITY DEPTH & JIT ALLOCATION BAR */}
      <div className="w-full bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-3 md:p-4">
        <div className="flex items-center justify-between pb-2 border-b-2 border-black mb-2.5 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-black">
            <span>📊</span>
            <span>SWAPVM LIQUIDITY DEPTH &amp; JIT ALLOCATION</span>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px] font-bold">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#00F076] border border-black"></span>
              BIDS: ${(longOiUsd / 1000).toFixed(0)}K
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#FF3366] border border-black"></span>
              ASKS: ${(shortOiUsd / 1000).toFixed(0)}K
            </span>
            <span className="flex items-center gap-1.5 hidden sm:flex">
              <span className="w-2.5 h-2.5 bg-[#00E5FF] border border-black"></span>
              AQUA JIT: $50.0K
            </span>
          </div>
        </div>

        {/* Stepped Liquidity Bar Visualizer */}
        <div className="w-full h-12 bg-[#FAFAFA] border-2 border-black flex items-stretch p-1 gap-1">
          {/* Bids side (Green) */}
          <div className="flex-1 flex items-end gap-1">
            <div className="w-full h-[25%] bg-[#00F076] border border-black"></div>
            <div className="w-full h-[40%] bg-[#00F076] border border-black"></div>
            <div className="w-full h-[55%] bg-[#00F076] border border-black"></div>
            <div className="w-full h-[70%] bg-[#00F076] border border-black"></div>
            <div className="w-full h-[95%] bg-[#00F076] border border-black"></div>
          </div>

          {/* Center Spread Box */}
          <div className="w-24 bg-black text-[#FFE600] flex flex-col items-center justify-center font-mono font-bold shrink-0 border border-black select-none">
            <span className="text-[9px] uppercase tracking-wider text-gray-300">SPREAD</span>
            <span className="text-xs">10 BPS</span>
          </div>

          {/* Asks side (Pink/Red) */}
          <div className="flex-1 flex items-end gap-1">
            <div className="w-full h-[95%] bg-[#FF3366] border border-black"></div>
            <div className="w-full h-[70%] bg-[#FF3366] border border-black"></div>
            <div className="w-full h-[55%] bg-[#FF3366] border border-black"></div>
            <div className="w-full h-[40%] bg-[#FF3366] border border-black"></div>
            <div className="w-full h-[25%] bg-[#FF3366] border border-black"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

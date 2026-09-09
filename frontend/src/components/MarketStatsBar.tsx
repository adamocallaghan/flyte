'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useMarket } from '../context/MarketContext';
import { formatUsd } from '../config/contracts';

interface MarketStatsBarProps {
  onOpenPriceController: () => void;
}

export const MarketStatsBar: React.FC<MarketStatsBarProps> = ({ onOpenPriceController }) => {
  const {
    btcPrice,
    priceChange24h,
    fundingRate8hPercent,
    longOiUsd,
    shortOiUsd,
    longOiPercent,
    shortOiPercent,
    selectedMarket,
    setSelectedMarket,
    availableMarkets,
    currentMarket,
  } = useMarket();

  const [countdown, setCountdown] = useState<string>('08:00:00');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 8-hour funding epoch countdown
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

  // Price to display (uses real live oracle price for BTC/USD, base mock for others)
  const displayPrice = selectedMarket === 'BTC/USD' ? btcPrice : currentMarket.basePrice;

  return (
    <div className="w-full mb-6 font-headline">
      {/* TOP MARKET STATS CARD */}
      <div className="w-full bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-4 md:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left: Interactive Market Dropdown Selector & Mark Price */}
        <div className="flex flex-wrap items-center gap-4 md:gap-6">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              id="btn-market-dropdown"
              className="group flex items-center gap-3 bg-white hover:bg-neutral-50 border-2 border-black p-2.5 shadow-[3px_3px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer transition-all"
              title="Select perpetual market"
            >
              <div className="w-10 h-10 bg-black text-[#FFE600] border-2 border-black flex items-center justify-center font-headline text-2xl font-bold shadow-[1px_1px_0px_0px_#000000] shrink-0">
                {currentMarket.icon}
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="text-lg md:text-xl font-extrabold text-black uppercase tracking-tight flex items-center gap-1.5">
                    {currentMarket.name}
                    <span className="text-xs font-mono transition-transform group-hover:translate-y-0.5">▼</span>
                  </span>
                  <span className={`border border-black font-mono px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                    currentMarket.status === 'LIVE' ? 'bg-[#00F076] text-black' : 'bg-[#00E5FF] text-black'
                  }`}>
                    {currentMarket.status}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-gray-600 block uppercase">
                  {currentMarket.maxLeverage} MAX • PERPETUAL
                </span>
              </div>
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 z-40 w-72 bg-white border-2 border-black shadow-[6px_6px_0px_0px_#000000] p-1">
                <div className="px-3 py-2 border-b-2 border-black font-mono text-[10px] font-black text-gray-500 uppercase tracking-wider">
                  SELECT PERPETUAL MARKET
                </div>
                <div className="flex flex-col py-1">
                  {availableMarkets.map((market) => (
                    <button
                      key={market.id}
                      type="button"
                      onClick={() => {
                        setSelectedMarket(market.id);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 hover:bg-neutral-100 border-b border-neutral-200 last:border-b-0 cursor-pointer text-left transition-colors ${
                        selectedMarket === market.id ? 'bg-[#00E5FF]/20 font-bold' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 bg-black text-[#FFE600] border border-black flex items-center justify-center font-bold text-xs">
                          {market.icon}
                        </span>
                        <div>
                          <span className="block font-bold text-xs text-black">{market.name}</span>
                          <span className="block font-mono text-[10px] text-gray-500">{market.maxLeverage} Max</span>
                        </div>
                      </div>
                      <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 border border-black uppercase ${
                        market.status === 'LIVE' ? 'bg-[#00F076] text-black' : 'bg-neutral-200 text-gray-700'
                      }`}>
                        {market.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-2xl md:text-3xl font-extrabold text-black tracking-tight">
                {formatUsd(displayPrice)}
              </span>
              <span
                className={`font-mono text-xs font-bold px-1.5 py-0.5 border border-black ${
                  isPositiveChange ? 'bg-[#00F076] text-black' : 'bg-[#FF3366] text-white'
                }`}
              >
                {isPositiveChange ? `+${priceChange24h.toFixed(2)}%` : `${priceChange24h.toFixed(2)}%`} (24H)
              </span>
            </div>
            <span className="text-[10px] font-mono text-gray-500 uppercase">
              {selectedMarket === 'BTC/USD' ? 'Chainlink Oracle Mark Price' : 'Simulated Market Index'}
            </span>
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
                EST
              </span>
            </div>
            <span className="text-[10px] text-gray-400 font-mono">epoch: {countdown}</span>
          </div>

          <div>
            <span className="block font-mono text-[11px] text-gray-500 uppercase">
              Margin Liquidity
            </span>
            <span className="font-mono text-sm font-bold text-black mt-0.5 block">
              Just-In-Time
            </span>
            <span className="text-[10px] text-gray-400 font-mono">Zero Custodial Lockup</span>
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
    </div>
  );
};

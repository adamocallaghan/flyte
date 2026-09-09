'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useMarket } from '../context/MarketContext';
import { formatUsd } from '../config/contracts';

export const MarketStatsBar: React.FC = () => {
  const {
    selectedMarket,
    setSelectedMarket,
    availableMarkets,
    currentMarket,
    btcPrice,
    priceChange24h,
    fundingRate8hPercent,
    longOiPercent,
    shortOiPercent,
    longOiUsd,
    shortOiUsd,
    attentionTelemetry,
  } = useMarket();

  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [countdown, setCountdown] = useState<string>('00:00:00');

  // Close dropdown when clicking outside
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
  const displayPrice = btcPrice || currentMarket.basePrice;

  return (
    <div className="w-full mb-6 font-headline">
      {/* TOP MARKET STATS CARD */}
      <div className="w-full bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-4 md:p-6 flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-6">
        {/* Left: Interactive Market Dropdown Selector & Mark Price */}
        <div className="flex flex-wrap items-center gap-4 md:gap-6">
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              id="btn-market-dropdown"
              className="group flex items-center gap-3 bg-white hover:bg-neutral-50 border-2 border-black p-2.5 shadow-[3px_3px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer transition-all"
              title="Select perpetual attention market"
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
                    currentMarket.category === 'TECH' ? 'bg-[#00E5FF] text-black' :
                    currentMarket.category === 'CULTURAL' ? 'bg-[#FFE600] text-black' : 'bg-[#00F076] text-black'
                  }`}>
                    {currentMarket.category}
                  </span>
                  <span className="border border-black font-mono px-1.5 py-0.2 text-[10px] font-bold uppercase bg-[#00F076] text-black">
                    {currentMarket.status}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-gray-600 block uppercase">
                  {currentMarket.maxLeverage} MAX • PERPETUAL ATTENTION
                </span>
              </div>
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 z-40 w-84 bg-white border-2 border-black shadow-[6px_6px_0px_0px_#000000] p-1">
                <div className="px-3 py-2 border-b-2 border-black font-mono text-[10px] font-black text-gray-500 uppercase tracking-wider flex justify-between items-center">
                  <span>SELECT ATTENTION MARKET</span>
                  <span className="text-black font-bold">CHAINLINK TEE</span>
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
                        <span className="w-8 h-8 bg-black text-[#FFE600] border border-black flex items-center justify-center font-bold text-sm shrink-0">
                          {market.icon}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-black">{market.name}</span>
                            <span className="font-mono text-[9px] px-1 border border-black bg-neutral-100 uppercase">
                              {market.category}
                            </span>
                          </div>
                          <span className="block font-mono text-[10px] text-gray-500 truncate max-w-[170px]">
                            {market.description}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono text-xs font-extrabold text-black block">
                          ${market.basePrice < 1000 ? market.basePrice.toFixed(2) : Math.round(market.basePrice).toLocaleString()}
                        </span>
                        <span className="font-mono text-[9px] text-[#006d32] font-bold">
                          {market.maxLeverage}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-2xl md:text-3xl font-extrabold text-black tracking-tight">
                {formatUsd(displayPrice, displayPrice < 1000 ? 2 : 2)}
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
              Chainlink CRE TEE Oracle Mark Price
            </span>
          </div>
        </div>

        {/* Middle: Open Interest & Funding Metrics */}
        <div className="flex flex-wrap items-center gap-6 md:gap-8 border-t 2xl:border-t-0 2xl:border-l-2 border-black pt-4 2xl:pt-0 2xl:pl-6">
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
            <span className="text-[10px] text-gray-400 font-mono">
              ${(longOiUsd / 1000).toFixed(0)}k / ${(shortOiUsd / 1000).toFixed(0)}k
            </span>
          </div>
        </div>

        {/* Right: Chainlink CRE TEE Confidential Oracle Card */}
        <div className="border-t 2xl:border-t-0 2xl:border-l-2 border-black pt-4 2xl:pt-0 2xl:pl-6">
          <div className="bg-[#FFE600]/25 border-2 border-black shadow-[3px_3px_0px_0px_#000000] p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00F076] animate-pulse"></span>
                <span className="font-mono text-[10px] font-black uppercase text-black tracking-wider">
                  Chainlink CRE TEE Oracle
                </span>
              </div>
              <span className="bg-black text-[#FFE600] font-mono text-[9px] px-1.5 py-0.5 font-bold uppercase">
                {attentionTelemetry.enclaveType.includes('Nitro') ? 'NITRO ATTESTED' : 'TEE SECURE'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 border-t border-black/20 pt-1.5 font-mono">
              <div>
                <span className="text-[9px] text-gray-600 block uppercase font-semibold">Sentiment</span>
                <span className={`text-xs font-black ${attentionTelemetry.sentimentScore >= 0 ? 'text-[#006d32]' : 'text-[#d9044b]'}`}>
                  {attentionTelemetry.sentimentScore >= 0
                    ? `+${(attentionTelemetry.sentimentScore / 100).toFixed(2)} Bull`
                    : `${(attentionTelemetry.sentimentScore / 100).toFixed(2)} Bear`}
                </span>
              </div>
              <div className="border-l border-black/20 pl-2">
                <span className="text-[9px] text-gray-600 block uppercase font-semibold">Velocity</span>
                <span className="text-xs font-black text-black">
                  {attentionTelemetry.socialVelocity}/100
                </span>
              </div>
              <div className="border-l border-black/20 pl-2">
                <span className="text-[9px] text-gray-600 block uppercase font-semibold">24h Mentions</span>
                <span className="text-xs font-black text-black">
                  {(attentionTelemetry.newsMentions24h / 1000).toFixed(1)}k
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

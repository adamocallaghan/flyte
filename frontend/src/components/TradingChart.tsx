'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useMarket } from '../context/MarketContext';
import { formatUsd } from '../config/contracts';

interface CandleData {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Timeframe = '15m' | '1H' | '4H' | '1D' | '1W';
type ChartType = 'candles' | 'line';

// Generate consistent synthetic historical candles leading up to current price
function generateHistoricalData(currentPrice: number, timeframe: Timeframe, count = 42): CandleData[] {
  const candles: CandleData[] = [];
  const now = Date.now();
  
  const stepMinutes = 
    timeframe === '15m' ? 15 :
    timeframe === '1H' ? 60 :
    timeframe === '4H' ? 240 :
    timeframe === '1D' ? 1440 : 10080;

  const volatility = currentPrice * (timeframe === '15m' ? 0.003 : timeframe === '1H' ? 0.007 : 0.015);
  
  let simulatedPrice = currentPrice * 0.965;
  
  for (let i = count - 1; i >= 0; i--) {
    const timestamp = now - i * stepMinutes * 60 * 1000;
    const date = new Date(timestamp);
    const timeStr = timeframe === '1D' || timeframe === '1W'
      ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

    const seed = Math.sin(i * 1.7) * 1.5 + Math.cos(i * 0.8) * 0.8;
    const delta = seed * volatility;
    
    const open = i === count - 1 ? simulatedPrice : candles[candles.length - 1].close;
    const close = i === 0 ? currentPrice : Math.max(open * 0.85, open + delta);
    const high = Math.max(open, close) + Math.abs(Math.sin(i * 3.1) * volatility * 0.7);
    const low = Math.min(open, close) - Math.abs(Math.cos(i * 2.3) * volatility * 0.7);
    const volume = 800000 + Math.abs(Math.sin(i * 4.5)) * 2400000;

    candles.push({
      time: timeStr,
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    });
    simulatedPrice = close;
  }

  if (candles.length > 0) {
    const last = candles[candles.length - 1];
    last.close = currentPrice;
    last.high = Math.max(last.high, currentPrice);
    last.low = Math.min(last.low, currentPrice);
  }

  return candles;
}

export const TradingChart: React.FC = () => {
  const { btcPrice, priceChange24h, selectedMarket } = useMarket();
  const [timeframe, setTimeframe] = useState<Timeframe>('1H');
  const [chartType, setChartType] = useState<ChartType>('candles');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(760);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const candles = useMemo(() => {
    return generateHistoricalData(btcPrice, timeframe, 42);
  }, [btcPrice, timeframe]);

  const activeCandle = hoveredIndex !== null && candles[hoveredIndex] ? candles[hoveredIndex] : candles[candles.length - 1];
  const activePrice = activeCandle ? activeCandle.close : btcPrice;
  const isPositive = priceChange24h >= 0;

  const height = 380;
  const padding = { top: 25, right: 65, bottom: 45, left: 10 };
  const chartWidth = Math.max(300, containerWidth);
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const volumeHeight = 55;
  const candlePlotHeight = plotHeight - volumeHeight - 15;

  const prices = candles.flatMap((c) => [c.high, c.low]);
  const minPriceRaw = Math.min(...prices);
  const maxPriceRaw = Math.max(...prices);
  const pricePadding = (maxPriceRaw - minPriceRaw) * 0.08 || 500;
  const minPrice = minPriceRaw - pricePadding;
  const maxPrice = maxPriceRaw + pricePadding;
  const priceRange = maxPrice - minPrice || 1;

  const maxVolume = Math.max(...candles.map((c) => c.volume)) || 1;

  const getX = (index: number) => {
    return padding.left + (index / (candles.length - 1)) * plotWidth;
  };

  const getY = (price: number) => {
    return padding.top + candlePlotHeight - ((price - minPrice) / priceRange) * candlePlotHeight;
  };

  const candleWidth = Math.max(4, Math.min(14, (plotWidth / candles.length) * 0.7));

  const high24h = Math.max(...candles.slice(-24).map((c) => c.high));
  const low24h = Math.min(...candles.slice(-24).map((c) => c.low));
  const volume24h = candles.reduce((acc, c) => acc + c.volume, 0);

  const gridSteps = 5;
  const gridPrices = Array.from({ length: gridSteps }, (_, i) => {
    return minPrice + (i / (gridSteps - 1)) * priceRange;
  });

  const timeIndices = [
    0,
    Math.floor(candles.length * 0.25),
    Math.floor(candles.length * 0.5),
    Math.floor(candles.length * 0.75),
    candles.length - 1,
  ];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x >= padding.left && x <= chartWidth - padding.right && y >= padding.top && y <= height - padding.bottom) {
      setMousePos({ x, y });
      const relativeX = x - padding.left;
      const index = Math.round((relativeX / plotWidth) * (candles.length - 1));
      const clampedIndex = Math.max(0, Math.min(candles.length - 1, index));
      setHoveredIndex(clampedIndex);
    } else {
      setHoveredIndex(null);
      setMousePos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setMousePos(null);
  };

  const linePath = useMemo(() => {
    if (candles.length === 0) return '';
    const points = candles.map((c, i) => `${getX(i)},${getY(c.close)}`);
    return `M ${points.join(' L ')}`;
  }, [candles, plotWidth, minPrice, maxPrice]);

  const areaPath = useMemo(() => {
    if (candles.length === 0) return '';
    const points = candles.map((c, i) => `${getX(i)},${getY(c.close)}`);
    const bottomY = padding.top + candlePlotHeight;
    return `M ${getX(0)},${bottomY} L ${points.join(' L ')} L ${getX(candles.length - 1)},${bottomY} Z`;
  }, [candles, plotWidth, minPrice, maxPrice]);

  return (
    <div
      ref={containerRef}
      className="w-full bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-4 md:p-5 flex flex-col font-headline select-none"
    >
      {/* 1. TOP TOOLBAR & TICKER STATS */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b-2 border-black gap-3">
        {/* Left: Market Info & Timeframes */}
        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-black text-[#FFE600] border-2 border-black flex items-center justify-center font-bold text-sm shadow-[1px_1px_0px_0px_#000000]">
              ₿
            </div>
            <div>
              <span className="font-extrabold text-sm md:text-base text-black uppercase tracking-tight">
                {selectedMarket || 'BTC/USD'} PERPETUAL
              </span>
            </div>
          </div>

          {/* Timeframe Buttons */}
          <div className="flex items-center border-2 border-black bg-neutral-100 p-0.5 shadow-[2px_2px_0px_0px_#000000]">
            {(['15m', '1H', '4H', '1D', '1W'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-0.5 font-mono text-[11px] font-bold uppercase transition-none cursor-pointer ${
                  timeframe === tf
                    ? 'bg-[#00E5FF] text-black border border-black shadow-[1px_1px_0px_0px_#000000]'
                    : 'text-gray-700 hover:text-black hover:bg-neutral-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Chart Type Toggle */}
          <div className="flex items-center border-2 border-black bg-neutral-100 p-0.5 shadow-[2px_2px_0px_0px_#000000]">
            <button
              type="button"
              onClick={() => setChartType('candles')}
              className={`px-2 py-0.5 font-mono text-[11px] font-bold uppercase transition-none cursor-pointer ${
                chartType === 'candles'
                  ? 'bg-black text-[#00F076] border border-black'
                  : 'text-gray-700 hover:text-black'
              }`}
              title="Candlestick chart"
            >
              📊 CANDLES
            </button>
            <button
              type="button"
              onClick={() => setChartType('line')}
              className={`px-2 py-0.5 font-mono text-[11px] font-bold uppercase transition-none cursor-pointer ${
                chartType === 'line'
                  ? 'bg-black text-[#00E5FF] border border-black'
                  : 'text-gray-700 hover:text-black'
              }`}
              title="Line chart"
            >
              📈 LINE
            </button>
          </div>
        </div>

        {/* Right: Quick Stats & Oracle Status */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-gray-600">
            <span>24H H: <strong className="text-black">{formatUsd(high24h)}</strong></span>
            <span>24H L: <strong className="text-black">{formatUsd(low24h)}</strong></span>
            <span>24H VOL: <strong className="text-black">${(volume24h / 1000000).toFixed(2)}M</strong></span>
          </div>

          <div className="flex items-center gap-1.5 bg-[#FAFAFA] border border-black px-2 py-0.5 text-[10px] font-bold uppercase">
            <span className="w-2 h-2 rounded-full bg-[#00F076] animate-pulse"></span>
            <span className="text-black">ORACLE: LIVE</span>
          </div>
        </div>
      </div>

      {/* 2. CANDLE OHLC BAR (Updates on hover) */}
      <div className="py-2 px-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs border-b border-neutral-200 text-gray-700">
        <span className="text-black font-extrabold text-sm">
          {formatUsd(activePrice)}
        </span>
        <span className={isPositive ? 'text-[#006d32] font-bold' : 'text-[#d9044b] font-bold'}>
          {isPositive ? `+${priceChange24h.toFixed(2)}%` : `${priceChange24h.toFixed(2)}%`}
        </span>
        {activeCandle && (
          <>
            <span className="text-[11px]">O: <span className="text-black font-semibold">{formatUsd(activeCandle.open)}</span></span>
            <span className="text-[11px]">H: <span className="text-black font-semibold">{formatUsd(activeCandle.high)}</span></span>
            <span className="text-[11px]">L: <span className="text-black font-semibold">{formatUsd(activeCandle.low)}</span></span>
            <span className="text-[11px]">C: <span className="text-black font-semibold">{formatUsd(activeCandle.close)}</span></span>
            <span className="text-[11px]">VOL: <span className="text-black font-semibold">${(activeCandle.volume / 1000).toFixed(0)}K</span></span>
            <span className="text-[10px] text-gray-400">({activeCandle.time})</span>
          </>
        )}
      </div>

      {/* 3. SVG CHART CANVAS */}
      <div className="relative w-full overflow-hidden mt-1 cursor-crosshair">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${chartWidth} ${height}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="select-none"
        >
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Price Grid Lines */}
          {gridPrices.map((price, idx) => {
            const y = getY(price);
            return (
              <g key={`grid-p-${idx}`}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  stroke="#e5e5e5"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={chartWidth - padding.right + 6}
                  y={y + 3}
                  fontFamily="monospace"
                  fontSize="10"
                  fill="#737373"
                  fontWeight="600"
                >
                  ${Math.round(price).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Vertical Time Grid Lines */}
          {timeIndices.map((idx) => {
            if (!candles[idx]) return null;
            const x = getX(idx);
            return (
              <g key={`grid-t-${idx}`}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={height - padding.bottom}
                  stroke="#f0f0f0"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={x}
                  y={height - padding.bottom + 16}
                  fontFamily="monospace"
                  fontSize="10"
                  fill="#737373"
                  textAnchor="middle"
                >
                  {candles[idx].time}
                </text>
              </g>
            );
          })}

          {/* Volume Baseline Separator */}
          <line
            x1={padding.left}
            y1={height - padding.bottom - volumeHeight}
            x2={chartWidth - padding.right}
            y2={height - padding.bottom - volumeHeight}
            stroke="#e0e0e0"
            strokeWidth="1"
          />
          <text
            x={padding.left + 4}
            y={height - padding.bottom - volumeHeight - 4}
            fontFamily="monospace"
            fontSize="9"
            fill="#a3a3a3"
            fontWeight="bold"
          >
            VOLUME
          </text>

          {/* Volume Bars */}
          {candles.map((c, i) => {
            const x = getX(i) - candleWidth / 2;
            const barH = (c.volume / maxVolume) * (volumeHeight - 8);
            const y = height - padding.bottom - barH;
            const isBullish = c.close >= c.open;

            return (
              <rect
                key={`vol-${i}`}
                x={x}
                y={y}
                width={candleWidth}
                height={Math.max(1, barH)}
                fill={isBullish ? '#00F076' : '#FF3366'}
                opacity={hoveredIndex === i ? 0.9 : 0.45}
                stroke="#000000"
                strokeWidth="0.5"
              />
            );
          })}

          {/* CHART TYPE 1: Candlesticks */}
          {chartType === 'candles' &&
            candles.map((c, i) => {
              const xCenter = getX(i);
              const x = xCenter - candleWidth / 2;
              const openY = getY(c.open);
              const closeY = getY(c.close);
              const highY = getY(c.high);
              const lowY = getY(c.low);
              const isBullish = c.close >= c.open;
              const bodyY = Math.min(openY, closeY);
              const bodyHeight = Math.max(2, Math.abs(openY - closeY));

              const candleColor = isBullish ? '#00F076' : '#FF3366';

              return (
                <g key={`candle-${i}`}>
                  {/* Wick */}
                  <line
                    x1={xCenter}
                    y1={highY}
                    x2={xCenter}
                    y2={lowY}
                    stroke="#000000"
                    strokeWidth="1.5"
                  />
                  {/* Candle Body */}
                  <rect
                    x={x}
                    y={bodyY}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={candleColor}
                    stroke="#000000"
                    strokeWidth="1.5"
                  />
                </g>
              );
            })}

          {/* CHART TYPE 2: Line / Area */}
          {chartType === 'line' && (
            <>
              <path d={areaPath} fill="url(#lineGrad)" />
              <path d={linePath} fill="none" stroke="#000000" strokeWidth="2.5" />
            </>
          )}

          {/* Current Live Price Indicator Line */}
          {(() => {
            const currentY = getY(btcPrice);
            return (
              <g>
                <line
                  x1={padding.left}
                  y1={currentY}
                  x2={chartWidth - padding.right}
                  y2={currentY}
                  stroke="#000000"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />
                {/* Price Tag Pill on Right Axis */}
                <rect
                  x={chartWidth - padding.right}
                  y={currentY - 10}
                  width={62}
                  height={20}
                  fill="#FFE600"
                  stroke="#000000"
                  strokeWidth="1.5"
                />
                <text
                  x={chartWidth - padding.right + 31}
                  y={currentY + 4}
                  fontFamily="monospace"
                  fontSize="10"
                  fontWeight="bold"
                  fill="#000000"
                  textAnchor="middle"
                >
                  ${Math.round(btcPrice).toLocaleString()}
                </text>
              </g>
            );
          })()}

          {/* Interactive Crosshair (On Hover) */}
          {mousePos && hoveredIndex !== null && (
            <g>
              {/* Vertical Crosshair Line */}
              <line
                x1={getX(hoveredIndex)}
                y1={padding.top}
                x2={getX(hoveredIndex)}
                y2={height - padding.bottom}
                stroke="#000000"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              {/* Horizontal Crosshair Line */}
              <line
                x1={padding.left}
                y1={mousePos.y}
                x2={chartWidth - padding.right}
                y2={mousePos.y}
                stroke="#000000"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              {/* Price marker at cursor on Y-axis */}
              {(() => {
                const cursorPrice = minPrice + ((padding.top + candlePlotHeight - mousePos.y) / candlePlotHeight) * priceRange;
                return (
                  <g>
                    <rect
                      x={chartWidth - padding.right}
                      y={mousePos.y - 9}
                      width={62}
                      height={18}
                      fill="#000000"
                    />
                    <text
                      x={chartWidth - padding.right + 31}
                      y={mousePos.y + 3}
                      fontFamily="monospace"
                      fontSize="9"
                      fontWeight="bold"
                      fill="#FFFFFF"
                      textAnchor="middle"
                    >
                      ${Math.round(cursorPrice).toLocaleString()}
                    </text>
                  </g>
                );
              })()}
            </g>
          )}
        </svg>
      </div>

      {/* 4. BOTTOM ACCENT FOOTER */}
      <div className="mt-3 pt-2 border-t-2 border-black flex flex-wrap items-center justify-between text-black font-mono text-[11px]">
        <div className="flex items-center gap-3">
          <span className="font-bold uppercase">Market: {selectedMarket || 'BTC/USD'}</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-600">Simulated OHLCV Feed • Live Oracle Integration</span>
        </div>
        <div className="flex items-center gap-1.5 font-bold text-[#006d32]">
          <span>●</span>
          <span className="uppercase">Real-Time Feed</span>
        </div>
      </div>
    </div>
  );
};

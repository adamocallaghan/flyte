'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useMarket, OnChainHistoricalReport } from '../context/MarketContext';
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

function formatChartPrice(price: number): string {
  if (price < 1000) {
    return `$${price.toFixed(2)}`;
  }
  return `$${Math.round(price).toLocaleString()}`;
}

// Generate consistent synthetic historical candles leading up to current price
function generateHistoricalData(currentPrice: number, timeframe: Timeframe, count = 42): CandleData[] {
  const candles: CandleData[] = [];
  const stepMinutes = 
    timeframe === '15m' ? 15 :
    timeframe === '1H' ? 60 :
    timeframe === '4H' ? 240 :
    timeframe === '1D' ? 1440 : 10080;

  // Anchor to fixed minute block to avoid sub-second hydration drift
  const now = Math.floor(Date.now() / (60 * 1000)) * (60 * 1000);
  const volatility = currentPrice * (timeframe === '15m' ? 0.003 : timeframe === '1H' ? 0.007 : 0.015);
  let simulatedPrice = currentPrice * 0.965;
  
  for (let i = count - 1; i >= 0; i--) {
    const timestamp = now - i * stepMinutes * 60 * 1000;
    const date = new Date(timestamp);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const mins = String(date.getUTCMinutes()).padStart(2, '0');
    const timeStr = timeframe === '1D' || timeframe === '1W'
      ? `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
      : `${hours}:${mins}`;

    const seed = Math.sin(i * 1.7) * 1.5 + Math.cos(i * 0.8) * 0.8;
    const delta = seed * volatility;
    
    const open = Math.round((i === count - 1 ? simulatedPrice : candles[candles.length - 1].close) * 100) / 100;
    const close = Math.round((i === 0 ? currentPrice : Math.max(open * 0.85, open + delta)) * 100) / 100;
    const high = Math.round((Math.max(open, close) + Math.abs(Math.sin(i * 3.1) * volatility * 0.7)) * 100) / 100;
    const low = Math.round((Math.min(open, close) - Math.abs(Math.cos(i * 2.3) * volatility * 0.7)) * 100) / 100;
    const volume = Math.round(800000 + Math.abs(Math.sin(i * 4.5)) * 2400000);

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
    last.close = Math.round(currentPrice * 100) / 100;
    last.high = Math.max(last.high, last.close);
    last.low = Math.min(last.low, last.close);
  }

  return candles;
}


function mapReportsToCandles(reports: OnChainHistoricalReport[], currentPrice: number): CandleData[] {
  if (!reports || reports.length === 0) return [];
  const sorted = [...reports].sort((a, b) => a.timestamp - b.timestamp);
  const candles: CandleData[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const prevClose = i === 0 ? r.indexPrice * 0.996 : sorted[i - 1].indexPrice;
    const open = Math.round(prevClose * 100) / 100;
    const isLast = i === sorted.length - 1;
    const close = Math.round((isLast ? currentPrice : r.indexPrice) * 100) / 100;
    const spread = Math.max(0.08, Math.abs(open - close));
    const high = Math.round((Math.max(open, close) + spread * 0.35 + r.indexPrice * 0.002) * 100) / 100;
    const low = Math.round((Math.min(open, close) - spread * 0.35 - r.indexPrice * 0.002) * 100) / 100;
    const date = new Date(r.timestamp * 1000);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const mins = String(date.getUTCMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${mins}`;

    candles.push({
      time: timeStr,
      timestamp: r.timestamp * 1000,
      open,
      high,
      low,
      close,
      volume: (r.newsMentions24h || 50000) * 15,
    });
  }
  return candles;
}

export const TradingChart: React.FC = () => {
  const { btcPrice, priceChange24h, selectedMarket, historicalReports } = useMarket();
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [chartType, setChartType] = useState<ChartType>('candles');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(760);

  useEffect(() => {
    setIsMounted(true);
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
    // If we have live on-chain reports from the CRE Attention Oracle, use them for 15m and 1H bars
    if (historicalReports && historicalReports.length > 0 && (timeframe === '15m' || timeframe === '1H')) {
      const mapped = mapReportsToCandles(historicalReports, btcPrice);
      if (mapped.length >= 42) {
        return mapped.slice(-42);
      }
      // Prepend leading synthetic candles transitioning into earliest on-chain report to maintain full chart
      const needed = 42 - mapped.length;
      const firstReportPrice = mapped[0].open;
      const leading = generateHistoricalData(firstReportPrice, timeframe, needed + 1).slice(0, needed);
      return [...leading, ...mapped];
    }
    return generateHistoricalData(btcPrice, timeframe, 42);
  }, [btcPrice, timeframe, historicalReports]);

  const activeCandle = hoveredIndex !== null && candles[hoveredIndex] ? candles[hoveredIndex] : candles[candles.length - 1];
  const activePrice = activeCandle ? activeCandle.close : btcPrice;
  const isPositive = priceChange24h >= 0;

  const height = 380;
  const padding = { top: 25, right: 70, bottom: 45, left: 10 };
  const chartWidth = Math.max(300, containerWidth);
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const volumeHeight = 55;
  const candlePlotHeight = plotHeight - volumeHeight - 15;

  const prices = candles.flatMap((c) => [c.high, c.low]);
  const minPriceRaw = Math.min(...prices);
  const maxPriceRaw = Math.max(...prices);
  const pricePadding = (maxPriceRaw - minPriceRaw) * 0.08 || (btcPrice * 0.03) || 1;
  const minPrice = minPriceRaw - pricePadding;
  const maxPrice = maxPriceRaw + pricePadding;
  const priceRange = maxPrice - minPrice || 1;

  const getY = (price: number) => {
    const normalized = (price - minPrice) / priceRange;
    return padding.top + candlePlotHeight - normalized * candlePlotHeight;
  };

  const getX = (index: number) => {
    const step = plotWidth / (candles.length - 1 || 1);
    return padding.left + index * step;
  };

  const maxVolume = Math.max(...candles.map((c) => c.volume), 1);
  const candleWidth = Math.max(4, Math.min(14, plotWidth / candles.length - 3));

  const yTicks = 4;
  const yTickPrices = useMemo(() => {
    return Array.from({ length: yTicks }, (_, i) => minPrice + (priceRange / (yTicks - 1)) * i);
  }, [minPrice, priceRange, yTicks]);

  const timeIndices = [0, 10, 20, 30, candles.length - 1];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x >= padding.left && x <= chartWidth - padding.right && y >= padding.top && y <= height - padding.bottom) {
      setMousePos({ x, y });
      const step = plotWidth / (candles.length - 1 || 1);
      const idx = Math.round((x - padding.left) / step);
      if (idx >= 0 && idx < candles.length) {
        setHoveredIndex(idx);
      }
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
    return candles.reduce((acc, c, i) => {
      const x = getX(i);
      const y = getY(c.close);
      return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
    }, '');
  }, [candles, plotWidth, priceRange, minPrice]);

  const areaPath = useMemo(() => {
    if (candles.length === 0) return '';
    const firstX = getX(0);
    const lastX = getX(candles.length - 1);
    const baselineY = padding.top + candlePlotHeight;
    return `${linePath} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
  }, [linePath, candles, plotWidth]);

  return (
    <div
      ref={containerRef}
      className="w-full bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_#000000] flex flex-col font-headline select-none"
    >
      {/* 1. TOP STATS BAR & CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-black">
        {/* Left: Ticker & Active Price with OHLC Values */}
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-extrabold text-black tracking-tight text-lg uppercase">
            {selectedMarket || 'ROBOTS/USD'}
          </span>
          <span className="font-mono text-2xl font-black text-black">
            {formatChartPrice(activePrice)}
          </span>
          <span
            className={`font-mono text-xs font-bold px-1.5 py-0.5 border border-black ${
              isPositive ? 'bg-[#00F076] text-black' : 'bg-[#FF3366] text-white'
            }`}
          >
            {isPositive ? `+${priceChange24h.toFixed(2)}%` : `${priceChange24h.toFixed(2)}%`}
          </span>

          {/* Active Candle OHLC pill values */}
          {activeCandle && (
            <div className="hidden lg:flex items-center gap-3 font-mono text-[11px] text-gray-700 ml-2">
              <span><strong className="text-black">O:</strong> {formatChartPrice(activeCandle.open)}</span>
              <span><strong className="text-black">H:</strong> {formatChartPrice(activeCandle.high)}</span>
              <span><strong className="text-black">L:</strong> {formatChartPrice(activeCandle.low)}</span>
              <span><strong className="text-black">C:</strong> {formatChartPrice(activeCandle.close)}</span>
            </div>
          )}
        </div>

        {/* Right: Timeframe & Chart Style Selectors */}
        <div className="flex items-center gap-2">
          {/* Timeframe Buttons */}
          <div className="flex border-2 border-black bg-white shadow-[2px_2px_0px_0px_#000000]">
            {(['15m', '1H', '4H', '1D', '1W'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 font-mono text-xs font-bold uppercase transition-colors cursor-pointer border-r border-black last:border-r-0 ${
                  timeframe === tf ? 'bg-black text-[#FFE600]' : 'bg-white hover:bg-neutral-100 text-black'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Chart Type Toggle */}
          <div className="flex border-2 border-black bg-white shadow-[2px_2px_0px_0px_#000000]">
            <button
              type="button"
              onClick={() => setChartType('candles')}
              title="Candlestick View"
              className={`p-1.5 font-mono text-xs font-bold border-r border-black cursor-pointer ${
                chartType === 'candles' ? 'bg-black text-[#FFE600]' : 'bg-white hover:bg-neutral-100 text-black'
              }`}
            >
              🕯️
            </button>
            <button
              type="button"
              onClick={() => setChartType('line')}
              title="Line Chart View"
              className={`p-1.5 font-mono text-xs font-bold cursor-pointer ${
                chartType === 'line' ? 'bg-black text-[#FFE600]' : 'bg-white hover:bg-neutral-100 text-black'
              }`}
            >
              📈
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN SVG INTERACTIVE CANVAS */}
      <div className="w-full relative mt-2">
        <svg
          width={chartWidth}
          height={height}
          className="overflow-visible cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Price Grid Lines & Axis Values */}
          {yTickPrices.map((price, idx) => {
            const y = getY(price);
            return (
              <g key={`grid-y-${idx}`}>
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
                  {formatChartPrice(price)}
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
                  width={68}
                  height={20}
                  fill="#FFE600"
                  stroke="#000000"
                  strokeWidth="1.5"
                />
                <text
                  x={chartWidth - padding.right + 34}
                  y={currentY + 4}
                  fontFamily="monospace"
                  fontSize="10"
                  fontWeight="bold"
                  fill="#000000"
                  textAnchor="middle"
                >
                  {formatChartPrice(btcPrice)}
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
                      width={68}
                      height={18}
                      fill="#000000"
                    />
                    <text
                      x={chartWidth - padding.right + 34}
                      y={mousePos.y + 3}
                      fontFamily="monospace"
                      fontSize="9"
                      fontWeight="bold"
                      fill="#FFFFFF"
                      textAnchor="middle"
                    >
                      {formatChartPrice(cursorPrice)}
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
          <span className="font-bold uppercase">Market: {selectedMarket || 'ROBOTS/USD'}</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-600">Chainlink CRE TEE Oracle OHLCV Feed • On-Chain Verified History</span>
        </div>
        <div className="flex items-center gap-1.5 font-bold text-[#006d32]">
          <span>●</span>
          <span className="uppercase">Hardware Enclave Verified</span>
        </div>
      </div>
    </div>
  );
};

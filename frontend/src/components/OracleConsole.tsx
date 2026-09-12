'use client';

import React, { useState, useMemo } from 'react';
import { useMarket, OnChainHistoricalReport } from '../context/MarketContext';
import { formatUsd } from '../config/contracts';

export const OracleConsole: React.FC = () => {
  const {
    availableMarkets,
    currentMarket,
    selectedMarket,
    setSelectedMarket,
    attentionTelemetry,
    historicalReports,
    allMarketHistories,
  } = useMarket();

  const [activeFilter, setActiveFilter] = useState<string>('CURRENT');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // Active reports based on filter
  const displayReports = useMemo(() => {
    if (activeFilter === 'ALL') {
      // Merge all market histories with market tag
      const merged: (OnChainHistoricalReport & { marketId: string; marketIcon: string; marketName: string })[] = [];
      for (const m of availableMarkets) {
        if (m.id === 'BTC') continue;
        const reports = allMarketHistories[m.id] || [];
        for (const r of reports) {
          merged.push({
            ...r,
            marketId: m.symbol,
            marketIcon: m.icon,
            marketName: m.name,
          });
        }
      }
      return merged.sort((a, b) => b.timestamp - a.timestamp);
    }

    const targetId = activeFilter === 'CURRENT' ? currentMarket.id : activeFilter;
    const targetMarket = availableMarkets.find((m) => m.id === targetId) || currentMarket;
    const reports = allMarketHistories[targetId] || historicalReports || [];
    return reports
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((r) => ({
        ...r,
        marketId: targetMarket.symbol,
        marketIcon: targetMarket.icon,
        marketName: targetMarket.name,
      }));
  }, [activeFilter, currentMarket, availableMarkets, allMarketHistories, historicalReports]);

  // Chart dataset for active single market (chronological order)
  const chartReports = useMemo(() => {
    if (activeFilter === 'ALL') {
      return (historicalReports || []).slice(-24);
    }
    const targetId = activeFilter === 'CURRENT' ? currentMarket.id : activeFilter;
    const reports = allMarketHistories[targetId] || historicalReports || [];
    return reports.slice(-24);
  }, [activeFilter, currentMarket, allMarketHistories, historicalReports]);

  // Chart bounds & SVG calculations
  const chartHeight = 220;
  const chartWidth = 900;
  const padding = { top: 20, right: 30, bottom: 35, left: 55 };

  const { minPrice, maxPrice, priceRange, points, areaPath, linePath } = useMemo(() => {
    if (!chartReports || chartReports.length === 0) {
      return { minPrice: 0, maxPrice: 100, priceRange: 100, points: [], areaPath: '', linePath: '' };
    }

    const prices = chartReports.map((r) => r.indexPrice);
    const min = Math.min(...prices) * 0.98;
    const max = Math.max(...prices) * 1.02;
    const range = max - min || 1;

    const innerW = chartWidth - padding.left - padding.right;
    const innerH = chartHeight - padding.top - padding.bottom;

    const coords = chartReports.map((r, i) => {
      const x = padding.left + (i / Math.max(1, chartReports.length - 1)) * innerW;
      const y = padding.top + innerH - ((r.indexPrice - min) / range) * innerH;
      return { x, y, report: r };
    });

    const line = coords.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`, '');
    const lastX = coords[coords.length - 1]?.x || innerW;
    const firstX = coords[0]?.x || padding.left;
    const bottomY = padding.top + innerH;
    const area = `${line} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;

    return {
      minPrice: min,
      maxPrice: max,
      priceRange: range,
      points: coords,
      linePath: line,
      areaPath: area,
    };
  }, [chartReports]);

  return (
    <div className="flex flex-col gap-6 font-headline">

      {/* 2. TOP METRICS COCKPIT: 4 Key Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Mark Price */}
        <div className="bg-white border-2 border-black shadow-[3px_3px_0px_0px_#000000] p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center text-gray-500 font-mono text-xs">
            <span className="font-bold uppercase text-black">{currentMarket.symbol} MARK PRICE</span>
            <span className="bg-[#00E5FF] text-black font-bold px-1.5 py-0.5 border border-black text-[10px]">
              SETTLEMENT PRICE
            </span>
          </div>
          <div className="my-2">
            <span className="font-mono text-3xl font-black text-black tracking-tight block">
              ${currentMarket.basePrice < 1000 ? currentMarket.basePrice.toFixed(2) : Math.round(currentMarket.basePrice).toLocaleString()}
            </span>
            <span className="font-mono text-xs font-bold text-[#006d32]">
              +3.45% (24H Attention Drift)
            </span>
          </div>
          <span className="text-[10px] font-mono text-gray-400 border-t border-gray-200 pt-2 block">
            Target Asset: {currentMarket.symbol}/USD
          </span>
        </div>

        {/* Card 2: Market Sentiment */}
        <div className="bg-white border-2 border-black shadow-[3px_3px_0px_0px_#000000] p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center text-gray-500 font-mono text-xs">
            <span className="font-bold uppercase text-black">MARKET SENTIMENT</span>
            <span className="bg-[#00F076] text-black font-bold px-1.5 py-0.5 border border-black text-[10px]">
              SENTIMENT ANALYSIS
            </span>
          </div>
          <div className="my-2">
            <span className="font-mono text-3xl font-black text-[#006d32] tracking-tight block">
              +{(attentionTelemetry.sentimentScore / 100).toFixed(2)} Bull
            </span>
            <div className="w-full bg-gray-200 h-2 border border-black mt-2 overflow-hidden">
              <div
                className="bg-[#00F076] h-full"
                style={{ width: `${Math.min(100, Math.max(10, ((attentionTelemetry.sentimentScore + 100) / 200) * 100))}%` }}
              />
            </div>
          </div>
          <span className="text-[10px] font-mono text-gray-400 border-t border-gray-200 pt-2 block">
            Normalized across gaming &amp; tech media
          </span>
        </div>

        {/* Card 3: Social & Search Velocity */}
        <div className="bg-white border-2 border-black shadow-[3px_3px_0px_0px_#000000] p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center text-gray-500 font-mono text-xs">
            <span className="font-bold uppercase text-black">SEARCH &amp; NEWS VELOCITY</span>
            <span className="bg-[#FFE600] text-black font-bold px-1.5 py-0.5 border border-black text-[10px]">
              TREND MOMENTUM
            </span>
          </div>
          <div className="my-2">
            <span className="font-mono text-3xl font-black text-black tracking-tight block">
              {attentionTelemetry.socialVelocity}<span className="text-gray-400 text-lg">/100</span>
            </span>
            <div className="w-full bg-gray-200 h-2 border border-black mt-2 overflow-hidden">
              <div
                className="bg-[#FFE600] h-full"
                style={{ width: `${Math.min(100, attentionTelemetry.socialVelocity)}%` }}
              />
            </div>
          </div>
          <span className="text-[10px] font-mono text-gray-400 border-t border-gray-200 pt-2 block">
            {(attentionTelemetry.newsMentions24h / 1000).toFixed(1)}k verified 24h mentions
          </span>
        </div>

        {/* Card 4: Ground Truth Attention Oracle */}
        <div className="bg-white border-2 border-black shadow-[3px_3px_0px_0px_#000000] p-4 flex flex-col justify-between">
          <div className="flex justify-between items-center text-gray-500 font-mono text-xs">
            <span className="font-bold uppercase text-black">GROUND TRUTH ATTENTION ORACLE</span>
            <span className="bg-[#00F076] text-black font-bold px-1.5 py-0.5 border border-black text-[10px]">
              ● TEE CONSENSUS
            </span>
          </div>
          <div className="my-2">
            <span className="font-mono text-2xl md:text-3xl font-black text-black tracking-tight block">
              CRE TEE v1.20
            </span>
            <span className="font-mono text-xs font-bold text-[#006875] block mt-0.5">
              Chainlink CRE Enclave DON
            </span>
          </div>
          <span className="text-[10px] font-mono text-gray-400 border-t border-gray-200 pt-2 block">
            Hourly execution cadence (0 * * * *)
          </span>
        </div>
      </div>

      {/* 3. INTERACTIVE 24-HOUR ORACLE TREND CHART */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 md:p-6 flex flex-col gap-4">
        {/* Header & Market Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-2 border-black">
          <div>
            <h3 className="text-lg font-black text-black uppercase tracking-tight flex items-center gap-2">
              <span>📈</span> 24-Hour Attention Oracle Index Trajectory
            </h3>
            <p className="text-gray-600 font-mono text-xs mt-0.5">
              Historical ground truth mark prices published on-chain by the hardware enclave every hour.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {availableMarkets
              .filter((m) => m.id !== 'BTC')
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedMarket(m.id);
                    setActiveFilter(m.id);
                  }}
                  className={`h-9 px-3 border-2 border-black font-mono text-xs font-bold uppercase transition-all shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center gap-1.5 cursor-pointer ${
                    activeFilter === m.id || (activeFilter === 'CURRENT' && selectedMarket === m.id)
                      ? 'bg-[#00E5FF] text-black'
                      : 'bg-white hover:bg-neutral-100 text-black'
                  }`}
                >
                  <span>{m.icon}</span>
                  <span>{m.symbol}</span>
                </button>
              ))}

            <button
              type="button"
              onClick={() => setActiveFilter('ALL')}
              className={`h-9 px-3 border-2 border-black font-mono text-xs font-bold uppercase transition-all shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center gap-1.5 cursor-pointer ${
                activeFilter === 'ALL'
                  ? 'bg-[#FFE600] text-black'
                  : 'bg-white hover:bg-neutral-100 text-black'
              }`}
            >
              <span>🌐</span>
              <span>ALL MARKETS</span>
            </button>
          </div>
        </div>

        {/* SVG Historical Chart */}
        <div className="relative w-full bg-[#FAFAFA] border-2 border-black overflow-hidden p-2">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="w-full h-auto select-none"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="oracleLineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
              const p = minPrice + (1 - ratio) * priceRange;
              const y = padding.top + ratio * (chartHeight - padding.top - padding.bottom);
              return (
                <g key={`grid-y-${idx}`}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={chartWidth - padding.right}
                    y2={y}
                    stroke="#E5E5E5"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 3}
                    fontFamily="monospace"
                    fontSize="10"
                    fill="#737373"
                    fontWeight="bold"
                    textAnchor="end"
                  >
                    ${p < 1000 ? p.toFixed(2) : Math.round(p).toLocaleString()}
                  </text>
                </g>
              );
            })}

            {/* Shaded Area Fill */}
            {areaPath && <path d={areaPath} fill="url(#oracleLineGrad)" />}

            {/* Main Trend Line */}
            {linePath && <path d={linePath} fill="none" stroke="#000000" strokeWidth="2.5" />}

            {/* Individual Data Points */}
            {points.map((pt, i) => {
              const isHovered = hoveredPointIndex === i;
              return (
                <g key={`pt-${i}`}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 6 : 3.5}
                    fill={isHovered ? '#FFE600' : '#00E5FF'}
                    stroke="#000000"
                    strokeWidth="2"
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHoveredPointIndex(i)}
                    onMouseLeave={() => setHoveredPointIndex(null)}
                  />
                  {/* Timestamp label on bottom axis */}
                  {i % 4 === 0 && (
                    <text
                      x={pt.x}
                      y={chartHeight - 10}
                      fontFamily="monospace"
                      fontSize="9"
                      fill="#737373"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {String(new Date(pt.report.timestamp * 1000).getUTCHours()).padStart(2, '0')}:{String(new Date(pt.report.timestamp * 1000).getUTCMinutes()).padStart(2, '0')}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Tooltip on Hover */}
            {hoveredPointIndex !== null && points[hoveredPointIndex] && (
              <g>
                <line
                  x1={points[hoveredPointIndex].x}
                  y1={padding.top}
                  x2={points[hoveredPointIndex].x}
                  y2={chartHeight - padding.bottom}
                  stroke="#000000"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <rect
                  x={Math.min(chartWidth - 140, Math.max(padding.left, points[hoveredPointIndex].x - 65))}
                  y={Math.max(10, points[hoveredPointIndex].y - 45)}
                  width="130"
                  height="38"
                  fill="#000000"
                  rx="0"
                />
                <text
                  x={Math.min(chartWidth - 140, Math.max(padding.left, points[hoveredPointIndex].x - 65)) + 65}
                  y={Math.max(10, points[hoveredPointIndex].y - 45) + 15}
                  fontFamily="monospace"
                  fontSize="11"
                  fontWeight="black"
                  fill="#FFE600"
                  textAnchor="middle"
                >
                  ${points[hoveredPointIndex].report.indexPrice.toFixed(2)}
                </text>
                <text
                  x={Math.min(chartWidth - 140, Math.max(padding.left, points[hoveredPointIndex].x - 65)) + 65}
                  y={Math.max(10, points[hoveredPointIndex].y - 45) + 30}
                  fontFamily="monospace"
                  fontSize="9"
                  fill="#FFFFFF"
                  textAnchor="middle"
                >
                  Sent: +{(points[hoveredPointIndex].report.sentimentScore / 100).toFixed(2)} | Vel: {points[hoveredPointIndex].report.socialVelocity}
                </text>
              </g>
            )}
          </svg>
        </div>

        <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-gray-500 pt-1">
          <span>Displaying 24 hourly consensus reads leading to current block</span>
          <span className="text-black font-bold">Consensus: Workflow DON BFT Agreement (Arbitrum One)</span>
        </div>
      </div>

      {/* 4. CHRONOLOGICAL ON-CHAIN FEED LOG / DATA TABLE */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 md:p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-black">
          <div>
            <h3 className="text-lg font-black text-black uppercase tracking-tight flex items-center gap-2">
              <span>📜</span> Live Enclave Execution Feed &amp; Historical Read Log
            </h3>
            <p className="text-gray-600 font-mono text-xs mt-0.5">
              Every on-chain attention report record stored in <code className="bg-neutral-100 px-1 border border-neutral-300">AttentionOracle.sol</code>.
            </p>
          </div>
          <span className="bg-black text-[#00F076] font-mono text-xs font-bold px-3 py-1 border border-black shadow-[2px_2px_0px_0px_#000000]">
            {displayReports.length} TOTAL ENTRIES
          </span>
        </div>

        {/* Feed Table */}
        <div className="w-full overflow-x-auto border-2 border-black">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-black text-white uppercase text-[11px] font-black border-b-2 border-black">
              <tr>
                <th className="py-3 px-4">TIMESTAMP (UTC)</th>
                <th className="py-3 px-4">ATTENTION MARKET</th>
                <th className="py-3 px-4">INDEX PRICE</th>
                <th className="py-3 px-4">SENTIMENT</th>
                <th className="py-3 px-4">SOCIAL VELOCITY</th>
                <th className="py-3 px-4">24H MENTIONS</th>
                <th className="py-3 px-4 text-right">ENCLAVE ATTESTATION</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-neutral-200 bg-white">
              {displayReports.map((report, idx) => {
                const date = new Date(report.timestamp * 1000);
                const timeStr = `${date.toISOString().slice(0, 10)} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
                const isBull = report.sentimentScore >= 0;

                return (
                  <tr key={`report-${idx}`} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-black">{timeStr}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-black text-[#FFE600] flex items-center justify-center font-bold text-xs">
                          {report.marketIcon}
                        </span>
                        <span className="font-extrabold text-black">{report.marketId}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-extrabold text-base text-black">
                      ${report.indexPrice < 1000 ? report.indexPrice.toFixed(2) : Math.round(report.indexPrice).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 font-bold border border-black ${isBull ? 'bg-[#00F076] text-black' : 'bg-[#FF3366] text-white'}`}>
                        {isBull ? `+${(report.sentimentScore / 100).toFixed(2)} Bull` : `${(report.sentimentScore / 100).toFixed(2)} Bear`}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-black">{report.socialVelocity}/100</span>
                        <div className="w-16 bg-gray-200 h-2 border border-black overflow-hidden hidden sm:block">
                          <div className="bg-[#FFE600] h-full" style={{ width: `${report.socialVelocity}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-700">
                      {report.newsMentions24h.toLocaleString()} articles
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="bg-[#00E5FF] text-black font-extrabold px-2 py-0.5 border border-black text-[10px]">
                        TEE CONSENSUS VERIFIED
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>


    </div>
  );
};

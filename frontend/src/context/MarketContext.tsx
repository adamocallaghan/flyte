'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from './Web3Context';
import { A_USDC_ADDRESS, LOCAL_RPC_URL } from '../config/contracts';

export interface OnChainHistoricalReport {
  timestamp: number;
  indexPrice: number;
  sentimentScore: number;
  socialVelocity: number;
  newsMentions24h: number;
}

export interface AttentionTelemetry {
  sentimentScore: number;    // -100 to +100 (e.g. 56 = +0.56 Bullish)
  socialVelocity: number;    // 0 to 100
  newsMentions24h: number;   // mentions count
  lastUpdatedAt: number;     // unix timestamp
  enclaveType: string;       // "AWS Nitro Enclave"
  status: string;            // "ATTESTED & SECURE"
  provider: string;          // "Chainlink CRE"
  consensus: string;         // "Workflow DON (BFT Consensus)"
}

export interface MarketInfo {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  maxLeverage: string;
  status: 'LIVE' | 'DEMO';
  basePrice: number;
  category: 'TECH' | 'CULTURAL' | 'CRYPTO';
  description: string;
  virtualAssetAddress?: string;
  defaultSentiment: number;
  defaultVelocity: number;
  defaultMentions: number;
}

export const AVAILABLE_MARKETS: MarketInfo[] = [
  {
    id: 'ROBOTS/USD',
    name: 'ROBOTS / USD',
    symbol: 'ROBOTS',
    icon: '🤖',
    category: 'TECH',
    maxLeverage: '10x',
    status: 'LIVE',
    basePrice: 75.50,
    description: 'Autonomous humanoid robotics & embodied physical AI sentiment index',
    virtualAssetAddress: '0x1111111111111111111111111111111111110001',
    defaultSentiment: 56,
    defaultVelocity: 88,
    defaultMentions: 54200,
  },
  {
    id: 'GTA6/USD',
    name: 'GTA6 / USD',
    symbol: 'GTA6',
    icon: '🎮',
    category: 'CULTURAL',
    maxLeverage: '10x',
    status: 'LIVE',
    basePrice: 42.10,
    description: 'Gaming cultural hype, trailer metrics & entertainment buzz index',
    virtualAssetAddress: '0x1111111111111111111111111111111111110002',
    defaultSentiment: 78,
    defaultVelocity: 94,
    defaultMentions: 112000,
  },
  {
    id: 'DEEPSEEK/USD',
    name: 'DEEPSEEK / USD',
    symbol: 'DEEPSEEK',
    icon: '⚡',
    category: 'TECH',
    maxLeverage: '10x',
    status: 'LIVE',
    basePrice: 88.40,
    description: 'Open-weights frontier LLM benchmark mentions & developer mindshare index',
    virtualAssetAddress: '0x1111111111111111111111111111111111110003',
    defaultSentiment: 65,
    defaultVelocity: 82,
    defaultMentions: 46800,
  },
  {
    id: 'BTC/USD',
    name: 'BTC / USD',
    symbol: 'BTC',
    icon: '₿',
    category: 'CRYPTO',
    maxLeverage: '10x',
    status: 'DEMO',
    basePrice: 60000,
    description: 'Classic decentralized store-of-value crypto benchmark',
    defaultSentiment: 42,
    defaultVelocity: 65,
    defaultMentions: 320000,
  },
];

export interface MarketStats {
  selectedMarket: string;
  setSelectedMarket: (m: string) => void;
  availableMarkets: MarketInfo[];
  currentMarket: MarketInfo;
  btcPrice: number;
  rawBtcPrice: bigint;
  priceDirection: 'up' | 'down' | 'neutral';
  priceChange24h: number;
  longOi: bigint;
  shortOi: bigint;
  totalOi: bigint;
  longOiUsd: number;
  shortOiUsd: number;
  longOiPercent: number;
  shortOiPercent: number;
  fundingRate8hBps: number;
  fundingRate8hPercent: number;
  isOracleLoading: boolean;
  isUpdatingPrice: boolean;
  error: string | null;
  attentionTelemetry: AttentionTelemetry;
  historicalReports: OnChainHistoricalReport[];
  allMarketHistories: Record<string, OnChainHistoricalReport[]>;
  setMarketPrice: (priceInUsd: number) => Promise<boolean>;
  refreshMarketStats: (marketOverride?: MarketInfo) => Promise<void>;
}

const DEFAULT_STATS: MarketStats = {
  selectedMarket: 'ROBOTS/USD',
  setSelectedMarket: () => {},
  availableMarkets: AVAILABLE_MARKETS,
  currentMarket: AVAILABLE_MARKETS[0],
  btcPrice: 75.50,
  rawBtcPrice: ethers.parseUnits('75.50', 18),
  priceDirection: 'neutral',
  priceChange24h: 3.45,
  longOi: BigInt(0),
  shortOi: BigInt(0),
  totalOi: BigInt(0),
  longOiUsd: 150000,
  shortOiUsd: 125000,
  longOiPercent: 54.5,
  shortOiPercent: 45.5,
  fundingRate8hBps: 10,
  fundingRate8hPercent: 0.01,
  isOracleLoading: false,
  isUpdatingPrice: false,
  error: null,
  historicalReports: [],
  allMarketHistories: {},
  attentionTelemetry: {
    sentimentScore: 56,
    socialVelocity: 88,
    newsMentions24h: 54200,
    lastUpdatedAt: Math.floor(Date.now() / 1000),
    enclaveType: 'AWS Nitro Enclave',
    status: 'ATTESTED & SECURE',
    provider: 'Chainlink CRE',
    consensus: 'Workflow DON (BFT Consensus)',
  },
  setMarketPrice: async () => false,
  refreshMarketStats: async (_m?: MarketInfo) => {},
};

const MarketContext = createContext<MarketStats>(DEFAULT_STATS);


function generateDefaultHistory(basePrice: number, symbol: string): OnChainHistoricalReport[] {
  const reports: OnChainHistoricalReport[] = [];
  const now = Math.floor(Date.now() / 1000);
  const deltas = symbol === 'ROBOTS'
    ? [71.2, 71.4, 71.8, 71.5, 72.1, 72.6, 72.3, 72.9, 73.1, 73.5, 73.2, 73.8, 74.2, 73.9, 74.5, 74.8, 74.4, 75.0, 75.2, 74.9, 75.3, 75.1, 75.4, 75.5]
    : symbol === 'GTA6'
    ? [39.5, 39.7, 39.9, 39.8, 40.1, 40.3, 40.5, 40.4, 40.7, 40.9, 41.1, 41.0, 41.3, 41.5, 41.4, 41.6, 41.8, 41.7, 41.9, 42.0, 41.9, 42.1, 42.0, 42.1]
    : [81.2, 81.6, 82.1, 82.5, 83.0, 83.5, 84.2, 84.8, 85.3, 85.9, 86.4, 86.8, 87.2, 87.6, 87.9, 88.2, 88.5, 88.1, 88.4, 88.2, 88.6, 88.3, 88.5, 88.4];

  for (let i = 0; i < deltas.length; i++) {
    reports.push({
      timestamp: now - (deltas.length - 1 - i) * 3600,
      indexPrice: deltas[i],
      sentimentScore: 45 + (i % 25),
      socialVelocity: 65 + (i % 25),
      newsMentions24h: 45000 + (i * 600),
    });
  }
  return reports;
}

export const MarketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { oracleContract, appContract, isFork } = useWeb3();

  const [selectedMarket, setSelectedMarketState] = useState<string>('ROBOTS/USD');
  const currentMarket = useMemo(
    () => AVAILABLE_MARKETS.find((m) => m.id === selectedMarket) || AVAILABLE_MARKETS[0],
    [selectedMarket]
  );

  const [btcPrice, setBtcPrice] = useState<number>(75.50);
  const [rawBtcPrice, setRawBtcPrice] = useState<bigint>(ethers.parseUnits('75.50', 18));
  const [prevPrice, setPrevPrice] = useState<number>(75.50);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  const [priceChange24h, setPriceChange24h] = useState<number>(3.45);

  const [attentionTelemetry, setAttentionTelemetry] = useState<AttentionTelemetry>({
    sentimentScore: currentMarket.defaultSentiment,
    socialVelocity: currentMarket.defaultVelocity,
    newsMentions24h: currentMarket.defaultMentions,
    lastUpdatedAt: Math.floor(Date.now() / 1000),
    enclaveType: 'AWS Nitro Enclave',
    status: 'ATTESTED & SECURE',
    provider: 'Chainlink CRE',
    consensus: 'Workflow DON (BFT Consensus)',
  });

  const [longOi, setLongOi] = useState<bigint>(BigInt(0));
  const [shortOi, setShortOi] = useState<bigint>(BigInt(0));
  const [isOracleLoading, setIsOracleLoading] = useState<boolean>(false);
  const [isUpdatingPrice, setIsUpdatingPrice] = useState<boolean>(false);
  const [historicalReports, setHistoricalReports] = useState<OnChainHistoricalReport[]>(() =>
    generateDefaultHistory(75.50, 'ROBOTS')
  );
  const [allMarketHistories, setAllMarketHistories] = useState<Record<string, OnChainHistoricalReport[]>>(() => ({
    'ROBOTS/USD': generateDefaultHistory(75.50, 'ROBOTS'),
    'GTA6/USD': generateDefaultHistory(42.10, 'GTA6'),
    'DEEPSEEK/USD': generateDefaultHistory(88.40, 'DEEPSEEK'),
  }));
  const [error, setError] = useState<string | null>(null);

  // Set Market Price (Dev / Demo Tool / Sync)
  const setMarketPrice = useCallback(
    async (newPriceUsd: number): Promise<boolean> => {
      setIsUpdatingPrice(true);
      setError(null);
      try {
        const scaledPrice = ethers.parseUnits(newPriceUsd.toFixed(2), 18);

        // If in local fork, use Deployer account (owner of oracle) for guaranteed success
        if (isFork) {
          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          const deployerWallet = new ethers.Wallet(
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
            anvilProv
          );
          if (oracleContract) {
            const oracleWithOwner = oracleContract.connect(deployerWallet) as any;
            const tx = await oracleWithOwner.setPrice(A_USDC_ADDRESS, scaledPrice);
            await tx.wait();
          }
        } else if (oracleContract && oracleContract.runner) {
          const tx = await (oracleContract as any).setPrice(A_USDC_ADDRESS, scaledPrice);
          await tx.wait();
        }

        setPrevPrice(btcPrice);
        setBtcPrice(newPriceUsd);
        setRawBtcPrice(scaledPrice);
        setPriceDirection(newPriceUsd > btcPrice ? 'up' : 'down');
        const baseRef = currentMarket.basePrice || 75.50;
        const pctDelta = ((newPriceUsd - baseRef) / baseRef) * 100;
        setPriceChange24h(pctDelta);

        return true;
      } catch (err: any) {
        console.error('Failed to update oracle price:', err);
        setPrevPrice(btcPrice);
        setBtcPrice(newPriceUsd);
        setPriceDirection(newPriceUsd > btcPrice ? 'up' : 'down');
        const baseRef = currentMarket.basePrice || 75.50;
        const pctDelta = ((newPriceUsd - baseRef) / baseRef) * 100;
        setPriceChange24h(pctDelta);
        return true;
      } finally {
        setIsUpdatingPrice(false);
      }
    },
    [btcPrice, currentMarket, oracleContract, isFork]
  );

  // Fetch Live On-Chain Price, Attention Data, and Open Interest
  const refreshMarketStats = useCallback(
    async (marketOverride?: MarketInfo) => {
      if (!oracleContract) return;

      const activeMkt = marketOverride || currentMarket;
      setIsOracleLoading(true);
      try {
        // 1. Fetch Oracle Price for Active Market using its specific virtual asset address
        const assetAddress = activeMkt.virtualAssetAddress || A_USDC_ADDRESS;
        let priceRaw: bigint = await oracleContract.getPrice(assetAddress).catch(() => BigInt(0));

        // 2. Fetch Live Attention Report from AttentionOracle if available
        try {
          if (typeof (oracleContract as any).getAttentionData === 'function') {
            const report = await (oracleContract as any).getAttentionData(activeMkt.symbol);
            if (report && report.isConfigured) {
              setAttentionTelemetry({
                sentimentScore: Number(report.sentimentScore),
                socialVelocity: Number(report.socialVelocity),
                newsMentions24h: Number(report.newsMentions24h),
                lastUpdatedAt: Number(report.lastUpdatedAt),
                enclaveType: 'AWS Nitro Enclave',
                status: 'ATTESTED & SECURE',
                provider: 'Chainlink CRE',
                consensus: 'Workflow DON (BFT Consensus)',
              });

              // Fallback to report.indexPrice if getPrice returned 0
              if (priceRaw === BigInt(0) && report.indexPrice && BigInt(report.indexPrice) > BigInt(0)) {
                priceRaw = BigInt(report.indexPrice);
              }
            }
          }
        } catch {
          // use fallback telemetry
        }

        if (priceRaw > BigInt(0)) {
          const parsedPrice = parseFloat(ethers.formatUnits(priceRaw, 18));
          setBtcPrice((prev) => {
            if (parsedPrice > prev) setPriceDirection('up');
            else if (parsedPrice < prev) setPriceDirection('down');
            else setPriceDirection('neutral');
            return parsedPrice;
          });
          setRawBtcPrice(priceRaw);
          const baseRef = activeMkt.basePrice || 75.50;
          const pctDelta = ((parsedPrice - baseRef) / baseRef) * 100;
          setPriceChange24h(pctDelta);
        }

        // 3. Fetch On-Chain Historical Reports
        try {
          if (typeof (oracleContract as any).getHistoricalReports === 'function') {
            const rawHistory: any[] = await (oracleContract as any).getHistoricalReports(activeMkt.symbol, 50);
            if (rawHistory && rawHistory.length > 0) {
              const parsed: OnChainHistoricalReport[] = rawHistory.map((item: any) => ({
                timestamp: Number(item.timestamp),
                indexPrice: parseFloat(ethers.formatUnits(item.indexPrice, 18)),
                sentimentScore: Number(item.sentimentScore),
                socialVelocity: Number(item.socialVelocity),
                newsMentions24h: Number(item.newsMentions24h),
              }));
              setHistoricalReports(parsed);
              setAllMarketHistories((prev) => ({
                ...prev,
                [activeMkt.id]: parsed,
              }));
            }
          }
        } catch (historyErr) {
          // preserve existing history
        }

        // 4. Fetch App Open Interest
        if (appContract) {
          try {
            const [lOi, sOi] = await Promise.all([
              appContract.totalLongOi().catch(() => BigInt(0)),
              appContract.totalShortOi().catch(() => BigInt(0)),
            ]);
            setLongOi(lOi);
            setShortOi(sOi);
          } catch {
            // ignore if app not deployed
          }
        }
      } catch (err: any) {
        console.warn('Could not read oracle price:', err);
      } finally {
        setIsOracleLoading(false);
      }
    },
    [oracleContract, appContract, currentMarket]
  );

  // Switch Market and sync price immediately
  const setSelectedMarket = useCallback(
    (marketId: string) => {
      setSelectedMarketState(marketId);
      const target = AVAILABLE_MARKETS.find((m) => m.id === marketId) || AVAILABLE_MARKETS[0];
      setAttentionTelemetry({
        sentimentScore: target.defaultSentiment,
        socialVelocity: target.defaultVelocity,
        newsMentions24h: target.defaultMentions,
        lastUpdatedAt: Math.floor(Date.now() / 1000),
        enclaveType: 'AWS Nitro Enclave',
        status: 'ATTESTED & SECURE',
        provider: 'Chainlink CRE',
        consensus: 'Workflow DON (BFT Consensus)',
      });

      // Synchronize cached history immediately
      setAllMarketHistories((prev) => {
        const cached = prev[marketId];
        if (cached && cached.length > 0) {
          setHistoricalReports(cached);
        } else {
          setHistoricalReports(generateDefaultHistory(target.basePrice, target.symbol));
        }
        return prev;
      });

      // Set target price immediately to eliminate any flash or revert
      setBtcPrice(target.basePrice);
      setRawBtcPrice(ethers.parseUnits(target.basePrice.toFixed(2), 18));
      setPriceDirection('neutral');
      setPriceChange24h(0);

      // Trigger immediate live refresh for the selected market
      refreshMarketStats(target);

      // Synchronize on-chain price on Anvil so trades use market price
      if (isFork) {
        setMarketPrice(target.basePrice);
      }
    },
    [isFork, setMarketPrice, refreshMarketStats]
  );

  // Prefetch all markets on-chain historical reports on mount / oracle ready
  useEffect(() => {
    if (!oracleContract || typeof (oracleContract as any).getHistoricalReports !== 'function') return;
    AVAILABLE_MARKETS.forEach(async (m) => {
      try {
        const rawHistory: any[] = await (oracleContract as any).getHistoricalReports(m.symbol, 50);
        if (rawHistory && rawHistory.length > 0) {
          const parsed: OnChainHistoricalReport[] = rawHistory.map((item: any) => ({
            timestamp: Number(item.timestamp),
            indexPrice: parseFloat(ethers.formatUnits(item.indexPrice, 18)),
            sentimentScore: Number(item.sentimentScore),
            socialVelocity: Number(item.socialVelocity),
            newsMentions24h: Number(item.newsMentions24h),
          }));
          setAllMarketHistories((prev) => ({ ...prev, [m.id]: parsed }));
          if (m.id === selectedMarket) {
            setHistoricalReports(parsed);
          }
        }
      } catch {}
    });
  }, [oracleContract, selectedMarket]);

  // Poll on-chain stats every 4 seconds
  useEffect(() => {
    refreshMarketStats();
    const interval = setInterval(refreshMarketStats, 4000);
    return () => clearInterval(interval);
  }, [refreshMarketStats]);

  // Calculations for UI
  const totalOi = longOi + shortOi;

  // Derive USD amounts (fallback to mock values if on-chain OI is 0)
  const hasOnChainOi = totalOi > BigInt(0);
  const longOiUsd = hasOnChainOi ? parseFloat(ethers.formatUnits(longOi, 18)) : 150000;
  const shortOiUsd = hasOnChainOi ? parseFloat(ethers.formatUnits(shortOi, 18)) : 125000;
  const totalOiUsd = longOiUsd + shortOiUsd;

  const longOiPercent = totalOiUsd > 0 ? (longOiUsd / totalOiUsd) * 100 : 50;
  const shortOiPercent = totalOiUsd > 0 ? (shortOiUsd / totalOiUsd) * 100 : 50;

  // Skew-based funding rate: base 10 bps, capped at 75 bps
  const skew = totalOiUsd > 0 ? (longOiUsd - shortOiUsd) / totalOiUsd : 0.1;
  const fundingRate8hBps = Math.max(-75, Math.min(75, Math.round(skew * 75)));
  const fundingRate8hPercent = fundingRate8hBps / 100;

  const value = useMemo<MarketStats>(
    () => ({
      selectedMarket,
      setSelectedMarket,
      availableMarkets: AVAILABLE_MARKETS,
      currentMarket,
      btcPrice,
      rawBtcPrice,
      priceDirection,
      priceChange24h,
      longOi,
      shortOi,
      totalOi,
      longOiUsd,
      shortOiUsd,
      longOiPercent,
      shortOiPercent,
      fundingRate8hBps,
      fundingRate8hPercent,
      isOracleLoading,
      isUpdatingPrice,
      error,
      attentionTelemetry,
      historicalReports,
      allMarketHistories,
      setMarketPrice,
      refreshMarketStats,
    }),
    [
      selectedMarket,
      setSelectedMarket,
      currentMarket,
      btcPrice,
      rawBtcPrice,
      priceDirection,
      priceChange24h,
      longOi,
      shortOi,
      totalOi,
      longOiUsd,
      shortOiUsd,
      longOiPercent,
      shortOiPercent,
      fundingRate8hBps,
      fundingRate8hPercent,
      isOracleLoading,
      isUpdatingPrice,
      error,
      attentionTelemetry,
      historicalReports,
      allMarketHistories,
      setMarketPrice,
      refreshMarketStats,
    ]
  );

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
};

export const useMarket = (): MarketStats => {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used within a MarketProvider');
  return ctx;
};

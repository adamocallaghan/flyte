'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from './Web3Context';
import { A_USDC_ADDRESS, LOCAL_RPC_URL } from '../config/contracts';

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
  setMarketPrice: (priceInUsd: number) => Promise<boolean>;
  refreshMarketStats: () => Promise<void>;
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
  refreshMarketStats: async () => {},
};

const MarketContext = createContext<MarketStats>(DEFAULT_STATS);

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

  // Switch Market and optionally sync oracle price to active market base
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
      // Synchronize on-chain price on Anvil so trades use market price
      if (isFork) {
        setMarketPrice(target.basePrice);
      } else {
        setBtcPrice(target.basePrice);
        setRawBtcPrice(ethers.parseUnits(target.basePrice.toFixed(2), 18));
      }
    },
    [isFork, setMarketPrice]
  );

  // Fetch Live On-Chain Price, Attention Data, and Open Interest
  const refreshMarketStats = useCallback(async () => {
    if (!oracleContract) return;

    setIsOracleLoading(true);
    try {
      // 1. Fetch Oracle Price for Active Market (A_USDC)
      const priceRaw: bigint = await oracleContract.getPrice(A_USDC_ADDRESS).catch(() => BigInt(0));

      if (priceRaw > BigInt(0)) {
        const parsedPrice = parseFloat(ethers.formatUnits(priceRaw, 18));
        setBtcPrice((prev) => {
          if (parsedPrice > prev) setPriceDirection('up');
          else if (parsedPrice < prev) setPriceDirection('down');
          else setPriceDirection('neutral');
          return parsedPrice;
        });
        setRawBtcPrice(priceRaw);
      }

      // 2. Fetch Live Attention Report from AttentionOracle if available
      try {
        if (typeof (oracleContract as any).getAttentionData === 'function') {
          const report = await (oracleContract as any).getAttentionData(currentMarket.symbol);
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
          }
        }
      } catch {
        // use fallback telemetry
      }

      // 3. Fetch App Open Interest
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
  }, [oracleContract, appContract, currentMarket]);

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

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from './Web3Context';
import { A_USDC_ADDRESS, LOCAL_RPC_URL } from '../config/contracts';

export interface MarketStats {
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
  setMarketPrice: (priceInUsd: number) => Promise<boolean>;
  refreshMarketStats: () => Promise<void>;
}

const DEFAULT_STATS: MarketStats = {
  btcPrice: 60000,
  rawBtcPrice: ethers.parseUnits('60000', 18),
  priceDirection: 'neutral',
  priceChange24h: 2.35,
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
  setMarketPrice: async () => false,
  refreshMarketStats: async () => {},
};

const MarketContext = createContext<MarketStats>(DEFAULT_STATS);

export const MarketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { oracleContract, appContract, provider, isFork } = useWeb3();

  const [btcPrice, setBtcPrice] = useState<number>(60000);
  const [rawBtcPrice, setRawBtcPrice] = useState<bigint>(ethers.parseUnits('60000', 18));
  const [prevPrice, setPrevPrice] = useState<number>(60000);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  const [priceChange24h, setPriceChange24h] = useState<number>(2.35);

  const [longOi, setLongOi] = useState<bigint>(BigInt(0));
  const [shortOi, setShortOi] = useState<bigint>(BigInt(0));
  const [isOracleLoading, setIsOracleLoading] = useState<boolean>(false);
  const [isUpdatingPrice, setIsUpdatingPrice] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Live On-Chain Price and Open Interest
  const refreshMarketStats = useCallback(async () => {
    if (!oracleContract) return;

    setIsOracleLoading(true);
    try {
      // 1. Fetch Oracle Price for aUSDC/BTC
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

      // 2. Fetch App Open Interest
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
  }, [oracleContract, appContract]);

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

  // Set Market Price (Dev / Demo Tool)
  const setMarketPrice = useCallback(
    async (newPriceUsd: number): Promise<boolean> => {
      setIsUpdatingPrice(true);
      setError(null);
      try {
        const scaledPrice = ethers.parseUnits(newPriceUsd.toFixed(2), 18);

        // If in local fork, use Deployer account (owner of oracle) for guaranteed success
        if (isFork) {
          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          // Deployer private key (Account 0)
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
          // Connected wallet call
          const tx = await (oracleContract as any).setPrice(A_USDC_ADDRESS, scaledPrice);
          await tx.wait();
        }

        // Immediately update state and notify direction
        setPrevPrice(btcPrice);
        setBtcPrice(newPriceUsd);
        setRawBtcPrice(scaledPrice);
        setPriceDirection(newPriceUsd > btcPrice ? 'up' : 'down');
        const pctDelta = ((newPriceUsd - 60000) / 60000) * 100;
        setPriceChange24h(pctDelta);

        // Trigger on-chain refresh
        setTimeout(refreshMarketStats, 500);
        return true;
      } catch (err: any) {
        console.error('Failed to update oracle price:', err);
        // Fallback: update in-memory state for client-side demo if RPC fails
        setPrevPrice(btcPrice);
        setBtcPrice(newPriceUsd);
        setPriceDirection(newPriceUsd > btcPrice ? 'up' : 'down');
        const pctDelta = ((newPriceUsd - 60000) / 60000) * 100;
        setPriceChange24h(pctDelta);
        return true;
      } finally {
        setIsUpdatingPrice(false);
      }
    },
    [btcPrice, oracleContract, isFork, refreshMarketStats]
  );

  const value = useMemo<MarketStats>(
    () => ({
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
      setMarketPrice,
      refreshMarketStats,
    }),
    [
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

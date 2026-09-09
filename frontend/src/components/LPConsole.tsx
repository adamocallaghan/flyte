'use client';

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../context/Web3Context';
import {
  A_USDC_ADDRESS,
  AQUA_REGISTRY_ADDRESS,
  DEMO_ROLES,
  formatUsd,
  shortenAddress,
  LOCAL_RPC_URL,
} from '../config/contracts';

export interface ShippedQuote {
  strategyHash: string;
  maker: string;
  collateralToken: string;
  maxNotional: number;
  currentBalance?: number;
  maxLeverage: number;
  spreadBps: number;
  sideMask: number;
  quoteExpiry: number;
  status: 'active' | 'docked';
}

const DEFAULT_DEFAULT_QUOTE: ShippedQuote = {
  strategyHash: '0x8f2d5e3c7b1a40992384a6c8e5f1b0a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
  maker: DEMO_ROLES.lp.address,
  collateralToken: A_USDC_ADDRESS,
  maxNotional: 50000,
  maxLeverage: 10,
  spreadBps: 10,
  sideMask: 3,
  quoteExpiry: 0,
  status: 'active',
};

export const LPConsole: React.FC = () => {
  const {
    account,
    role,
    setRole,
    balances,
    aquaContract,
    aUsdcContract,
    appAddress,
    provider,
    signer,
    isFork,
    refreshBalances,
  } = useWeb3();

  // Active maker address: injected MetaMask when connected as browser, else Grimace
  const activeMaker = (role === 'browser' && account)
    ? account
    : (role === 'lp' ? account || DEMO_ROLES.lp.address : DEMO_ROLES.lp.address);
  const isBrowserMaker = role === 'browser' && !!account;

  // Quote Shipper Form State
  const [maxNotionalInput, setMaxNotionalInput] = useState<string>('50000');
  const [maxLeverage, setMaxLeverage] = useState<number>(10);
  const [spreadBps, setSpreadBps] = useState<number>(10);
  const [sideMask, setSideMask] = useState<number>(3); // 3 = Both, 1 = Long, 2 = Short
  const [quoteExpiry, setQuoteExpiry] = useState<number>(0); // 0 = perpetual

  const [shippedQuotes, setShippedQuotes] = useState<ShippedQuote[]>([DEFAULT_DEFAULT_QUOTE]);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isShipping, setIsShipping] = useState<boolean>(false);
  const [dockingHash, setDockingHash] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Aave v3 Yield Calculation (4.25% APY)
  const apy = 4.25;
  const lpBalance = parseFloat(balances.aUsdc) > 0 ? parseFloat(balances.aUsdc) : 50000;
  const annualInterest = (lpBalance * apy) / 100;
  const monthlyInterest = annualInterest / 12;
  const dailyInterest = annualInterest / 365;

  // Real-time ticking interest counter (adds simulated micro-yield)
  const [accruedYield, setAccruedYield] = useState<number>(12.458);

  useEffect(() => {
    const interval = setInterval(() => {
      // Accrue interest every second based on APY
      const perSecond = annualInterest / (365 * 86400);
      setAccruedYield((prev) => prev + perSecond);
    }, 1000);
    return () => clearInterval(interval);
  }, [annualInterest]);

  // Query live on-chain Shipped strategies from 1inch Aqua
  const loadAquaStrategies = React.useCallback(async () => {
    if (!aquaContract || !provider || !ethers.isAddress(appAddress)) return;

    try {
      const currentBlock = await provider.getBlockNumber();
      const startBlock = Math.max(0, currentBlock - 2000);

      const [shippedLogs, dockedLogs] = await Promise.all([
        aquaContract.queryFilter(aquaContract.filters.Shipped(), startBlock, 'latest').catch(() => []),
        aquaContract.queryFilter(aquaContract.filters.Docked(), startBlock, 'latest').catch(() => []),
      ]);

      const dockedHashes = new Set(
        dockedLogs.map((log: any) => log.args[2].toLowerCase())
      );

      const appShipped = shippedLogs.filter(
        (log: any) => log.args[1].toLowerCase() === appAddress.toLowerCase()
      );

      const strategyAbi = [
        'tuple(address lp, address collateralToken, uint256 maxNotional, uint256 maxLeverage, uint256 spreadBps, uint8 sideMask, uint256 quoteExpiry)',
      ];

      const quoteMap = new Map<string, ShippedQuote>();

      for (const log of appShipped) {
        const maker = (log as any).args?.[0];
        const strategyHash = (log as any).args?.[2];
        const strategyBytes = (log as any).args?.[3];
        if (!maker || !strategyHash || !strategyBytes) continue;

        try {
          const decoded = ethers.AbiCoder.defaultAbiCoder().decode(strategyAbi, strategyBytes)[0];
          const collateralToken = decoded[1];
          const maxNotional = parseFloat(ethers.formatUnits(decoded[2], 6));
          const maxLeverage = Number(decoded[3]);
          const spreadBps = Number(decoded[4]);
          const sideMask = Number(decoded[5]);
          const quoteExpiry = Number(decoded[6]);

          let currentBalance = maxNotional;
          let isDocked = dockedHashes.has(strategyHash.toLowerCase());

          try {
            const [bal] = await (aquaContract as any).rawBalances(maker, appAddress, strategyHash, collateralToken);
            currentBalance = parseFloat(ethers.formatUnits(bal, 6));
            if (currentBalance === 0) isDocked = true;
          } catch {}

          quoteMap.set(strategyHash.toLowerCase(), {
            strategyHash,
            maker,
            collateralToken,
            maxNotional,
            currentBalance,
            maxLeverage,
            spreadBps,
            sideMask,
            quoteExpiry,
            status: isDocked ? 'docked' : 'active',
          });
        } catch (e) {
          console.warn('Failed to decode Aqua strategy:', e);
        }
      }

      const loaded = Array.from(quoteMap.values());
      if (loaded.length > 0) {
        setShippedQuotes(loaded);
      }
    } catch (err) {
      console.warn('Could not load Aqua strategies:', err);
    }
  }, [aquaContract, provider, appAddress]);

  useEffect(() => {
    loadAquaStrategies();
    const interval = setInterval(loadAquaStrategies, 5000);
    return () => clearInterval(interval);
  }, [loadAquaStrategies]);

  // Allowance check for 1inch Aqua
  const notionalAmount = parseFloat(maxNotionalInput) || 0;
  const notionalRaw = ethers.parseUnits(notionalAmount > 0 ? notionalAmount.toFixed(6) : '0', 6);
  const isAquaAllowanceSufficient = balances.aUsdcAllowanceAqua >= notionalRaw && notionalRaw > BigInt(0);

  // 1. Approve aUSDC for 1inch Aqua Registry
  const handleApproveAqua = async () => {
    if (!aUsdcContract) return;
    setIsApproving(true);
    setStatusMessage({ type: 'info', text: `Approving aUSDC for 1inch Aqua Registry (${shortenAddress(activeMaker)})...` });

    try {
      let tokenContract = aUsdcContract;

      // In Demo simulation mode (not browser wallet), sign as Grimace
      if (role !== 'browser' && isFork) {
        const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
        const lpWallet = new ethers.Wallet(DEMO_ROLES.lp.privateKey, anvilProv);
        tokenContract = aUsdcContract.connect(lpWallet) as any;
      }

      const tx = await (tokenContract as any).approve(AQUA_REGISTRY_ADDRESS, ethers.MaxUint256);
      await tx.wait();
      await refreshBalances();

      setStatusMessage({ type: 'success', text: `✅ aUSDC successfully approved for 1inch Aqua (${shortenAddress(activeMaker)})!` });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Aqua approval failed:', err);
      setStatusMessage({ type: 'error', text: err.reason || err.message || 'Approval failed' });
    } finally {
      setIsApproving(false);
    }
  };

  // 2. Ship Strategy to 1inch Aqua
  const handleShipStrategy = async () => {
    if (notionalAmount <= 0) {
      alert('Please enter a valid notional depth');
      return;
    }

    setIsShipping(true);
    setStatusMessage({
      type: 'info',
      text: `Shipping JIT quote (${formatUsd(notionalAmount)} aUSDC depth) to 1inch Aqua for Maker ${shortenAddress(activeMaker)}...`,
    });

    try {
      const lpAddr = activeMaker;

      // Strategy Struct tuple
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const strategyBytes = abiCoder.encode(
        ['tuple(address lp, address collateralToken, uint256 maxNotional, uint256 maxLeverage, uint256 spreadBps, uint8 sideMask, uint256 quoteExpiry)'],
        [[
          lpAddr,
          A_USDC_ADDRESS,
          notionalRaw,
          BigInt(maxLeverage),
          BigInt(spreadBps),
          sideMask,
          BigInt(quoteExpiry),
        ]]
      );

      const computedHash = ethers.keccak256(strategyBytes);

      // Pre-cache Aqua storage slot on local Anvil fork to prevent RPC state trie pruning error
      if (isFork) {
        try {
          const slotMaker = ethers.keccak256(ethers.concat([
            ethers.zeroPadValue(lpAddr, 32),
            ethers.zeroPadValue('0x00', 32),
          ]));
          const slotApp = ethers.keccak256(ethers.concat([
            ethers.zeroPadValue(appAddress, 32),
            slotMaker,
          ]));
          const slotStrat = ethers.keccak256(ethers.concat([
            computedHash,
            slotApp,
          ]));
          const slotToken = ethers.keccak256(ethers.concat([
            ethers.zeroPadValue(A_USDC_ADDRESS, 32),
            slotStrat,
          ]));

          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          await anvilProv.send('anvil_setStorageAt', [
            AQUA_REGISTRY_ADDRESS,
            slotToken,
            '0x0000000000000000000000000000000000000000000000000000000000000000',
          ]);
        } catch (e) {
          console.warn('Aqua storage pre-cache skipped:', e);
        }
      }

      if (aquaContract && aquaContract.runner) {
        let contractToCall = aquaContract;

        // In Demo simulation mode (not browser wallet), sign as Grimace
        if (role !== 'browser' && isFork) {
          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          const lpWallet = new ethers.Wallet(DEMO_ROLES.lp.privateKey, anvilProv);
          contractToCall = aquaContract.connect(lpWallet) as any;
        }

        let gasLimit: bigint | undefined;
        try {
          const est = await (contractToCall as any).ship.estimateGas(
            appAddress,
            strategyBytes,
            [A_USDC_ADDRESS],
            [notionalRaw]
          );
          gasLimit = (est * 130n) / 100n;
        } catch {
          gasLimit = 350_000n;
        }

        const tx = await (contractToCall as any).ship(
          appAddress,
          strategyBytes,
          [A_USDC_ADDRESS],
          [notionalRaw],
          gasLimit ? { gasLimit } : {}
        );
        const receipt = await tx.wait();

        await loadAquaStrategies();
        await refreshBalances();

        setStatusMessage({
          type: 'success',
          text: `🎉 Quote shipped to 1inch Aqua! Hash: ${shortenAddress(computedHash)}. Tx: ${shortenAddress(receipt.hash)}`,
        });
      } else {
        // Demo fallback
        await new Promise((r) => setTimeout(r, 1000));
        const newQuote: ShippedQuote = {
          strategyHash: computedHash,
          maker: lpAddr,
          collateralToken: A_USDC_ADDRESS,
          maxNotional: notionalAmount,
          currentBalance: notionalAmount,
          maxLeverage,
          spreadBps,
          sideMask,
          quoteExpiry,
          status: 'active',
        };
        setShippedQuotes((prev) => [newQuote, ...prev]);
        setStatusMessage({
          type: 'success',
          text: `🎉 Quote shipped (Demo Mode)! Hash: ${shortenAddress(computedHash)}`,
        });
      }
    } catch (err: any) {
      console.error('Ship strategy failed:', err);
      setStatusMessage({
        type: 'error',
        text: err.reason || err.message || 'Failed to ship quote to Aqua',
      });
    } finally {
      setIsShipping(false);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  // 3. Dock (Deactivate) Strategy on Aqua
  const handleDockStrategy = async (quote: ShippedQuote) => {
    setDockingHash(quote.strategyHash);
    setStatusMessage({ type: 'info', text: `Docking strategy ${shortenAddress(quote.strategyHash)} on Aqua...` });

    try {
      if (aquaContract && aquaContract.runner) {
        let contractToCall = aquaContract;
        const isUserQuote = account && quote.maker.toLowerCase() === account.toLowerCase();

        if (!isUserQuote && isFork) {
          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          const lpWallet = new ethers.Wallet(DEMO_ROLES.lp.privateKey, anvilProv);
          contractToCall = aquaContract.connect(lpWallet) as any;
        }

        const tx = await (contractToCall as any).dock(
          appAddress,
          quote.strategyHash,
          [A_USDC_ADDRESS]
        );
        await tx.wait();
        await loadAquaStrategies();
      }

      setShippedQuotes((prev) =>
        prev.map((q) => (q.strategyHash === quote.strategyHash ? { ...q, status: 'docked' } : q))
      );

      setStatusMessage({
        type: 'success',
        text: `✅ Strategy ${shortenAddress(quote.strategyHash)} successfully docked and revoked!`,
      });
    } catch (err: any) {
      console.error('Dock failed:', err);
      setStatusMessage({ type: 'error', text: err.reason || err.message || 'Failed to dock strategy' });
    } finally {
      setDockingHash(null);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  return (
    <div className="flex flex-col gap-6 font-headline">


      {/* TOP ROW: Interactive Quote Shipper Form (75%) & Aave v3 Yield Accrual (25%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* 1. Quote Shipper Form (75% width on lg) */}
        <div className="lg:col-span-9 bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 md:p-6 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between pb-4 border-b-2 border-black mb-5 gap-3">
          <div>
            <h3 className="text-xl font-black text-black uppercase tracking-tight">
              Ship JIT Liquidity Strategy to 1inch Aqua
            </h3>
            <p className="text-gray-600 font-mono text-xs mt-1">
              Publish your orderbook quote parameters. Capital remains in your wallet earning Aave yield until matched.
            </p>
          </div>
          <span className="bg-black text-[#FFE600] font-mono text-xs font-bold px-2.5 py-1 border border-black shadow-[2px_2px_0px_0px_#000000]">
            aqua.ship(...)
          </span>
        </div>

        {/* Active Maker Status Bar */}
        <div className="mb-5 p-3.5 bg-[#FAFAFA] border-2 border-black flex flex-wrap justify-between items-center text-xs font-mono gap-3 shadow-[2px_2px_0px_0px_#000000]">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 uppercase font-bold">Maker Wallet:</span>
            <span className="font-bold text-black">{shortenAddress(activeMaker)}</span>
            {isBrowserMaker ? (
              <span className="bg-[#00E5FF] text-black font-bold px-1.5 py-0.5 border border-black text-[10px]">
                🦊 Injected MetaMask
              </span>
            ) : (
              <span className="bg-[#FFE600] text-black font-bold px-1.5 py-0.5 border border-black text-[10px]">
                Demo Grimace
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 uppercase font-bold">Aqua aUSDC Allowance:</span>
            <span className={`font-black ${isAquaAllowanceSufficient ? 'text-[#006d32]' : 'text-[#d9044b]'}`}>
              {parseFloat(ethers.formatUnits(balances.aUsdcAllowanceAqua, 6)) > 1e9
                ? 'Unlimited (Approved)'
                : `${formatUsd(balances.aUsdcAllowanceAqua)}`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {/* 1. Max Notional Depth */}
          <div>
            <label className="block font-mono text-xs font-bold text-black uppercase mb-1.5">
              Max Notional Depth (aUSDC)
            </label>
            <input
              type="number"
              step="5000"
              min="1000"
              max="500000"
              value={maxNotionalInput}
              onChange={(e) => setMaxNotionalInput(e.target.value)}
              className="w-full bg-[#FAFAFA] border-2 border-black p-2.5 font-mono text-sm font-bold text-black focus:outline-none focus:bg-white"
            />
          </div>

          {/* 2. Max Permitted Leverage */}
          <div>
            <label className="block font-mono text-xs font-bold text-black uppercase mb-1.5">
              Max Allowed Leverage
            </label>
            <select
              value={maxLeverage}
              onChange={(e) => setMaxLeverage(parseInt(e.target.value))}
              className="w-full bg-[#FAFAFA] border-2 border-black p-2.5 font-mono text-sm font-bold text-black focus:outline-none focus:bg-white cursor-pointer"
            >
              <option value="5">5x Leverage</option>
              <option value="10">10x Leverage (Standard)</option>
              <option value="20">20x Leverage (Aggressive)</option>
            </select>
          </div>

          {/* 3. Quoted Spread */}
          <div>
            <label className="block font-mono text-xs font-bold text-black uppercase mb-1.5">
              Quoted Spread (Basis Points)
            </label>
            <select
              value={spreadBps}
              onChange={(e) => setSpreadBps(parseInt(e.target.value))}
              className="w-full bg-[#FAFAFA] border-2 border-black p-2.5 font-mono text-sm font-bold text-black focus:outline-none focus:bg-white cursor-pointer"
            >
              <option value="5">5 bps (0.05% tight)</option>
              <option value="10">10 bps (0.10% standard)</option>
              <option value="25">25 bps (0.25% high vol)</option>
            </select>
          </div>

          {/* 4. Side Mask */}
          <div>
            <label className="block font-mono text-xs font-bold text-black uppercase mb-1.5">
              Permitted Trader Sides
            </label>
            <select
              value={sideMask}
              onChange={(e) => setSideMask(parseInt(e.target.value))}
              className="w-full bg-[#FAFAFA] border-2 border-black p-2.5 font-mono text-sm font-bold text-black focus:outline-none focus:bg-white cursor-pointer"
            >
              <option value="3">Both Longs &amp; Shorts (Mask = 3)</option>
              <option value="1">Longs Only (Mask = 1)</option>
              <option value="2">Shorts Only (Mask = 2)</option>
            </select>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap gap-3">
          {!isAquaAllowanceSufficient ? (
            <button
              type="button"
              onClick={handleApproveAqua}
              disabled={isApproving}
              id="btn-approve-aqua"
              className="h-12 bg-[#00E5FF] hover:bg-[#00cbe2] text-black border-2 border-black font-headline font-black text-sm uppercase px-8 py-3.5 tracking-wider shadow-[3px_3px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer"
            >
              {isApproving ? 'Approving 1inch Aqua...' : '1. Approve aUSDC for 1inch Aqua'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleShipStrategy}
              disabled={isShipping}
              id="btn-ship-strategy"
              className="h-12 bg-[#00F076] hover:bg-[#00d669] text-black border-2 border-black font-headline font-black text-sm uppercase px-8 py-3.5 tracking-wider shadow-[3px_3px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isShipping ? 'Shipping to Aqua...' : 'Ship Strategy to 1inch Aqua'}
            </button>
          )}
        </div>
        </div>

        {/* 2. Compact Aave v3 Yield Accrual Widget (25% width on lg) */}
        <div className="lg:col-span-3 bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center pb-3 border-b-2 border-black mb-4">
              <span className="font-mono text-xs font-black text-black uppercase tracking-wider">
                Aave v3 Yield
              </span>
              <span className="bg-[#00F076] border-2 border-black font-mono text-[10px] font-bold px-2 py-0.5 text-black uppercase shadow-[1px_1px_0px_0px_#000000]">
                {apy}% APY
              </span>
            </div>

            <div className="font-mono text-2xl md:text-3xl font-black text-[#006d32] mb-1">
              +${accruedYield.toFixed(4)}
            </div>
            <p className="text-gray-600 font-mono text-xs mb-4 leading-relaxed">
              Live interest accrued in your wallet while JIT quotes remain active on 1inch Aqua.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-3 border-t-2 border-black">
            <div className="bg-[#FAFAFA] border-2 border-black p-2.5 flex justify-between items-center shadow-[1px_1px_0px_0px_#000000]">
              <span className="font-mono text-[10px] text-gray-500 uppercase font-bold">Daily</span>
              <span className="font-mono font-black text-xs text-black">
                +${dailyInterest.toFixed(2)}
              </span>
            </div>
            <div className="bg-[#FAFAFA] border-2 border-black p-2.5 flex justify-between items-center shadow-[1px_1px_0px_0px_#000000]">
              <span className="font-mono text-[10px] text-gray-500 uppercase font-bold">Monthly</span>
              <span className="font-mono font-black text-xs text-black">
                +${monthlyInterest.toFixed(2)}
              </span>
            </div>
            <div className="bg-[#FAFAFA] border-2 border-black p-2.5 flex justify-between items-center shadow-[1px_1px_0px_0px_#000000]">
              <span className="font-mono text-[10px] text-gray-500 uppercase font-bold">Annual</span>
              <span className="font-mono font-black text-xs text-black">
                +${annualInterest.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION: Active Shipped Quotes Inspector */}
      <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] p-5 md:p-6">
        <div className="flex flex-wrap justify-between items-center pb-4 border-b-2 border-black mb-5 gap-3">
          <div className="flex items-center gap-3">
            <h4 className="text-xl font-black text-black uppercase tracking-tight">
              Active Shipped Strategies on 1inch Aqua
            </h4>
            <button
              type="button"
              onClick={loadAquaStrategies}
              title="Refresh Aqua Strategies"
              className="bg-white hover:bg-gray-100 text-black border-2 border-black font-mono text-xs font-bold px-2 py-0.5 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
            >
              🔄 Refresh
            </button>
          </div>
          <span className="font-mono text-xs text-gray-600 font-bold bg-[#FAFAFA] border border-black px-2 py-1">
            Registry: {shortenAddress(AQUA_REGISTRY_ADDRESS)}
          </span>
        </div>

        <div className="overflow-x-auto border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000000]">
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead>
              <tr className="bg-black text-[#FFE600] uppercase font-bold text-[11px] tracking-wider border-b-2 border-black">
                <th className="py-3 px-3 border-r border-gray-800">Strategy Hash</th>
                <th className="py-3 px-3 border-r border-gray-800">Maker (LP)</th>
                <th className="py-3 px-3 border-r border-gray-800">Committed Depth</th>
                <th className="py-3 px-3 border-r border-gray-800">Max Lev</th>
                <th className="py-3 px-3 border-r border-gray-800">Spread</th>
                <th className="py-3 px-3 border-r border-gray-800">Permitted Sides</th>
                <th className="py-3 px-3 border-r border-gray-800">Status</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {shippedQuotes.map((q, idx) => (
                <tr
                  key={`${q.strategyHash}-${idx}`}
                  className={`border-b-2 border-black transition-colors ${
                    q.status === 'docked' ? 'opacity-50 ' : ''
                  }${idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'} hover:bg-[#FFFBEA]`}
                >
                  <td className="py-3 px-3 border-r border-black font-bold text-[#006d32]">
                    {shortenAddress(q.strategyHash, 6)}
                  </td>
                  <td className="py-3 px-3 border-r border-black font-bold text-black">
                    <div className="flex items-center gap-1.5">
                      <span>{shortenAddress(q.maker)}</span>
                      {account && q.maker.toLowerCase() === account.toLowerCase() && (
                        <span className="bg-[#00E5FF] text-black text-[9px] font-bold px-1 border border-black">
                          YOU
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 border-r border-black font-black text-black">
                    <div>{formatUsd(q.currentBalance ?? q.maxNotional)} aUSDC</div>
                    {q.currentBalance !== undefined && q.currentBalance !== q.maxNotional && (
                      <div className="text-[10px] text-gray-500 font-normal">
                        cap: {formatUsd(q.maxNotional)}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 border-r border-black text-gray-800">
                    {q.maxLeverage}x
                  </td>
                  <td className="py-3 px-3 border-r border-black text-gray-800">
                    {q.spreadBps} bps ({(q.spreadBps / 100).toFixed(2)}%)
                  </td>
                  <td className="py-3 px-3 border-r border-black">
                    <span className="font-bold text-[11px] bg-white border border-black px-1.5 py-0.5 shadow-[1px_1px_0px_0px_#000000]">
                      {q.sideMask === 3 ? 'Long & Short' : q.sideMask === 1 ? 'Longs Only' : 'Shorts Only'}
                    </span>
                  </td>
                  <td className="py-3 px-3 border-r border-black">
                    <span
                      className={`font-black text-[10px] px-2 py-0.5 border border-black uppercase ${
                        q.status === 'active'
                          ? 'bg-[#00F076] text-black'
                          : 'bg-[#FF3366] text-white'
                      }`}
                    >
                      {q.status === 'active' ? '🟢 ACTIVE' : 'DOCKED'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    {q.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => handleDockStrategy(q)}
                        disabled={dockingHash === q.strategyHash}
                        className="bg-[#FF3366] hover:bg-[#e62957] text-white font-headline font-black text-xs uppercase px-2.5 py-1 border-2 border-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer transition-colors disabled:opacity-50"
                      >
                        {dockingHash === q.strategyHash ? 'Docking...' : 'Dock / Revoke'}
                      </button>
                    ) : (
                      <span className="text-[11px] font-bold text-gray-400 uppercase">Revoked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

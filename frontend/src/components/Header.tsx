'use client';

import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useWeb3, UserRole } from '../context/Web3Context';
import { useMarket } from '../context/MarketContext';
import {
  shortenAddress,
  DEMO_ROLES,
  A_USDC_ADDRESS,
  AAVE_POOL_ADDRESS,
  USDC_ADDRESS,
  LOCAL_RPC_URL,
  formatUsd,
} from '../config/contracts';

interface HeaderProps {
  activeTab: 'trade' | 'lp' | 'keeper' | 'coverage';
  onTabChange: (tab: 'trade' | 'lp' | 'keeper' | 'coverage') => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange }) => {
  const {
    account,
    role,
    setRole,
    chainId,
    isFork,
    balances,
    appAddress,
    oracleAddress,
    setAppAddress,
    setOracleAddress,
    resetToDefaultAddresses,
    connectBrowserWallet,
    switchOrAddAnvilNetwork,
    refreshBalances,
    aUsdcContract,
    signer,
  } = useWeb3();

  const {
    btcPrice,
    priceChange24h,
    selectedMarket,
    currentMarket,
    isUpdatingPrice,
    setMarketPrice,
    refreshMarketStats,
  } = useMarket();

  // Dev Simulation & Protocol Config States
  const [configTab, setConfigTab] = useState<'oracle' | 'timewarp' | 'contracts'>('oracle');
  const [customTargetPrice, setCustomTargetPrice] = useState<string>('60000');
  const [isWarping, setIsWarping] = useState<boolean>(false);
  const [simulationStatus, setSimulationStatus] = useState<string | null>(null);

  const [roleModalOpen, setRoleModalOpen] = useState<boolean>(false);
  const [configModalOpen, setConfigModalOpen] = useState<boolean>(false);
  const [tempAppAddress, setTempAppAddress] = useState<string>(appAddress);
  const [tempOracleAddress, setTempOracleAddress] = useState<string>(oracleAddress);
  const [isDealingEth, setIsDealingEth] = useState<boolean>(false);
  const [isFauceting, setIsFauceting] = useState<boolean>(false);
  const [cheatcodeStatus, setCheatcodeStatus] = useState<string | null>(null);

  // Quick Anvil Cheatcode: Deal 10 ETH to Active Account
  const handleDealEth = async () => {
    if (!account) return;
    setIsDealingEth(true);
    try {
      if (isFork) {
        const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
        const currentBal = await anvilProv.getBalance(account);
        // Add 10 ETH to current balance
        const newBal = currentBal + ethers.parseEther('10');
        await anvilProv.send('anvil_setBalance', [account, ethers.toBeHex(newBal)]);
        await refreshBalances();
        setCheatcodeStatus('✅ 10 ETH added to your wallet!');
      } else {
        setCheatcodeStatus('Cheatcodes only active on local Anvil fork');
      }
    } catch (e: any) {
      console.warn('Deal ETH failed:', e);
      setCheatcodeStatus('❌ Deal ETH failed');
    } finally {
      setIsDealingEth(false);
      setTimeout(() => setCheatcodeStatus(null), 3000);
    }
  };

  // Public Faucet / Mint 5,000 aUSDC to Active Account
  const handleFaucetAUSDC = async () => {
    if (!account) return;
    setIsFauceting(true);
    try {
      let mintedOnChain = false;

      // 1. First try calling on-chain faucet() on the active aUSDC contract directly
      if (aUsdcContract && signer) {
        try {
          const connectedContract = aUsdcContract.connect(signer) as ethers.Contract;
          const tx = await (connectedContract as any).faucet();
          await tx.wait();
          mintedOnChain = true;
          await refreshBalances();
          setCheatcodeStatus('✅ 5,000 aUSDC minted directly to your wallet!');
        } catch (faucetErr: any) {
          console.log('Direct faucet() call was not handled or reverted, evaluating fork fallback:', faucetErr);
        }
      }

      // 2. Fallback to Anvil fork impersonation if direct faucet is not available
      if (!mintedOnChain) {
        if (isFork) {
          const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          const amount = ethers.parseUnits('5000', 6);
          const GMX_VAULT = '0x489ee077994B6658eAfA855C308275EAd8097C4A';

          await anvilProv.send('anvil_impersonateAccount', [GMX_VAULT]);
          await anvilProv.send('anvil_setBalance', [GMX_VAULT, '0x8AC7230489E80000']);

          const vaultSigner = await anvilProv.getSigner(GMX_VAULT);
          const usdc = new ethers.Contract(
            USDC_ADDRESS,
            ['function approve(address spender, uint256 amount) returns (bool)'],
            vaultSigner
          );
          const aavePool = new ethers.Contract(
            AAVE_POOL_ADDRESS,
            ['function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)'],
            vaultSigner
          );

          const appTx = await usdc.approve(AAVE_POOL_ADDRESS, amount);
          await appTx.wait();

          const supplyTx = await aavePool.supply(USDC_ADDRESS, amount, account, 0);
          await supplyTx.wait();

          await anvilProv.send('anvil_stopImpersonatingAccount', [GMX_VAULT]);

          await refreshBalances();
          setCheatcodeStatus('✅ 5,000 aUSDC minted via Aave v3 supply!');
        } else {
          setCheatcodeStatus('❌ Faucet unavailable for this token on current network');
        }
      }
    } catch (e: any) {
      console.warn('Faucet aUSDC failed:', e);
      setCheatcodeStatus('❌ Faucet failed');
    } finally {
      setIsFauceting(false);
      setTimeout(() => setCheatcodeStatus(null), 3000);
    }
  };

  const handleSaveAddresses = () => {
    setAppAddress(tempAppAddress);
    setOracleAddress(tempOracleAddress);
    setConfigModalOpen(false);
  };

  const handleResetAddresses = () => {
    resetToDefaultAddresses();
    setConfigModalOpen(false);
  };

  // Quick Preset Oracle Price Simulator on Anvil Fork
  const handleQuickPrice = async (targetPrice: number, label: string) => {
    setSimulationStatus(`Updating ${selectedMarket} oracle to ${formatUsd(targetPrice)} (${label})...`);
    const success = await setMarketPrice(targetPrice);
    if (success) {
      setCustomTargetPrice(targetPrice.toString());
      setSimulationStatus(`✅ Oracle updated to ${formatUsd(targetPrice)}!`);
      setTimeout(() => setSimulationStatus(null), 3500);
    } else {
      setSimulationStatus(`❌ Failed to update price`);
      setTimeout(() => setSimulationStatus(null), 3500);
    }
  };

  // Custom Target Oracle Price on Anvil Fork
  const handleCustomPriceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customTargetPrice);
    if (isNaN(val) || val <= 0) {
      setSimulationStatus('❌ Enter a valid positive price');
      return;
    }
    setSimulationStatus(`Updating ${selectedMarket} oracle to ${formatUsd(val)}...`);
    const success = await setMarketPrice(val);
    if (success) {
      setSimulationStatus(`✅ Oracle updated to ${formatUsd(val)}!`);
      setTimeout(() => setSimulationStatus(null), 3500);
    } else {
      setSimulationStatus(`❌ Failed to update price`);
      setTimeout(() => setSimulationStatus(null), 3500);
    }
  };

  // Fast Forward Time (+8 Hours) on Anvil Fork
  const handleFastForwardTime = async () => {
    setIsWarping(true);
    setSimulationStatus('⏩ Fast-forwarding block timestamp by 8 hours (28,800s)...');
    try {
      if (isFork) {
        const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
        await anvilProv.send('evm_increaseTime', [28800]);
        await anvilProv.send('evm_mine', []);
        await refreshMarketStats();
        setSimulationStatus('⏩ Fast-forwarded +8h! Funding intervals now eligible for settlement.');
      } else {
        setSimulationStatus('Time warp is only active on local Anvil fork');
      }
    } catch (err: any) {
      console.error('Time warp error:', err);
      setSimulationStatus(`❌ Time warp failed: ${err.message || err.reason}`);
    } finally {
      setIsWarping(false);
      setTimeout(() => setSimulationStatus(null), 4000);
    }
  };

  const roleList = Object.values(DEMO_ROLES);
  const displayPrice = btcPrice || currentMarket?.basePrice || 75.50;
  const formattedPrice = formatUsd(displayPrice);
  const isPositive = priceChange24h >= 0;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b-2 border-black font-headline">
        <div className="w-full flex flex-col">
          {/* TIER 1: MAIN NAVIGATION BAR */}
          <div className="h-16 w-full border-b-2 border-black bg-white">
            <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
            {/* Left: Brand & Live BTC Ticker */}
            <div className="flex items-center gap-4 md:gap-6">
              {/* Flyte Wordmark */}
              <div
                onClick={() => onTabChange('trade')}
                className="font-headline text-[26px] tracking-tight text-black font-extrabold select-none hover:opacity-80 cursor-pointer flex items-center gap-2"
              >
                <span>FLYTE</span>
              </div>

              {/* Streamlined Market Ticker Pill */}
              <div className="hidden sm:flex items-center border-2 border-black bg-white h-10 shadow-[2px_2px_0px_0px_#000000]">
                <span className="px-3 font-mono text-xs font-bold text-black border-r-2 border-black uppercase tracking-wider h-full flex items-center">
                  {selectedMarket || 'BTC/USD'}
                </span>
                <span className="px-3 font-mono text-xs font-extrabold bg-[#00F076] text-black h-full flex items-center border-r-2 border-black">
                  {formattedPrice}
                </span>
                <span
                  className={`px-3 font-mono text-xs font-bold flex items-center gap-1 h-full ${
                    isPositive ? 'text-[#006d32]' : 'text-[#d9044b]'
                  }`}
                >
                  {isPositive ? `+${priceChange24h.toFixed(2)}%` : `${priceChange24h.toFixed(2)}%`}
                </span>
              </div>
            </div>

            {/* Right: Actions, Cheatcodes & Account Selector */}
            <div className="flex items-center gap-2 md:gap-3">
              {/* Deal 10 ETH Button */}
              <button
                type="button"
                onClick={handleDealEth}
                disabled={isDealingEth}
                className="h-10 bg-[#00F076] hover:bg-[#00d86a] text-black uppercase px-4 border-2 border-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none flex items-center gap-2 font-bold text-xs cursor-pointer select-none tracking-wider"
                title="Deal 10 ETH (native gas) to your wallet on Anvil"
              >
                <span>⛽</span>
                <span className="hidden md:inline">{isDealingEth ? 'DEALING...' : 'DEAL 10 ETH'}</span>
              </button>

              {/* Faucet 5k aUSDC button */}
              <button
                type="button"
                onClick={handleFaucetAUSDC}
                disabled={isFauceting}
                className="h-10 bg-[#FFE600] hover:bg-[#ffe100] text-black uppercase px-4 border-2 border-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none flex items-center gap-2 font-bold text-xs cursor-pointer select-none tracking-wider"
                title="Mint 5,000 aUSDC collateral to your wallet"
              >
                <span>💧</span>
                <span className="hidden md:inline">{isFauceting ? 'MINTING...' : 'FAUCET 5K aUSDC'}</span>
              </button>

              {/* Balances Badge: ETH + aUSDC */}
              <div className="h-10 border-2 border-black bg-white px-3 flex items-center gap-2 shadow-[2px_2px_0px_0px_#000000] font-mono text-xs font-bold">
                <span title="Native ETH Gas Balance">{balances.eth} <strong className="text-black font-extrabold">ETH</strong></span>
                <span className="text-gray-400">|</span>
                <span title="Aave aUSDC Collateral Balance">{balances.aUsdc} <strong className="text-[#006875] font-extrabold">aUSDC</strong></span>
              </div>

              {/* Persona / Account Pill */}
              <button
                type="button"
                onClick={() => setRoleModalOpen(true)}
                className="h-10 border-2 border-black bg-[#EAEAEA] hover:bg-neutral-200 px-4 flex items-center gap-2 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none font-mono text-xs font-bold text-black cursor-pointer select-none tracking-wider"
                title="Click to switch wallet or demo role"
              >
                <span>{role === 'trader' ? '🍔' : role === 'lp' ? '🍇' : role === 'keeper' ? '🤡' : '🦊'}</span>
                <span className="hidden sm:inline">
                  {role === 'browser' ? (account ? shortenAddress(account) : 'Connect Wallet') : DEMO_ROLES[role].name.split(' ')[0]}
                </span>
                <span className="text-[10px] text-gray-500">▼</span>
              </button>

              {/* Settings / Simulation Trigger */}
              <button
                type="button"
                id="btn-settings-modal"
                onClick={() => {
                  setTempAppAddress(appAddress);
                  setTempOracleAddress(oracleAddress);
                  setCustomTargetPrice(Math.round(displayPrice).toString());
                  setConfigModalOpen(true);
                }}
                className="h-10 w-10 bg-white hover:bg-neutral-100 flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer text-base relative"
                title={isFork ? 'Anvil Simulation Suite & Settings' : 'Protocol Settings'}
              >
                <span className="text-black text-[16px]">⚙️</span>
                {isFork && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#FFE600] border border-black rounded-full" title="Fork Simulation Suite Active" />
                )}
              </button>
            </div>
            </div>
          </div>

          {/* TIER 2: SUB-NAVIGATION STRIP */}
          <div className="h-11 w-full bg-[#FAFAFA] border-b-2 border-black">
            <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
            {/* Tabs */}
            <nav className="flex items-center h-full">
              <button
                type="button"
                id="nav-tab-trade"
                onClick={() => onTabChange('trade')}
                className={`h-full flex items-center px-5 md:px-7 uppercase text-xs font-bold border-r-2 border-black cursor-pointer transition-none ${
                  activeTab === 'trade'
                    ? 'bg-[#00E5FF] text-black border-b-2 border-b-[#00E5FF]'
                    : 'text-black hover:bg-neutral-200'
                }`}
              >
                📈 TRADE
              </button>
              <button
                type="button"
                id="nav-tab-lp"
                onClick={() => onTabChange('lp')}
                className={`h-full flex items-center px-5 md:px-7 uppercase text-xs font-bold border-r-2 border-black cursor-pointer transition-none ${
                  activeTab === 'lp'
                    ? 'bg-[#00E5FF] text-black border-b-2 border-b-[#00E5FF]'
                    : 'text-black hover:bg-neutral-200'
                }`}
              >
                💧 LIQUIDITY
              </button>
              <button
                type="button"
                id="nav-tab-keeper"
                onClick={() => onTabChange('keeper')}
                className={`h-full flex items-center px-5 md:px-7 uppercase text-xs font-bold border-r-2 border-black cursor-pointer transition-none ${
                  activeTab === 'keeper'
                    ? 'bg-[#00E5FF] text-black border-b-2 border-b-[#00E5FF]'
                    : 'text-black hover:bg-neutral-200'
                }`}
              >
                🤖 KEEPER
              </button>
              <button
                type="button"
                id="nav-tab-coverage"
                onClick={() => onTabChange('coverage')}
                className={`h-full flex items-center px-5 md:px-7 uppercase text-xs font-bold border-r-2 border-black cursor-pointer transition-none ${
                  activeTab === 'coverage'
                    ? 'bg-[#00E5FF] text-black border-b-2 border-b-[#00E5FF]'
                    : 'text-black hover:bg-neutral-200'
                }`}
              >
                🛡️ COVERAGE
              </button>
            </nav>

            {/* Right Status Tags */}
            <div className="hidden lg:flex items-center gap-4 font-mono text-[11px]">
              <span className="text-gray-600 uppercase">
                SPREAD: <strong className="text-black">10 BPS</strong>
              </span>
              <span className="text-gray-600 uppercase">
                EXECUTION: <strong className="text-[#006d32] font-bold">ATOMIC JIT</strong>
              </span>
              <span className="text-gray-600 uppercase">
                NETWORK: <strong className="text-black">{isFork ? `ANVIL FORK (${chainId || 31337})` : 'ARBITRUM ONE'}</strong>
              </span>
            </div>
            </div>
          </div>

          {/* Cheatcode Toast Notification */}
          {cheatcodeStatus && (
            <div className="bg-[#FFE600] border-b-2 border-black px-4 py-1.5 flex items-center justify-between text-xs font-mono font-bold text-black">
              <span>{cheatcodeStatus}</span>
              <button onClick={() => setCheatcodeStatus(null)} className="cursor-pointer text-black">✕</button>
            </div>
          )}
        </div>
      </header>

      {/* MODAL 1: NEO-BRUTALIST ROLE / PERSONA SELECTOR */}
      {roleModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setRoleModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white border-2 border-black shadow-[6px_6px_0px_0px_#000000] p-6 flex flex-col gap-4 font-headline"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <h3 className="text-base uppercase font-bold text-black flex items-center gap-2">
                <span>👤</span> SELECT DEMO ROLE OR WALLET
              </h3>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="h-8 w-8 border border-black flex items-center justify-center font-bold text-sm bg-neutral-100 hover:bg-neutral-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-700 font-medium leading-relaxed">
              Switch roles to experience Flyte from the perspective of a leveraged perpetual trader, an Aave-earning Aqua LP maker, or an automated keeper.
            </p>

            <div className="flex flex-col gap-2.5">
              {roleList.map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    setRole(r.id as UserRole);
                    setRoleModalOpen(false);
                  }}
                  className={`border-2 border-black p-3.5 flex items-center justify-between cursor-pointer transition-none ${
                    role === r.id
                      ? 'bg-[#00E5FF] shadow-[3px_3px_0px_0px_#000000]'
                      : 'bg-white hover:bg-neutral-100 shadow-[1px_1px_0px_0px_#000000]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{r.id === 'trader' ? '🍔' : r.id === 'lp' ? '🍇' : '🤡'}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-black">{r.name}</span>
                        <span className="bg-black text-white text-[10px] font-mono px-1.5 py-0.5 uppercase font-bold">
                          {r.badge}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 font-mono mt-0.5">{r.description}</p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold text-black">
                    {shortenAddress(r.address)}
                  </span>
                </div>
              ))}

              {/* Browser Wallet Option */}
              <div
                onClick={() => {
                  connectBrowserWallet();
                  setRoleModalOpen(false);
                }}
                className={`border-2 border-black p-3.5 flex items-center justify-between cursor-pointer transition-none ${
                  role === 'browser'
                    ? 'bg-[#00E5FF] shadow-[3px_3px_0px_0px_#000000]'
                    : 'bg-white hover:bg-neutral-100 shadow-[1px_1px_0px_0px_#000000]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🦊</span>
                  <div>
                    <span className="font-bold text-sm text-black">Injected Browser Wallet</span>
                    <p className="text-xs text-gray-600 font-mono mt-0.5">Connect MetaMask, Rabby, or Coinbase Wallet</p>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-black">
                  {account ? shortenAddress(account) : 'Disconnected'}
                </span>
              </div>

              {/* Add / Switch to Anvil Network Button for MetaMask */}
              <button
                type="button"
                onClick={async () => {
                  await switchOrAddAnvilNetwork();
                  setRoleModalOpen(false);
                }}
                className="w-full h-10 border-2 border-black bg-[#FFE600] hover:bg-[#ffe100] text-black font-bold font-mono text-xs uppercase shadow-[2px_2px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none flex items-center justify-center gap-2 cursor-pointer mt-1"
                title="Switch MetaMask to local Anvil network (Chain ID 31337)"
              >
                <span>🦊</span> Switch MetaMask to Anvil (31337)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: NEO-BRUTALIST SIMULATION SUITE & CONTRACT SETTINGS */}
      {configModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setConfigModalOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-white border-2 border-black shadow-[8px_8px_0px_0px_#000000] p-6 flex flex-col gap-4 font-headline select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-black text-[#FFE600] border-2 border-black flex items-center justify-center font-bold text-base shadow-[2px_2px_0px_0px_#000000]">
                  ⚙️
                </div>
                <div>
                  <h3 className="text-base uppercase font-bold text-black flex items-center gap-2">
                    {isFork ? 'DEV SIMULATION SUITE & CONFIG' : 'CONTRACT CONFIGURATION'}
                  </h3>
                  <span className="font-mono text-[10px] text-gray-500 uppercase block">
                    {isFork ? 'Arbitrum One Anvil Fork (Chain ID 31337)' : 'Arbitrum One Mainnet'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                className="h-8 w-8 border-2 border-black flex items-center justify-center font-bold text-sm bg-neutral-100 hover:bg-neutral-200 cursor-pointer shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                ✕
              </button>
            </div>

            {/* Fork Dev Navigation Tabs */}
            {isFork && (
              <div className="flex border-2 border-black bg-neutral-100 font-mono text-xs font-bold shadow-[2px_2px_0px_0px_#000000]">
                <button
                  type="button"
                  id="tab-btn-oracle"
                  onClick={() => setConfigTab('oracle')}
                  className={`flex-1 py-2 text-center uppercase cursor-pointer border-r-2 border-black transition-colors ${
                    configTab === 'oracle' ? 'bg-[#FFE600] text-black font-extrabold' : 'hover:bg-white text-gray-700'
                  }`}
                >
                  ⚡ Price Simulator
                </button>
                <button
                  type="button"
                  id="tab-btn-timewarp"
                  onClick={() => setConfigTab('timewarp')}
                  className={`flex-1 py-2 text-center uppercase cursor-pointer border-r-2 border-black transition-colors ${
                    configTab === 'timewarp' ? 'bg-[#FFE600] text-black font-extrabold' : 'hover:bg-white text-gray-700'
                  }`}
                >
                  ⏩ Time Warp (+8h)
                </button>
                <button
                  type="button"
                  id="tab-btn-contracts"
                  onClick={() => setConfigTab('contracts')}
                  className={`flex-1 py-2 text-center uppercase cursor-pointer transition-colors ${
                    configTab === 'contracts' ? 'bg-[#FFE600] text-black font-extrabold' : 'hover:bg-white text-gray-700'
                  }`}
                >
                  ⚙️ Contracts
                </button>
              </div>
            )}

            {/* TAB 1: ORACLE PRICE SIMULATION */}
            {isFork && configTab === 'oracle' && (
              <div className="flex flex-col gap-4 font-headline">
                <p className="text-xs text-gray-700 font-mono leading-relaxed">
                  Directly manipulate the mock oracle price on your local Anvil fork. Observe dynamic PnL swings, SwapVM funding adjustments, and trigger keeper liquidations.
                </p>

                {/* Spot Price Display */}
                <div className="bg-[#FAFAFA] border-2 border-black p-3 text-center shadow-[2px_2px_0px_0px_#000000]">
                  <span className="font-mono text-[10px] text-gray-500 uppercase font-bold tracking-wider block mb-0.5">
                    Current Spot Oracle Price ({selectedMarket})
                  </span>
                  <div className="font-mono text-2xl font-black text-black">
                    {formattedPrice}
                  </div>
                </div>

                {/* Quick Presets */}
                <div>
                  <span className="block font-mono text-xs font-bold text-black uppercase mb-1.5">
                    Quick Simulation Actions
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleQuickPrice(Math.round(btcPrice * 1.10), '+10% Pump')}
                      disabled={isUpdatingPrice}
                      className="bg-[#00F076] hover:bg-[#00d669] text-black border-2 border-black font-mono font-bold text-xs uppercase p-2.5 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <span>🚀</span> +10% Pump (${Math.round((btcPrice * 1.10) / 1000)}k)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickPrice(Math.round(btcPrice * 1.05), '+5% Bump')}
                      disabled={isUpdatingPrice}
                      className="bg-[#00E5FF] hover:bg-[#00cbe2] text-black border-2 border-black font-mono font-bold text-xs uppercase p-2.5 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <span>📈</span> +5% Bump (${Math.round((btcPrice * 1.05) / 1000)}k)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickPrice(Math.round(btcPrice * 0.95), '-5% Dip')}
                      disabled={isUpdatingPrice}
                      className="bg-[#FFE600] hover:bg-[#ffe100] text-black border-2 border-black font-mono font-bold text-xs uppercase p-2.5 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <span>📉</span> -5% Dip (${Math.round((btcPrice * 0.95) / 1000)}k)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickPrice(Math.round(btcPrice * 0.90), '-10% Liquidate')}
                      disabled={isUpdatingPrice}
                      className="bg-[#FF3366] hover:bg-[#e62957] text-white border-2 border-black font-mono font-bold text-xs uppercase p-2.5 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <span>🩸</span> -10% Liquidate (${Math.round((btcPrice * 0.90) / 1000)}k)
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickPrice(60000, 'Baseline Reset')}
                    disabled={isUpdatingPrice}
                    className="w-full mt-2 bg-white hover:bg-neutral-100 text-black border-2 border-black font-mono font-bold text-xs uppercase p-2 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <span>🔄</span> Reset Baseline ($60,000)
                  </button>
                </div>

                {/* Custom Target Price */}
                <form onSubmit={handleCustomPriceSubmit} className="pt-2 border-t-2 border-neutral-200">
                  <label className="block font-mono text-xs font-bold text-black uppercase mb-1">
                    Set Custom Target Price
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-gray-500">$</span>
                      <input
                        type="number"
                        step="0.1"
                        min="1"
                        max="500000"
                        value={customTargetPrice}
                        onChange={(e) => setCustomTargetPrice(e.target.value)}
                        className="w-full bg-[#FAFAFA] border-2 border-black p-2 pl-7 font-mono text-xs font-bold text-black focus:outline-none focus:bg-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isUpdatingPrice}
                      className="bg-black text-[#FFE600] hover:bg-gray-900 border-2 border-black font-headline font-black text-xs uppercase px-4 py-2 shadow-[2px_2px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer disabled:opacity-50"
                    >
                      {isUpdatingPrice ? 'Updating...' : 'Set Price'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB 2: ANVIL TIME WARP */}
            {isFork && configTab === 'timewarp' && (
              <div className="flex flex-col gap-4 font-headline">
                <div className="bg-[#FFE600]/20 border-2 border-black p-4 shadow-[2px_2px_0px_0px_#000000]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">⏩</span>
                    <span className="font-bold text-sm uppercase text-black">Anvil Block Timestamp Warp</span>
                  </div>
                  <p className="font-mono text-xs text-gray-800 leading-relaxed">
                    Fast-forward the local Anvil fork timestamp by 8 hours (28,800 seconds) and immediately mine a new block. This advances the clock past the 8h funding rate interval so SwapVM 0x75 funding settlements can be executed by keepers.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleFastForwardTime}
                  disabled={isWarping}
                  id="btn-modal-timewarp"
                  className="w-full h-12 bg-black text-[#FFE600] hover:bg-neutral-900 border-2 border-black font-headline font-black text-xs uppercase shadow-[3px_3px_0px_0px_#000000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 tracking-wider"
                >
                  <span>⏩</span>
                  <span>{isWarping ? 'Warping Timestamp...' : 'Fast-Forward Time (+8 Hours)'}</span>
                </button>
              </div>
            )}

            {/* TAB 3 (or only tab on mainnet): CONTRACT ADDRESSES */}
            {(!isFork || configTab === 'contracts') && (
              <div className="flex flex-col gap-4 font-headline">
                <p className="text-xs text-gray-700 font-medium font-mono">
                  Configure deployed contract addresses on your local Anvil fork or Arbitrum One.
                </p>

                <div className="flex flex-col gap-3 font-mono text-xs">
                  <div>
                    <label className="block text-black font-bold uppercase mb-1">
                      PerpAquaApp Address:
                    </label>
                    <input
                      type="text"
                      value={tempAppAddress}
                      onChange={(e) => setTempAppAddress(e.target.value)}
                      className="w-full border-2 border-black p-2.5 bg-white font-mono text-xs text-black shadow-[2px_2px_0px_0px_#000000] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-black font-bold uppercase mb-1">
                      MockPriceOracle Address:
                    </label>
                    <input
                      type="text"
                      value={tempOracleAddress}
                      onChange={(e) => setTempOracleAddress(e.target.value)}
                      className="w-full border-2 border-black p-2.5 bg-white font-mono text-xs text-black shadow-[2px_2px_0px_0px_#000000] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t-2 border-black mt-2">
                  <button
                    type="button"
                    onClick={handleResetAddresses}
                    className="px-4 py-2 border-2 border-black bg-white hover:bg-neutral-100 font-bold uppercase text-xs shadow-[2px_2px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer"
                  >
                    Reset Defaults
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfigModalOpen(false)}
                      className="px-4 py-2 border-2 border-black bg-neutral-100 hover:bg-neutral-200 font-bold uppercase text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAddresses}
                      className="px-4 py-2 border-2 border-black bg-[#00E5FF] hover:bg-[#00daf3] font-bold uppercase text-xs shadow-[2px_2px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer"
                    >
                      Save Addresses
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Simulation Status Feedback Toast */}
            {simulationStatus && (
              <div className="p-2.5 border-2 border-black bg-[#00E5FF] text-black font-mono text-xs font-bold text-center shadow-[2px_2px_0px_0px_#000000]">
                {simulationStatus}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

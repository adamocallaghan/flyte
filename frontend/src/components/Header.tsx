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
  } = useWeb3();

  const { btcPrice, priceChange24h } = useMarket();

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

  // Quick Anvil Cheatcode: Direct Mint 5k aUSDC to Active Account via Aave v3 supply
  const handleFaucetAUSDC = async () => {
    if (!account) return;
    setIsFauceting(true);
    try {
      if (isFork) {
        const anvilProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
        const amount = ethers.parseUnits('5000', 6);
        const GMX_VAULT = '0x489ee077994B6658eAfA855C308275EAd8097C4A';

        // 1. Impersonate high-liquidity USDC vault on Arbitrum fork
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

        // 2. Approve Aave Pool and supply USDC on behalf of the active account
        const appTx = await usdc.approve(AAVE_POOL_ADDRESS, amount);
        await appTx.wait();

        const supplyTx = await aavePool.supply(USDC_ADDRESS, amount, account, 0);
        await supplyTx.wait();

        await anvilProv.send('anvil_stopImpersonatingAccount', [GMX_VAULT]);

        await refreshBalances();
        setCheatcodeStatus('✅ 5,000 aUSDC minted directly to your wallet!');
      } else {
        setCheatcodeStatus('Cheatcodes only active on local Anvil fork');
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

  const roleList = Object.values(DEMO_ROLES);
  const formattedPrice = formatUsd(btcPrice);
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
                <span className="bg-black text-[#00E5FF] px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-widest uppercase">
                  AQUA
                </span>
              </div>

              {/* Streamlined BTC/USD Ticker Pill */}
              <div className="hidden sm:flex items-center border-2 border-black bg-white h-10 shadow-[2px_2px_0px_0px_#000000]">
                <span className="px-3 font-mono text-xs font-bold text-black border-r-2 border-black uppercase tracking-wider">
                  BTC/USD
                </span>
                <span className="px-3 font-mono text-xs font-extrabold bg-[#00F076] text-black h-full flex items-center border-r-2 border-black">
                  {formattedPrice}
                </span>
                <span
                  className={`px-3 font-mono text-xs font-bold flex items-center gap-1 ${
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

              {/* Settings Trigger */}
              <button
                type="button"
                onClick={() => {
                  setTempAppAddress(appAddress);
                  setTempOracleAddress(oracleAddress);
                  setConfigModalOpen(true);
                }}
                className="h-10 w-10 bg-white hover:bg-neutral-100 flex items-center justify-center border-2 border-black shadow-[2px_2px_0px_0px_#000000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none cursor-pointer text-base"
                title="Configure Deployed Contract Addresses"
              >
                <span className="text-black text-[16px]">⚙️</span>
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
                📈 Trade BTC Perp
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
                💧 1inch Aqua LP Vault
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
                🤖 Keeper Console
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
                🛡️ Shared Coverage
              </button>
            </nav>

            {/* Right Status Tags */}
            <div className="hidden lg:flex items-center gap-4 font-mono text-[11px]">
              <span className="text-gray-600 uppercase">
                SPREAD: <strong className="text-black">10 BPS</strong>
              </span>
              <span className="text-gray-600 uppercase">
                SWAPVM: <strong className="text-[#006d32] font-bold">OPCODES 0x74/0x75</strong>
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

      {/* MODAL 2: NEO-BRUTALIST CONTRACT SETTINGS */}
      {configModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setConfigModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white border-2 border-black shadow-[6px_6px_0px_0px_#000000] p-6 flex flex-col gap-4 font-headline"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b-2 border-black">
              <h3 className="text-base uppercase font-bold text-black flex items-center gap-2">
                <span>⚙️</span> CONTRACT CONFIGURATION
              </h3>
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                className="h-8 w-8 border border-black flex items-center justify-center font-bold text-sm bg-neutral-100 hover:bg-neutral-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-700 font-medium">
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
        </div>
      )}
    </>
  );
};

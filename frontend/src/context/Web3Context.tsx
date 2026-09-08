'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import {
  ARBITRUM_ONE_CHAIN_ID,
  ANVIL_CHAIN_ID,
  LOCAL_RPC_URL,
  ARBITRUM_RPC_URL,
  AQUA_REGISTRY_ADDRESS,
  AAVE_POOL_ADDRESS,
  USDC_ADDRESS,
  A_USDC_ADDRESS,
  DEFAULT_PERP_APP_ADDRESS,
  DEFAULT_ORACLE_ADDRESS,
  DEMO_ROLES,
  DemoRoleConfig,
  PERP_AQUA_APP_ABI,
  MOCK_PRICE_ORACLE_ABI,
  AQUA_ABI,
  ERC20_ABI,
} from '../config/contracts';

export type UserRole = 'trader' | 'lp' | 'keeper' | 'browser';

export interface WalletBalances {
  eth: string;
  usdc: string;
  aUsdc: string;
  rawEth: bigint;
  rawUsdc: bigint;
  rawAUsdc: bigint;
  usdcAllowanceAqua: bigint;
  aUsdcAllowanceAqua: bigint;
  aUsdcAllowanceApp: bigint;
}

const DEFAULT_BALANCES: WalletBalances = {
  eth: '0.00',
  usdc: '0.00',
  aUsdc: '0.00',
  rawEth: BigInt(0),
  rawUsdc: BigInt(0),
  rawAUsdc: BigInt(0),
  usdcAllowanceAqua: BigInt(0),
  aUsdcAllowanceAqua: BigInt(0),
  aUsdcAllowanceApp: BigInt(0),
};

export interface Web3ContextType {
  account: string | null;
  role: UserRole;
  roleConfig: DemoRoleConfig | null;
  setRole: (role: UserRole) => void;
  provider: ethers.Provider | null;
  signer: ethers.Signer | null;
  chainId: number | null;
  blockNumber: number;
  isFork: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;

  // Balances
  balances: WalletBalances;
  refreshBalances: () => Promise<void>;

  // Contract Addresses & setters
  appAddress: string;
  oracleAddress: string;
  setAppAddress: (addr: string) => void;
  setOracleAddress: (addr: string) => void;
  resetToDefaultAddresses: () => void;

  // Contract instances
  appContract: ethers.Contract | null;
  aquaContract: ethers.Contract | null;
  oracleContract: ethers.Contract | null;
  usdcContract: ethers.Contract | null;
  aUsdcContract: ethers.Contract | null;

  // Actions
  connectBrowserWallet: () => Promise<void>;
  switchOrAddAnvilNetwork: (targetChainId?: number) => Promise<void>;
}

const Web3Context = createContext<Web3ContextType | null>(null);

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<UserRole>('trader');
  const [account, setAccount] = useState<string | null>(DEMO_ROLES.trader.address);
  const [provider, setProvider] = useState<ethers.Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [blockNumber, setBlockNumber] = useState<number>(0);
  const [isFork, setIsFork] = useState<boolean>(true);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Addresses
  const [appAddress, setAppAddressState] = useState<string>(DEFAULT_PERP_APP_ADDRESS);
  const [oracleAddress, setOracleAddressState] = useState<string>(DEFAULT_ORACLE_ADDRESS);

  // Balances
  const [balances, setBalances] = useState<WalletBalances>(DEFAULT_BALANCES);

  // Load custom addresses from localStorage if available (ignoring stale placeholders)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedApp = localStorage.getItem('flyte_app_address');
      const storedOracle = localStorage.getItem('flyte_oracle_address');
      if (storedApp && ethers.isAddress(storedApp) && storedApp !== '0x5FbDB2315678afecb367f032d93F642f64180aa3') {
        setAppAddressState(storedApp);
      } else {
        localStorage.removeItem('flyte_app_address');
        setAppAddressState(DEFAULT_PERP_APP_ADDRESS);
      }
      if (storedOracle && ethers.isAddress(storedOracle) && storedOracle !== '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512') {
        setOracleAddressState(storedOracle);
      } else {
        localStorage.removeItem('flyte_oracle_address');
        setOracleAddressState(DEFAULT_ORACLE_ADDRESS);
      }
    }
  }, []);

  const setAppAddress = useCallback((addr: string) => {
    setAppAddressState(addr);
    if (typeof window !== 'undefined' && ethers.isAddress(addr)) {
      localStorage.setItem('flyte_app_address', addr);
    }
  }, []);

  const setOracleAddress = useCallback((addr: string) => {
    setOracleAddressState(addr);
    if (typeof window !== 'undefined' && ethers.isAddress(addr)) {
      localStorage.setItem('flyte_oracle_address', addr);
    }
  }, []);

  const resetToDefaultAddresses = useCallback(() => {
    setAppAddressState(DEFAULT_PERP_APP_ADDRESS);
    setOracleAddressState(DEFAULT_ORACLE_ADDRESS);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('flyte_app_address');
      localStorage.removeItem('flyte_oracle_address');
    }
  }, []);

  // Initialize Provider and Signer based on selected role
  useEffect(() => {
    let isCancelled = false;

    async function initWeb3() {
      setIsConnecting(true);
      setError(null);

      try {
        if (role === 'browser') {
          // Browser Wallet (MetaMask, Rabby, etc.)
          if (typeof window === 'undefined' || !(window as any).ethereum) {
            throw new Error('No injected web3 wallet found in browser');
          }
          const browserProv = new ethers.BrowserProvider((window as any).ethereum);
          const network = await browserProv.getNetwork();
          const signerObj = await browserProv.getSigner();
          const addr = await signerObj.getAddress();
          const block = await browserProv.getBlockNumber();

          if (!isCancelled) {
            setProvider(browserProv);
            setSigner(signerObj);
            setAccount(addr);
            setChainId(Number(network.chainId));
            setBlockNumber(block);
            setIsFork(Number(network.chainId) === ANVIL_CHAIN_ID || Number(network.chainId) === ARBITRUM_ONE_CHAIN_ID);
          }
        } else {
          // Demo Roles on Local Anvil Fork
          const jsonRpcProv = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
          let currentChainId = ANVIL_CHAIN_ID;
          let currentBlock = 0;

          try {
            const network = await jsonRpcProv.getNetwork();
            currentChainId = Number(network.chainId);
            currentBlock = await jsonRpcProv.getBlockNumber();
          } catch {
            // Anvil might not be running yet, fallback gracefully
            currentChainId = ANVIL_CHAIN_ID;
          }

          const roleConf = DEMO_ROLES[role];
          const demoWallet = new ethers.Wallet(roleConf.privateKey, jsonRpcProv);

          if (!isCancelled) {
            setProvider(jsonRpcProv);
            setSigner(demoWallet);
            setAccount(roleConf.address);
            setChainId(currentChainId);
            setBlockNumber(currentBlock);
            setIsFork(true);
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(err.message || 'Failed to initialize Web3');
        }
      } finally {
        if (!isCancelled) {
          setIsConnecting(false);
        }
      }
    }

    initWeb3();

    return () => {
      isCancelled = true;
    };
  }, [role]);

  // Create Contract Instances
  const contracts = useMemo(() => {
    if (!provider) {
      return { app: null, aqua: null, oracle: null, usdc: null, aUsdc: null };
    }

    const runner = signer || provider;

    const app = ethers.isAddress(appAddress)
      ? new ethers.Contract(appAddress, PERP_AQUA_APP_ABI, runner)
      : null;

    const oracle = ethers.isAddress(oracleAddress)
      ? new ethers.Contract(oracleAddress, MOCK_PRICE_ORACLE_ABI, runner)
      : null;

    const aqua = new ethers.Contract(AQUA_REGISTRY_ADDRESS, AQUA_ABI, runner);
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, runner);
    const aUsdc = new ethers.Contract(A_USDC_ADDRESS, ERC20_ABI, runner);

    return { app, aqua, oracle, usdc, aUsdc };
  }, [provider, signer, appAddress, oracleAddress]);

  // Refresh Balances Callback
  const refreshBalances = useCallback(async () => {
    if (!account || !provider || !contracts.usdc || !contracts.aUsdc) return;

    try {
      const [rawEth, rawUsdc, rawAUsdc] = await Promise.all([
        provider.getBalance(account).catch(() => BigInt(0)),
        contracts.usdc.balanceOf(account).catch(() => BigInt(0)),
        contracts.aUsdc.balanceOf(account).catch(() => BigInt(0)),
      ]);

      let usdcAllowanceAqua = BigInt(0);
      let aUsdcAllowanceAqua = BigInt(0);
      let aUsdcAllowanceApp = BigInt(0);

      try {
        usdcAllowanceAqua = await contracts.usdc.allowance(account, AQUA_REGISTRY_ADDRESS);
      } catch {}
      try {
        aUsdcAllowanceAqua = await contracts.aUsdc.allowance(account, AQUA_REGISTRY_ADDRESS);
      } catch {}
      if (contracts.app && ethers.isAddress(appAddress)) {
        try {
          aUsdcAllowanceApp = await contracts.aUsdc.allowance(account, appAddress);
        } catch {}
      }

      setBalances({
        eth: parseFloat(ethers.formatEther(rawEth)).toFixed(4),
        usdc: parseFloat(ethers.formatUnits(rawUsdc, 6)).toFixed(2),
        aUsdc: parseFloat(ethers.formatUnits(rawAUsdc, 6)).toFixed(2),
        rawEth,
        rawUsdc,
        rawAUsdc,
        usdcAllowanceAqua,
        aUsdcAllowanceAqua,
        aUsdcAllowanceApp,
      });
    } catch (e) {
      console.warn('Could not fetch balances:', e);
    }
  }, [account, provider, contracts, appAddress]);

  // Poll block number and balances every 5 seconds
  useEffect(() => {
    if (!provider || !account) return;

    refreshBalances();

    const interval = setInterval(async () => {
      try {
        const block = await provider.getBlockNumber();
        setBlockNumber(block);
        refreshBalances();
      } catch {}
    }, 5000);

    return () => clearInterval(interval);
  }, [provider, account, refreshBalances]);

  // Switch Role
  const setRole = useCallback((newRole: UserRole) => {
    setRoleState(newRole);
  }, []);

  // Connect Browser Wallet
  // Connect Browser Wallet
  const connectBrowserWallet = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      alert('No browser wallet detected! Please install MetaMask or Rabby.');
      return;
    }
    try {
      await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      setRoleState('browser');
    } catch (e: any) {
      console.error('Wallet connection failed:', e);
      setError(e.message || 'Failed to connect wallet');
    }
  }, []);

  // Switch or Add Anvil Local Network to MetaMask / Browser Wallet
  const switchOrAddAnvilNetwork = useCallback(async (targetChainId: number = ANVIL_CHAIN_ID) => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      alert('No browser wallet detected! Please install MetaMask or Rabby.');
      return;
    }
    const hexChainId = '0x' + targetChainId.toString(16);
    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902 || switchError.data?.originalError?.code === 4902) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: hexChainId,
                chainName: 'Anvil (Flyte Local)',
                rpcUrls: [LOCAL_RPC_URL],
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              },
            ],
          });
        } catch (addError: any) {
          console.error('Failed to add Anvil network to wallet:', addError);
        }
      } else {
        console.warn('Network switch failed:', switchError);
      }
    }
  }, []);

  const roleConfig = role !== 'browser' ? DEMO_ROLES[role] : null;

  const value = useMemo<Web3ContextType>(
    () => ({
      account,
      role,
      roleConfig,
      setRole,
      provider,
      signer,
      chainId,
      blockNumber,
      isFork,
      isConnected: !!account,
      isConnecting,
      error,
      balances,
      refreshBalances,
      appAddress,
      oracleAddress,
      setAppAddress,
      setOracleAddress,
      resetToDefaultAddresses,
      appContract: contracts.app,
      aquaContract: contracts.aqua,
      oracleContract: contracts.oracle,
      usdcContract: contracts.usdc,
      aUsdcContract: contracts.aUsdc,
      connectBrowserWallet,
      switchOrAddAnvilNetwork,
    }),
    [
      account,
      role,
      roleConfig,
      setRole,
      provider,
      signer,
      chainId,
      blockNumber,
      isFork,
      isConnecting,
      error,
      balances,
      refreshBalances,
      appAddress,
      oracleAddress,
      setAppAddress,
      setOracleAddress,
      resetToDefaultAddresses,
      contracts,
      connectBrowserWallet,
      switchOrAddAnvilNetwork,
    ]
  );

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3(): Web3ContextType {
  const ctx = useContext(Web3Context);
  if (!ctx) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return ctx;
}

import { ethers } from 'ethers';
import { PERP_AQUA_APP_ABI, MOCK_PRICE_ORACLE_ABI, ATTENTION_ORACLE_ABI, AQUA_ABI, ERC20_ABI, MOCK_AAVE_YIELD_TOKEN_ABI } from './abis';

// Arbitrum One Verified Addresses
export const ARBITRUM_ONE_CHAIN_ID = 42161;
export const ANVIL_CHAIN_ID = 31337;
export const LOCAL_RPC_URL = process.env.NEXT_PUBLIC_LOCAL_RPC || 'http://127.0.0.1:8545';
export const ARBITRUM_RPC_URL = process.env.NEXT_PUBLIC_ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc';

export const AQUA_REGISTRY_ADDRESS = '0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a';
export const AAVE_POOL_ADDRESS = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
export const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
// Live Arbitrum One MockAaveYieldToken (aUSDC) with continuous rebasing yield and faucet
export const A_USDC_ADDRESS = process.env.NEXT_PUBLIC_A_USDC_ADDRESS || '0x20C0Ba2e4e87e15eFD383acc7C10e422d9c4D409';
export const WETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

// Default / Configurable Contract Addresses (Arbitrum One Mainnet)
// Can be overridden in UI settings or via process.env
export const DEFAULT_PERP_APP_ADDRESS = process.env.NEXT_PUBLIC_PERP_APP_ADDRESS || '0x952745CFF543A7c2A03A072C6d60C67ad91767Ca';
export const DEFAULT_ORACLE_ADDRESS = process.env.NEXT_PUBLIC_ATTENTION_ORACLE_ADDRESS || process.env.NEXT_PUBLIC_ORACLE_ADDRESS || '0x5bE054244618317f503CF1E1Ee268CEa21b1B424';
export const DEFAULT_ROUTER_ADDRESS = process.env.NEXT_PUBLIC_SWAP_VM_ROUTER_ADDRESS || process.env.NEXT_PUBLIC_ROUTER_ADDRESS || '0xb27c3FB38264902e1f00C196E6904896042796B6';

export interface DemoRoleConfig {
  id: 'trader' | 'lp' | 'keeper';
  name: string;
  badge: string;
  address: string;
  privateKey: string;
  description: string;
}

export const DEMO_ROLES: Record<'trader' | 'lp' | 'keeper', DemoRoleConfig> = {
  trader: {
    id: 'trader',
    name: 'Trader (Hamburglar)',
    badge: 'Trader',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    description: 'Opens and manages leveraged perpetual futures positions with aUSDC collateral',
  },
  lp: {
    id: 'lp',
    name: 'LP Maker (Grimace)',
    badge: 'LP Maker',
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    description: 'Ships JIT liquidity quotes on Aqua while earning native Aave v3 yield',
  },
  keeper: {
    id: 'keeper',
    name: 'Keeper (Ronald)',
    badge: 'Keeper',
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    description: 'Settles funding intervals and executes liquidations for a 1% reward',
  },
};

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return address.substring(0, chars + 2) + '...' + address.substring(address.length - chars);
}

export function formatUsd(amount: number | string | bigint, decimals = 2): string {
  const val = typeof amount === 'bigint' ? Number(ethers.formatUnits(amount, 18)) : Number(amount);
  if (isNaN(val)) return '.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

export function formatToken(amount: bigint | string | number, decimals = 6, displayDecimals = 2): string {
  try {
    const raw = typeof amount === 'bigint' ? amount : BigInt(amount);
    const formatted = parseFloat(ethers.formatUnits(raw, decimals));
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: displayDecimals,
      maximumFractionDigits: displayDecimals,
    }).format(formatted);
  } catch {
    return '0.00';
  }
}

export { PERP_AQUA_APP_ABI, MOCK_PRICE_ORACLE_ABI, ATTENTION_ORACLE_ABI, AQUA_ABI, ERC20_ABI, MOCK_AAVE_YIELD_TOKEN_ABI };

// Flyte PerpAquaApp Deployment Block on Arbitrum One Mainnet
export const FLYTE_DEPLOYMENT_BLOCK = 504090000;

/**
 * Safely queries event logs in chunks of up to 50,000 blocks to prevent
 * RPC block-range limit failures on Arbitrum One or other public RPCs.
 */
export async function queryFilterInChunks(
  contract: ethers.Contract,
  filter: any,
  fromBlock: number,
  toBlock: number,
  chunkSize = 50000
): Promise<any[]> {
  if (toBlock < fromBlock) return [];
  // Safety cap: never scan more than 500,000 blocks to prevent memory exhaustion or thousands of promises
  const safeFrom = Math.max(fromBlock, toBlock - 500000);
  if (toBlock - safeFrom <= chunkSize) {
    return await contract.queryFilter(filter, safeFrom, toBlock).catch(() => []);
  }

  const promises: Promise<any[]>[] = [];
  for (let b = safeFrom; b <= toBlock; b += chunkSize) {
    const end = Math.min(b + chunkSize - 1, toBlock);
    promises.push(contract.queryFilter(filter, b, end).catch(() => []));
  }

  const results = await Promise.all(promises);
  return results.flat();
}

/**
 * Get starting block for event scanning based on chain ID and deployment block.
 */
export function getEventStartBlock(currentBlock: number, chainId: number | null): number {
  // If currentBlock is on Arbitrum One (> 1,000,000) or chainId is Arbitrum One, use deployment block
  if (currentBlock > 1000000 || chainId === ARBITRUM_ONE_CHAIN_ID || (chainId !== ANVIL_CHAIN_ID && chainId !== null)) {
    return Math.max(FLYTE_DEPLOYMENT_BLOCK, currentBlock - 300000);
  }
  return 0;
}

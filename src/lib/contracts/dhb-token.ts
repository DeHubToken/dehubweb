/**
 * DHB Token Configuration
 * =======================
 * DeHub token configuration for Base and BNB Chain.
 */

import type { ChainId } from '@/components/app/ChainSelector';
import { supabase } from '@/integrations/supabase/client';

// Chain IDs
export const BASE_CHAIN_ID = 8453;
export const BNB_CHAIN_ID = 56;
export const ETH_CHAIN_ID = 1;

// Chain-specific configurations
export interface ChainConfig {
  chainId: ChainId;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  dhbToken: string;
  streamCollection: string;
  streamController: string;
}

export const CHAIN_CONFIGS: Record<ChainId, ChainConfig> = {
  [BASE_CHAIN_ID]: {
    chainId: BASE_CHAIN_ID,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    dhbToken: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c',
    streamCollection: '0x9f8012074d27F8596C0E5038477ACB52057BC934',
    streamController: '0x4fa30dAef50c6dc8593470750F3c721CA3275581',
  },
  [BNB_CHAIN_ID]: {
    chainId: BNB_CHAIN_ID,
    name: 'BNB',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    explorerUrl: 'https://bscscan.com',
    dhbToken: '0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7', // DHB on BNB
    streamCollection: '0x1065F5922a336C75623B55D22c4a0C760efCe947',
    streamController: '0x9f8012074d27F8596C0E5038477ACB52057BC934', // Uses same as collection on BNB
  },
  [ETH_CHAIN_ID]: {
    chainId: ETH_CHAIN_ID,
    name: 'Ethereum',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    dhbToken: '', // No DHB on Ethereum mainnet
    streamCollection: '',
    streamController: '',
  },
};

// Alchemy RPC initialization
let rpcInitialized = false;
const RPC_SESSION_KEY = 'dehub_rpc_endpoints';

/**
 * Fetch Alchemy RPC endpoints and update CHAIN_CONFIGS.
 * Caches in sessionStorage so only one edge function call per browser session.
 */
export async function initChainRpcUrls(): Promise<void> {
  if (rpcInitialized) return;
  try {
    // Check sessionStorage first
    const cached = sessionStorage.getItem(RPC_SESSION_KEY);
    let data: { base?: string; bsc?: string } | null = null;

    if (cached) {
      data = JSON.parse(cached);
    } else {
      const res = await supabase.functions.invoke('get-rpc-endpoints');
      if (res.error) throw res.error;
      data = res.data;
      if (data) {
        try { sessionStorage.setItem(RPC_SESSION_KEY, JSON.stringify(data)); } catch {}
      }
    }

    if (data?.base) {
      CHAIN_CONFIGS[BASE_CHAIN_ID].rpcUrl = data.base;
      console.log('[RPC] Using Alchemy for Base');
    }
    if (data?.bsc) {
      CHAIN_CONFIGS[BNB_CHAIN_ID].rpcUrl = data.bsc;
      console.log('[RPC] Using Alchemy for BNB');
    }
    rpcInitialized = true;
  } catch (err) {
    console.warn('[RPC] Failed to fetch Alchemy endpoints, using public fallback:', err);
  }
}

/**
 * Get chain configuration by chain ID
 */
export function getChainConfig(chainId: ChainId): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return config;
}

// DHB Token on Base Mainnet (default for backward compatibility)
export const DHB_TOKEN = {
  value: 'dhb',
  label: 'DHB',
  symbol: 'DHB',
  customAbbreviation: 'dhb',
  chainId: BASE_CHAIN_ID,
  address: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c',
  iconUrl: '/icons/DHB.png',
  mintBlockNumber: 16428469,
  decimals: 18,
  isSubscriptionSupported: true,
} as const;

// ERC20 ABI for token approval and balance checks
export const ERC20_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Convert a human-readable amount to wei (smallest unit)
 */
export function toWei(amount: number | string, decimals: number = 18): bigint {
  const amountStr = typeof amount === 'number' ? amount.toString() : amount;
  const [whole, fraction = ''] = amountStr.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFraction);
}

/**
 * Convert wei to human-readable amount
 */
export function fromWei(wei: bigint, decimals: number = 18): string {
  const weiStr = wei.toString().padStart(decimals + 1, '0');
  const whole = weiStr.slice(0, -decimals) || '0';
  const fraction = weiStr.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

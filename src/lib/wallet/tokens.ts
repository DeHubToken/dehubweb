/**
 * Wallet Token Management
 * =======================
 * Handles token metadata, balances, custom token imports, and native balances.
 */

import { Interface, formatUnits } from 'ethers';
import { readContract } from '@/lib/contracts/aa-utils';
import { CHAIN_CONFIGS, BASE_CHAIN_ID, BNB_CHAIN_ID, ETH_CHAIN_ID, initChainRpcUrls } from '@/lib/contracts/dhb-token';
import type { ChainId } from '@/components/app/ChainSelector';

export interface WalletToken {
  address: string; // '0x0' for native token
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  formattedBalance: string;
  logo?: string;
  isNative?: boolean;
  isCustom?: boolean;
  chainId: ChainId;
}

// Well-known tokens per chain
export const DEFAULT_TOKENS: Record<number, { address: string; symbol: string; name: string; decimals: number; logo?: string }[]> = {
  [BASE_CHAIN_ID]: [
    { address: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c', symbol: 'DHB', name: 'DeHub', decimals: 18 },
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  ],
  [BNB_CHAIN_ID]: [
    { address: '0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7', symbol: 'DHB', name: 'DeHub', decimals: 18 },
    { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether', decimals: 18 },
    { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', name: 'USD Coin', decimals: 18 },
    { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB', name: 'Wrapped BNB', decimals: 18 },
  ],
  [ETH_CHAIN_ID]: [
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether', decimals: 6 },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  ],
};

const NATIVE_TOKEN: Record<number, { symbol: string; name: string; decimals: number }> = {
  [BASE_CHAIN_ID]: { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  [BNB_CHAIN_ID]: { symbol: 'BNB', name: 'BNB', decimals: 18 },
  1: { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
};

const CUSTOM_TOKENS_KEY = 'dehub_custom_tokens';

// ERC20 metadata ABI
const erc20MetadataInterface = new Interface([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
]);

/**
 * Get native token balance via public RPC
 */
export async function getNativeBalance(address: string, chainId: ChainId = BASE_CHAIN_ID): Promise<bigint> {
  await initChainRpcUrls();
  const config = CHAIN_CONFIGS[chainId];
  if (!config) return BigInt(0);

  const res = await fetch(config.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_getBalance',
      params: [address, 'latest'],
    }),
  });
  const json = await res.json();
  return json.result ? BigInt(json.result) : BigInt(0);
}

/**
 * Fetch ERC20 balance
 */
export async function getERC20TokenBalance(tokenAddress: string, ownerAddress: string, chainId?: ChainId): Promise<bigint> {
  try {
    return await readContract<bigint>(tokenAddress, erc20MetadataInterface, 'balanceOf', [ownerAddress], chainId);
  } catch {
    return BigInt(0);
  }
}

/**
 * Fetch ERC20 metadata (name, symbol, decimals)
 */
export async function getERC20Metadata(tokenAddress: string, chainId?: ChainId): Promise<{ name: string; symbol: string; decimals: number }> {
  const [name, symbol, decimals] = await Promise.all([
    readContract<string>(tokenAddress, erc20MetadataInterface, 'name', [], chainId),
    readContract<string>(tokenAddress, erc20MetadataInterface, 'symbol', [], chainId),
    readContract<bigint>(tokenAddress, erc20MetadataInterface, 'decimals', [], chainId),
  ]);
  return { name, symbol, decimals: Number(decimals) };
}

/**
 * Format a bigint balance to a human-readable string
 */
export function formatBalance(balance: bigint, decimals: number, maxDecimals: number = 6): string {
  const raw = formatUnits(balance, decimals);
  const num = parseFloat(raw);
  if (num === 0) return '0';
  if (num < 0.000001) return '<0.000001';
  // Use at most maxDecimals significant decimal places
  const fixed = num.toFixed(maxDecimals);
  // Remove trailing zeros
  return fixed.replace(/\.?0+$/, '');
}

/**
 * Get all token balances for a wallet on a specific chain
 */
export async function getAllTokenBalances(walletAddress: string, chainId: ChainId): Promise<WalletToken[]> {
  await initChainRpcUrls();
  
  const nativeInfo = NATIVE_TOKEN[chainId] || NATIVE_TOKEN[BASE_CHAIN_ID];
  const defaultTokens = DEFAULT_TOKENS[chainId] || [];
  const customTokens = getCustomTokens(chainId);
  const allErc20 = [...defaultTokens, ...customTokens];

  // Fetch all in parallel
  const [nativeBalance, ...erc20Balances] = await Promise.all([
    getNativeBalance(walletAddress, chainId),
    ...allErc20.map(t => getERC20TokenBalance(t.address, walletAddress, chainId)),
  ]);

  const tokens: WalletToken[] = [];

  // Native token first
  tokens.push({
    address: '0x0',
    symbol: nativeInfo.symbol,
    name: nativeInfo.name,
    decimals: nativeInfo.decimals,
    balance: nativeBalance,
    formattedBalance: formatBalance(nativeBalance, nativeInfo.decimals),
    isNative: true,
    chainId,
  });

  // ERC20 tokens
  allErc20.forEach((token, i) => {
    const balance = erc20Balances[i];
    tokens.push({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      balance,
      formattedBalance: formatBalance(balance, token.decimals),
      logo: token.logo,
      isCustom: !!(token as any).isCustom,
      chainId,
    });
  });

  return tokens;
}

/**
 * Custom token persistence
 */
export function getCustomTokens(chainId: ChainId): { address: string; symbol: string; name: string; decimals: number; logo?: string; isCustom: boolean }[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TOKENS_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw);
    return (all[chainId] || []).map((t: any) => ({ ...t, isCustom: true }));
  } catch {
    return [];
  }
}

export function saveCustomToken(chainId: ChainId, token: { address: string; symbol: string; name: string; decimals: number }) {
  try {
    const raw = localStorage.getItem(CUSTOM_TOKENS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const existing = all[chainId] || [];
    // Don't duplicate
    if (existing.some((t: any) => t.address.toLowerCase() === token.address.toLowerCase())) return;
    existing.push(token);
    all[chainId] = existing;
    localStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export function removeCustomToken(chainId: ChainId, tokenAddress: string) {
  try {
    const raw = localStorage.getItem(CUSTOM_TOKENS_KEY);
    if (!raw) return;
    const all = JSON.parse(raw);
    all[chainId] = (all[chainId] || []).filter((t: any) => t.address.toLowerCase() !== tokenAddress.toLowerCase());
    localStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

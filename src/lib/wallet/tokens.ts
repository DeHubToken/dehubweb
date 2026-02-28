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
export const DEFAULT_TOKENS: Record<number, { address: string; symbol: string; name: string; decimals: number; logo?: string; displaySymbol?: string }[]> = {
  [BASE_CHAIN_ID]: [
    { address: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c', symbol: 'DHB', name: 'DeHub', decimals: 18 },
    { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', symbol: 'USDT', name: 'Tether', decimals: 6 },
    { address: '0x236aa50979D5f3De3Bd1Eeb40E81137F22ab794b', symbol: 'BTC', name: 'Bitcoin', decimals: 8, displaySymbol: 'BTC' },
  ],
  [BNB_CHAIN_ID]: [
    { address: '0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7', symbol: 'DHB', name: 'DeHub', decimals: 18 },
    { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether', decimals: 18 },
    { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', symbol: 'BTC', name: 'Bitcoin', decimals: 18, displaySymbol: 'BTC' },
  ],
  [ETH_CHAIN_ID]: [
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether', decimals: 6 },
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'BTC', name: 'Bitcoin', decimals: 8, displaySymbol: 'BTC' },
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
 * Auto-detect all ERC-20 token balances using Alchemy's alchemy_getTokenBalances.
 * Returns discovered tokens with non-zero balances (excluding known tokens).
 */
async function autoDetectTokens(walletAddress: string, chainId: ChainId): Promise<WalletToken[]> {
  try {
    const config = CHAIN_CONFIGS[chainId];
    if (!config?.rpcUrl?.includes('alchemy')) return []; // Only works with Alchemy RPCs

    const res = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenBalances',
        params: [walletAddress, 'erc20'],
      }),
    });
    const json = await res.json();
    const balances = json.result?.tokenBalances;
    if (!Array.isArray(balances)) return [];

    // Get known addresses to skip
    const defaultAddrs = new Set(
      (DEFAULT_TOKENS[chainId] || []).map(t => t.address.toLowerCase())
    );
    const customAddrs = new Set(
      getCustomTokens(chainId).map(t => t.address.toLowerCase())
    );

    // Filter to non-zero, non-known tokens
    const discovered = balances.filter((tb: any) => {
      const bal = BigInt(tb.tokenBalance || '0');
      if (bal === BigInt(0)) return false;
      const addr = tb.contractAddress.toLowerCase();
      return !defaultAddrs.has(addr) && !customAddrs.has(addr);
    });

    if (discovered.length === 0) return [];

    // Fetch metadata for discovered tokens (limit to 20 to avoid excessive calls)
    const limited = discovered.slice(0, 20);
    const metadataResults = await Promise.allSettled(
      limited.map((tb: any) => getERC20Metadata(tb.contractAddress, chainId))
    );

    const tokens: WalletToken[] = [];
    for (let i = 0; i < limited.length; i++) {
      const tb = limited[i];
      const metaResult = metadataResults[i];
      if (metaResult.status !== 'fulfilled') continue;
      const meta = metaResult.value;
      if (!meta.symbol || !meta.name) continue;

      const balance = BigInt(tb.tokenBalance || '0');
      tokens.push({
        address: tb.contractAddress,
        symbol: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        balance,
        formattedBalance: formatBalance(balance, meta.decimals),
        isCustom: false,
        chainId,
      });
    }

    return tokens;
  } catch (err) {
    console.warn('[Wallet] Auto-detect tokens failed:', err);
    return [];
  }
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

  // Fetch known balances + auto-detect in parallel
  const [nativeBalance, autoDetected, ...erc20Balances] = await Promise.all([
    getNativeBalance(walletAddress, chainId),
    autoDetectTokens(walletAddress, chainId),
    ...allErc20.map(t => getERC20TokenBalance(t.address, walletAddress, chainId)),
  ]);

  const tokens: WalletToken[] = [];

  // Build known ERC20 token list
  const erc20Tokens: WalletToken[] = allErc20.map((token, i) => ({
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    balance: erc20Balances[i],
    formattedBalance: formatBalance(erc20Balances[i], token.decimals),
    logo: token.logo,
    isCustom: !!(token as any).isCustom,
    chainId,
  }));

  // On Base and BNB, put DHB first (above native token)
  const dhbToken = erc20Tokens.find(t => t.symbol === 'DHB');
  const otherErc20 = erc20Tokens.filter(t => t.symbol !== 'DHB');

  if (dhbToken) {
    tokens.push(dhbToken);
  }

  // Native token
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

  // Known ERC20 tokens
  tokens.push(...otherErc20);

  // Auto-detected tokens (sorted by symbol)
  if (autoDetected.length > 0) {
    const sorted = autoDetected.sort((a, b) => a.symbol.localeCompare(b.symbol));
    tokens.push(...sorted);
  }

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

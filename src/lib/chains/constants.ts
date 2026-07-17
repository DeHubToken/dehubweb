/**
 * Chain & token constants aligned with dehub-stream-backend config/constants.ts
 */

import type { ChainId } from '@/components/app/ChainSelector';

export const SOLANA_MAINNET_CHAIN_ID = 101 as const;
export const SOLANA_DEVNET_CHAIN_ID = 103 as const;

export const SOLANA_CHAIN_IDS: readonly number[] = [SOLANA_MAINNET_CHAIN_ID, SOLANA_DEVNET_CHAIN_ID];

export function isSolanaChain(chainId: number): boolean {
  return SOLANA_CHAIN_IDS.includes(chainId);
}

export function isEvmChain(chainId: number): boolean {
  return !isSolanaChain(chainId);
}

export interface SupportedLockToken {
  symbol: string;
  name: string;
  address: string;
  chainId: ChainId | typeof SOLANA_MAINNET_CHAIN_ID;
  decimals: number;
}

/** Production lock-content tokens (mirrors backend supportedTokensForLockContent) */
export const SUPPORTED_LOCK_TOKENS: SupportedLockToken[] = [
  // Base
  { symbol: 'DHB', name: 'DeHub', address: '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c', chainId: 8453, decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', chainId: 8453, decimals: 6 },
  { symbol: 'USDT', name: 'Tether', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', chainId: 8453, decimals: 6 },
  { symbol: 'WETH', name: 'Wrapped Ether', address: '0x4200000000000000000000000000000000000006', chainId: 8453, decimals: 18 },
  // BNB
  { symbol: 'DHB', name: 'DeHub', address: '0x680D3113caf77B61b510f332D5Ef4cf5b41A761D', chainId: 56, decimals: 18 },
  { symbol: 'USDT', name: 'Tether', address: '0x55d398326f99059fF775485246999027B3197955', chainId: 56, decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', chainId: 56, decimals: 18 },
  { symbol: 'DOGE', name: 'Dogecoin', address: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43', chainId: 56, decimals: 8 },
  // Ethereum mainnet
  { symbol: 'DHB', name: 'DeHub', address: '0x99BB69Ee1BbFC7706C3ebb79b21C5B698fe58EC0', chainId: 1, decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', chainId: 1, decimals: 6 },
  { symbol: 'USDT', name: 'Tether', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', chainId: 1, decimals: 6 },
  // Solana
  { symbol: 'SOL', name: 'Solana', address: 'So11111111111111111111111111111111111111112', chainId: SOLANA_MAINNET_CHAIN_ID, decimals: 9 },
  { symbol: 'USDT', name: 'Tether', address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', chainId: SOLANA_MAINNET_CHAIN_ID, decimals: 6 },
  { symbol: 'USDC', name: 'USD Coin', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', chainId: SOLANA_MAINNET_CHAIN_ID, decimals: 6 },
];

export function getLockTokensForChain(chainId: number): SupportedLockToken[] {
  return SUPPORTED_LOCK_TOKENS.filter((t) => t.chainId === chainId);
}

export function findLockToken(symbol: string, chainId: number): SupportedLockToken | undefined {
  return SUPPORTED_LOCK_TOKENS.find(
    (t) => t.symbol.toUpperCase() === symbol.toUpperCase() && t.chainId === chainId,
  );
}

export function isValidEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

/** EVM chains that support on-chain minting via StreamCollection */
export const MINTING_EVM_CHAIN_IDS: ChainId[] = [8453, 56, 1];

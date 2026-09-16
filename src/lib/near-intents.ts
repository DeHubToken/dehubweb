// NEAR Intents 1Click API - Asset mappings and types

export const ONE_CLICK_API = 'https://1click.chaindefuser.com/v0';

/**
 * Destination assets on Base.
 *
 * These are 1Click asset ids (`nep141:…`), not chain-prefixed contract
 * addresses. The gateway rejects the `base:0x…` form outright with
 * "tokenOut is not valid", so a quote built from one never returned a deposit
 * address — every route out of this drawer failed the same way regardless of
 * what the depositor picked.
 *
 * `symbol` is what actually lands in the wallet, and the UI names that rather
 * than the symbol it was opened for: 1Click settles no USDT and no BNB on
 * Base, so those buyers receive USDC and ETH and are told so.
 */
export const DESTINATION_ASSETS: Record<string, { assetId: string; decimals: number; label: string; symbol: string }> = {
  ETH: { assetId: 'nep141:base.omft.near', decimals: 18, label: 'ETH on Base', symbol: 'ETH' },
  USDC: { assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6, label: 'USDC on Base', symbol: 'USDC' },
  USDT: { assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6, label: 'USDC on Base', symbol: 'USDC' },
  BTC: { assetId: 'nep141:base-0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf.omft.near', decimals: 8, label: 'cbBTC on Base', symbol: 'cbBTC' },
  BNB: { assetId: 'nep141:base.omft.near', decimals: 18, label: 'ETH on Base', symbol: 'ETH' },
};

export const DEFAULT_DESTINATION = DESTINATION_ASSETS.ETH;

export interface ChainInfo {
  id: string;
  name: string;
  /** Token symbol key for icon lookup, or empty for chain-level icon */
  iconKey: string;
  tokens: TokenInfo[];
}

export interface TokenInfo {
  symbol: string;
  name: string;
  assetId: string;
  decimals: number;
  /** Token symbol key for icon lookup (e.g. 'ETH', 'USDC') */
  iconKey: string;
}

/**
 * 1Click's own response shape. The previous snake_case, flat interface here
 * matched nothing the gateway has ever sent, so `deposit_address` was always
 * undefined and the deposit step rendered an empty address box.
 */
export interface QuoteResponse {
  quote: {
    depositAddress: string;
    amountIn: string;
    amountInFormatted: string;
    amountOut: string;
    amountOutFormatted: string;
    amountOutUsd?: string;
    minAmountOut: string;
    deadline: string;
    timeEstimate?: number;
  };
  signature?: string;
  timestamp?: string;
}

export type OneClickStatus =
  | 'KNOWN_DEPOSIT_TX' | 'PENDING_DEPOSIT' | 'INCOMPLETE_DEPOSIT' | 'PROCESSING'
  | 'SUCCESS' | 'REFUNDED' | 'FAILED' | 'EXPIRED' | 'NOT_FOUND';

export interface StatusResponse {
  status: OneClickStatus;
  updatedAt?: string;
  swapDetails?: {
    amountOutFormatted?: string | null;
    destinationChainTxHashes?: { hash: string }[];
  };
}

// Popular origin chains and their commonly used tokens
export const SUPPORTED_CHAINS: ChainInfo[] = [
  {
    id: 'eth',
    name: 'Ethereum',
    iconKey: 'ETH',
    tokens: [
      { symbol: 'ETH', name: 'Ether', assetId: 'nep141:eth.omft.near', decimals: 18, iconKey: 'ETH' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', decimals: 6, iconKey: 'USDC' },
      { symbol: 'USDT', name: 'Tether', assetId: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near', decimals: 6, iconKey: 'USDT' },
    ],
  },
  {
    id: 'base',
    name: 'Base',
    iconKey: 'BASE',
    tokens: [
      { symbol: 'ETH', name: 'Ether', assetId: 'nep141:base-0x0000000000000000000000000000000000000000.omft.near', decimals: 18, iconKey: 'ETH' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6, iconKey: 'USDC' },
    ],
  },
  {
    id: 'arb',
    name: 'Arbitrum',
    iconKey: 'ARB',
    tokens: [
      { symbol: 'ETH', name: 'Ether', assetId: 'nep141:arb-0x0000000000000000000000000000000000000000.omft.near', decimals: 18, iconKey: 'ETH' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near', decimals: 6, iconKey: 'USDC' },
      { symbol: 'USDT', name: 'Tether', assetId: 'nep141:arb-0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9.omft.near', decimals: 6, iconKey: 'USDT' },
    ],
  },
  {
    id: 'sol',
    name: 'Solana',
    iconKey: 'SOL',
    tokens: [
      { symbol: 'SOL', name: 'Solana', assetId: 'nep141:sol-native.omft.near', decimals: 9, iconKey: 'SOL' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:sol-epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v.omft.near', decimals: 6, iconKey: 'USDC' },
    ],
  },
  {
    id: 'bsc',
    name: 'BNB Chain',
    iconKey: 'BNB',
    tokens: [
      { symbol: 'BNB', name: 'BNB', assetId: 'nep141:bsc-native.omft.near', decimals: 18, iconKey: 'BNB' },
      { symbol: 'USDT', name: 'Tether', assetId: 'nep141:bsc-0x55d398326f99059ff775485246999027b3197955.omft.near', decimals: 18, iconKey: 'USDT' },
    ],
  },
  {
    id: 'polygon',
    name: 'Polygon',
    iconKey: 'POL',
    tokens: [
      { symbol: 'POL', name: 'POL', assetId: 'nep141:pol-native.omft.near', decimals: 18, iconKey: 'POL' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:pol-0x3c499c542cef5e3811e1192ce70d8cc03d5c3359.omft.near', decimals: 6, iconKey: 'USDC' },
    ],
  },
  {
    id: 'avax',
    name: 'Avalanche',
    iconKey: 'AVAX',
    tokens: [
      { symbol: 'AVAX', name: 'Avalanche', assetId: 'nep141:avax-native.omft.near', decimals: 18, iconKey: 'AVAX' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:avax-0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e.omft.near', decimals: 6, iconKey: 'USDC' },
    ],
  },
  {
    id: 'near',
    name: 'NEAR',
    iconKey: 'NEAR',
    tokens: [
      { symbol: 'NEAR', name: 'NEAR', assetId: 'near:mainnet', decimals: 24, iconKey: 'NEAR' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6, iconKey: 'USDC' },
    ],
  },
  {
    id: 'btc',
    name: 'Bitcoin',
    iconKey: 'BTC',
    tokens: [
      { symbol: 'BTC', name: 'Bitcoin', assetId: 'nep141:btc-native.omft.near', decimals: 8, iconKey: 'BTC' },
    ],
  },
];

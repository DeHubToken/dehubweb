// NEAR Intents 1Click API - Asset mappings and types

export const ONE_CLICK_API = 'https://1click.chaindefuser.com/v0';

// Destination assets on Base (tokens supported by 1Click)
export const DESTINATION_ASSETS: Record<string, { assetId: string; decimals: number; label: string }> = {
  ETH: { assetId: 'base:0x4200000000000000000000000000000000000006', decimals: 18, label: 'ETH on Base' },
  USDT: { assetId: 'base:0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6, label: 'USDT on Base' },
  USDC: { assetId: 'base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6, label: 'USDC on Base' },
  BTC: { assetId: 'base:0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, label: 'cbBTC on Base' },
  BNB: { assetId: 'base:0x4200000000000000000000000000000000000006', decimals: 18, label: 'ETH on Base' }, // BNB not on Base, fallback to ETH
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

export interface QuoteResponse {
  quote_hash: string;
  deposit_address: string;
  amount_in: string;
  amount_out: string;
  expires_at: string;
  min_deadline: number;
}

export interface StatusResponse {
  status: 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'NOT_FOUND';
  amount_in?: string;
  amount_out?: string;
  tx_hash?: string;
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

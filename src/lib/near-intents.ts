// NEAR Intents 1Click API - Asset mappings and types

export const ONE_CLICK_API = 'https://1click.chaindefuser.com/v0';

// DHB is not listed on 1Click — use WETH on Base as destination, then user can swap to DHB via Uniswap
export const WETH_BASE_ASSET_ID = 'base:0x4200000000000000000000000000000000000006';
export const USDC_BASE_ASSET_ID = 'base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

// Default destination: ETH on Base (native)
export const DEFAULT_DESTINATION_ASSET_ID = WETH_BASE_ASSET_ID;

export interface ChainInfo {
  id: string;
  name: string;
  icon: string; // emoji or URL
  tokens: TokenInfo[];
}

export interface TokenInfo {
  symbol: string;
  name: string;
  assetId: string;
  decimals: number;
  icon: string;
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
    icon: '⟠',
    tokens: [
      { symbol: 'ETH', name: 'Ether', assetId: 'nep141:eth.omft.near', decimals: 18, icon: '⟠' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', decimals: 6, icon: '💵' },
      { symbol: 'USDT', name: 'Tether', assetId: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near', decimals: 6, icon: '💲' },
    ],
  },
  {
    id: 'base',
    name: 'Base',
    icon: '🔵',
    tokens: [
      { symbol: 'ETH', name: 'Ether', assetId: 'nep141:base-0x0000000000000000000000000000000000000000.omft.near', decimals: 18, icon: '⟠' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6, icon: '💵' },
    ],
  },
  {
    id: 'arb',
    name: 'Arbitrum',
    icon: '🔷',
    tokens: [
      { symbol: 'ETH', name: 'Ether', assetId: 'nep141:arb-0x0000000000000000000000000000000000000000.omft.near', decimals: 18, icon: '⟠' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near', decimals: 6, icon: '💵' },
      { symbol: 'USDT', name: 'Tether', assetId: 'nep141:arb-0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9.omft.near', decimals: 6, icon: '💲' },
    ],
  },
  {
    id: 'sol',
    name: 'Solana',
    icon: '◎',
    tokens: [
      { symbol: 'SOL', name: 'Solana', assetId: 'nep141:sol-native.omft.near', decimals: 9, icon: '◎' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:sol-epjfwdd5aufqssqem2qn1xzybapc8g4weggkzwytdt1v.omft.near', decimals: 6, icon: '💵' },
    ],
  },
  {
    id: 'bsc',
    name: 'BNB Chain',
    icon: '🟡',
    tokens: [
      { symbol: 'BNB', name: 'BNB', assetId: 'nep141:bsc-native.omft.near', decimals: 18, icon: '🟡' },
      { symbol: 'USDT', name: 'Tether', assetId: 'nep141:bsc-0x55d398326f99059ff775485246999027b3197955.omft.near', decimals: 18, icon: '💲' },
    ],
  },
  {
    id: 'polygon',
    name: 'Polygon',
    icon: '🟣',
    tokens: [
      { symbol: 'POL', name: 'POL', assetId: 'nep141:pol-native.omft.near', decimals: 18, icon: '🟣' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:pol-0x3c499c542cef5e3811e1192ce70d8cc03d5c3359.omft.near', decimals: 6, icon: '💵' },
    ],
  },
  {
    id: 'avax',
    name: 'Avalanche',
    icon: '🔺',
    tokens: [
      { symbol: 'AVAX', name: 'Avalanche', assetId: 'nep141:avax-native.omft.near', decimals: 18, icon: '🔺' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:avax-0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e.omft.near', decimals: 6, icon: '💵' },
    ],
  },
  {
    id: 'near',
    name: 'NEAR',
    icon: '🌐',
    tokens: [
      { symbol: 'NEAR', name: 'NEAR', assetId: 'near:mainnet', decimals: 24, icon: '🌐' },
      { symbol: 'USDC', name: 'USD Coin', assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6, icon: '💵' },
    ],
  },
  {
    id: 'btc',
    name: 'Bitcoin',
    icon: '₿',
    tokens: [
      { symbol: 'BTC', name: 'Bitcoin', assetId: 'nep141:btc.omft.near', decimals: 8, icon: '₿' },
    ],
  },
  {
    id: 'doge',
    name: 'Dogecoin',
    icon: '🐕',
    tokens: [
      { symbol: 'DOGE', name: 'Dogecoin', assetId: 'nep141:doge.omft.near', decimals: 8, icon: '🐕' },
    ],
  },
];

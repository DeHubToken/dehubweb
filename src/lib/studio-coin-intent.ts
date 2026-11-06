import { apiCall } from '@/lib/api/dehub/core';
import { EVM_PAYMENT_CHAINS } from '@/lib/crypto-purchase';

/**
 * Studio balance top-ups in any coin NEAR Intents carries (BTC, SOL, DOGE,
 * Tron, every EVM chain...). The buyer sends to a one-time address, the swap
 * lands as USDC on Base, and the API adds those dollars to the Studio balance.
 */

export interface AnyCoin {
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  price?: number;
  contractAddress?: string;
}

export interface AnyCoinQuote {
  amountInFormatted: string | null;
  amountInUsd: string | null;
  timeEstimateSeconds: number | null;
  usd: number;
  raisedToMinimum: boolean;
}

export interface AnyCoinIntent {
  id: string;
  originAsset: string;
  originSymbol: string;
  originBlockchain: string;
  depositAddress: string;
  depositMemo?: string | null;
  amountInFormatted: string;
  amountInUsd?: string;
  timeEstimateSeconds?: number;
  refundTo: string;
  usd: number;
  expiresAt: number;
  createdAt?: string;
  settlement: string;
  credited: boolean;
  creditedUsd?: number;
}

/** Smallest payment the API takes, in dollars. */
export const ANY_COIN_MIN_USD = 1;

/** Coins most people hold, shown first before anyone searches. */
const FEATURED: Array<[string, string]> = [
  ['BTC', 'btc'], ['SOL', 'sol'], ['ETH', 'eth'], ['USDC', 'sol'], ['USDT', 'tron'],
  ['ETH', 'arb'], ['DOGE', 'doge'], ['XRP', 'xrp'], ['TRX', 'tron'], ['LTC', 'ltc'],
  ['NEAR', 'near'], ['USDT', 'eth'], ['USDC', 'eth'], ['POL', 'pol'], ['AVAX', 'avax'],
];

export function sortAnyCoins(coins: AnyCoin[]): AnyCoin[] {
  const rank = (c: AnyCoin) => {
    const i = FEATURED.findIndex(([s, b]) => s === c.symbol && b === c.blockchain);
    return i === -1 ? FEATURED.length : i;
  };
  return [...coins].sort((a, b) => rank(a) - rank(b) || a.symbol.localeCompare(b.symbol));
}

export const isEvmCoin = (coin: { blockchain: string }) => EVM_PAYMENT_CHAINS.has(coin.blockchain);

/** Open, or still swapping: worth showing again when the sheet reopens. */
export function intentInFlight(intent: AnyCoinIntent, now = Date.now()): boolean {
  if (intent.credited) return false;
  const s = intent.settlement;
  if (['REFUNDED', 'FAILED', 'EXPIRED'].includes(s)) return false;
  if (s === 'PENDING_DEPOSIT' && intent.expiresAt * 1000 <= now) return false;
  return true;
}

export async function fetchAnyCoins(): Promise<AnyCoin[]> {
  const response = await apiCall<{ tokens?: AnyCoin[] }>('/api/subscription-credits/coin-options');
  return sortAnyCoins(response?.tokens || []);
}

export function quoteAnyCoin(originAsset: string, usd: number): Promise<AnyCoinQuote> {
  return apiCall('/api/subscription-credits/coin-quote', { method: 'POST', body: { originAsset, usd } });
}

export function openAnyCoinIntent(originAsset: string, usd: number, refundTo: string): Promise<AnyCoinIntent> {
  return apiCall('/api/subscription-credits/coin-intent', {
    method: 'POST',
    body: { originAsset, usd, refundTo },
    requiresAuth: true,
  });
}

export function anyCoinIntentStatus(id: string): Promise<AnyCoinIntent> {
  return apiCall(`/api/subscription-credits/coin-intent/${encodeURIComponent(id)}`, { requiresAuth: true });
}

export async function listAnyCoinIntents(): Promise<AnyCoinIntent[]> {
  const response = await apiCall<{ intents?: AnyCoinIntent[] }>('/api/subscription-credits/coin-intents', { requiresAuth: true });
  return response?.intents || [];
}

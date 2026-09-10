export interface SubscriptionPaymentToken {
  address: string;
  decimals: number;
  symbol: 'USDT';
}

/** USDT is the stable settlement asset behind new USD-priced plans. */
const USDT_BY_CHAIN: Record<number, SubscriptionPaymentToken> = {
  8453: {
    address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    decimals: 6,
    symbol: 'USDT',
  },
  56: {
    address: '0x55d398326f99059ff775485246999027B3197955',
    decimals: 18,
    symbol: 'USDT',
  },
  4663: {
    address: '0xe246bC49b0598D7cD9F0Ead48b885034f1254380',
    decimals: 6,
    symbol: 'USDT',
  },
  101: {
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
    symbol: 'USDT',
  },
};

export function subscriptionPaymentToken(chainId: number): SubscriptionPaymentToken | undefined {
  return USDT_BY_CHAIN[chainId];
}

export function dhbForUsd(usd: number, dhbUsd: number): number | null {
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(dhbUsd) || dhbUsd <= 0) return null;
  return usd / dhbUsd;
}

export function formatDhbEstimate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Live DHB quote unavailable';
  return `≈ ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} DHB`;
}

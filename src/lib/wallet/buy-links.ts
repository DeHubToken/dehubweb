/**
 * DEX deeplinks for buying tokens — fallback for external wallet users
 * when Web3Auth checkout is unavailable.
 */

const USDT_BASE = '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDT_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

const DEX_LINKS: Record<string, string> = {
  ETH: 'https://app.uniswap.org/swap?chain=base&outputCurrency=NATIVE',
  BNB: 'https://pancakeswap.finance/swap?chain=bsc&outputCurrency=BNB',
  USDT: `https://app.uniswap.org/swap?chain=base&outputCurrency=${USDT_BASE}`,
  USDC: `https://app.uniswap.org/swap?chain=base&outputCurrency=${USDC_BASE}`,
  WETH: 'https://app.uniswap.org/swap?chain=base&outputCurrency=NATIVE',
  WBNB: 'https://pancakeswap.finance/swap?chain=bsc&outputCurrency=BNB',
};

/**
 * Get a DEX deeplink URL for buying a given token symbol.
 * Returns null if no known link exists.
 */
export function getDexBuyLink(symbol: string): string | null {
  return DEX_LINKS[symbol.toUpperCase()] ?? null;
}

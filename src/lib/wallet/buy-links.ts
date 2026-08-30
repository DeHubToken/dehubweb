/**
 * DEX deeplinks for buying tokens — fallback for external wallet users
 * when Web3Auth checkout is unavailable.
 */

import { SOLANA_TOKENS, dhbSolanaMint, isSolanaChainId } from '@/lib/chains/solana';

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
 * Solana trades on Jupiter, not Uniswap or PancakeSwap.
 *
 * Keyed by chain rather than folded into DEX_LINKS above because symbol alone
 * is ambiguous the moment a token exists on both sides — USDC is a real
 * contract on Base and a real mint on Solana, and sending a Solana holder to
 * the Base pool is a trade they cannot make.
 *
 * `jup.ag/swap/<input>-<output>` takes mints or the `SOL` alias.
 */
function solanaBuyLink(symbol: string): string | null {
  const upper = symbol.toUpperCase();
  if (upper === 'SOL') return 'https://jup.ag/swap/USDC-SOL';
  if (upper === 'USDC') return `https://jup.ag/swap/SOL-${SOLANA_TOKENS.USDC}`;
  if (upper === 'USDT') return `https://jup.ag/swap/SOL-${SOLANA_TOKENS.USDT}`;
  if (upper === 'DHB') {
    // Only once the mint exists. A Jupiter link to a token with no mint
    // behind it is a dead page, which is worse than no button at all.
    const mint = dhbSolanaMint();
    return mint ? `https://jup.ag/swap/SOL-${mint}` : null;
  }
  return null;
}

/**
 * Get a DEX deeplink URL for buying a given token symbol.
 *
 * `chainId` decides which DEX: without it the EVM links are used, which is the
 * historical behaviour and right for every caller that has no chain to hand.
 * Returns null if no known link exists.
 */
export function getDexBuyLink(symbol: string, chainId?: number): string | null {
  if (chainId !== undefined && isSolanaChainId(chainId)) return solanaBuyLink(symbol);
  return DEX_LINKS[symbol.toUpperCase()] ?? null;
}

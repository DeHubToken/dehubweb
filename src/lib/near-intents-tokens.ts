/**
 * Live origin assets for NEAR Intents deposits.
 *
 * `SUPPORTED_CHAINS` in `near-intents.ts` is a hand-written slice of what the
 * 1Click gateway actually settles — nine chains where it supports thirty-five,
 * so a depositor holding XRP, TRX, DOGE, SUI, TON or any of the other hundred
 * and seventy assets was told we could not take their money when we could.
 * This reads the gateway's own catalogue instead and keeps the hand-written
 * list only as the offline fallback.
 */

import { ONE_CLICK_API, SUPPORTED_CHAINS, type ChainInfo, type TokenInfo } from '@/lib/near-intents';

interface OneClickToken {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price?: number;
  contractAddress?: string;
}

/** Display names for the gateway's chain ids. Unlisted ids render uppercased. */
const CHAIN_LABELS: Record<string, string> = {
  abs: 'Abstract', adi: 'Adi', aleo: 'Aleo', aptos: 'Aptos', arb: 'Arbitrum',
  avax: 'Avalanche', base: 'Base', bch: 'Bitcoin Cash', bera: 'Berachain',
  bsc: 'BNB Chain', btc: 'Bitcoin', cardano: 'Cardano', dash: 'Dash',
  doge: 'Dogecoin', eth: 'Ethereum', fogo: 'Fogo', gnosis: 'Gnosis',
  hypercore: 'Hyperliquid', ltc: 'Litecoin', monad: 'Monad',
  movement: 'Movement', near: 'NEAR', op: 'Optimism', plasma: 'Plasma',
  pol: 'Polygon', scroll: 'Scroll', sol: 'Solana', starknet: 'Starknet',
  stellar: 'Stellar', sui: 'Sui', ton: 'TON', tron: 'Tron',
  xlayer: 'X Layer', xrp: 'XRP Ledger', zec: 'Zcash',
};

/** Chains worth showing first — the ones people actually arrive holding. */
const PRIORITY_CHAINS = ['eth', 'base', 'bsc', 'sol', 'btc', 'arb', 'pol', 'op', 'near'];

export function chainLabel(id: string): string {
  return CHAIN_LABELS[id] || id.toUpperCase();
}

/**
 * Origin chains that use 0x addresses, so the wallet we already hold is a valid
 * refund destination on them.
 */
const EVM_ORIGINS = new Set([
  'eth', 'base', 'arb', 'bsc', 'pol', 'op', 'avax', 'gnosis', 'scroll',
  'monad', 'bera', 'xlayer', 'plasma', 'abs', 'hypercore',
]);

/**
 * A refund address on the ORIGIN chain, which 1Click requires up front — a
 * swap that cannot be refunded is rejected at quote time, and a refund sent to
 * an address on the wrong chain is money gone. We can answer for EVM chains
 * (same 0x address) and for Solana when the account has one linked; every other
 * origin has to tell us where a refund should go.
 */
export function refundAddressFor(
  chainId: string,
  walletAddress: string | null,
  solanaAddress: string | null,
): string | null {
  if (EVM_ORIGINS.has(chainId)) return walletAddress;
  if (chainId === 'sol') return solanaAddress;
  return null;
}

export function needsManualRefundAddress(chainId: string, solanaAddress: string | null): boolean {
  return !EVM_ORIGINS.has(chainId) && !(chainId === 'sol' && !!solanaAddress);
}

/**
 * The gateway lists a token per bridged representation, so the same symbol can
 * appear twice on one chain, and retired routes stay in the response with
 * "(DEPRECATED)" in the symbol. Both would be a trap in a picker: a deposit to
 * a deprecated asset id is a deposit that never settles.
 */
function usable(t: OneClickToken): boolean {
  return !!t.assetId && !!t.symbol && !/deprecated/i.test(t.symbol);
}

export async function fetchOneClickChains(): Promise<ChainInfo[]> {
  const res = await fetch(`${ONE_CLICK_API}/tokens`);
  if (!res.ok) throw new Error(`1Click tokens ${res.status}`);
  const raw: OneClickToken[] = await res.json();

  const byChain = new Map<string, TokenInfo[]>();
  const seen = new Set<string>();

  for (const t of raw) {
    if (!usable(t)) continue;
    const key = `${t.blockchain}:${t.symbol.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byChain.get(t.blockchain) || [];
    list.push({
      symbol: t.symbol,
      name: t.symbol,
      assetId: t.assetId,
      decimals: t.decimals,
      iconKey: t.symbol.toUpperCase(),
    });
    byChain.set(t.blockchain, list);
  }

  if (byChain.size === 0) return SUPPORTED_CHAINS;

  const chains: ChainInfo[] = [...byChain.entries()].map(([id, tokens]) => ({
    id,
    name: chainLabel(id),
    iconKey: id.toUpperCase(),
    // Native first (it shares the chain's id), then alphabetical.
    tokens: tokens.sort((a, b) => a.symbol.localeCompare(b.symbol)),
  }));

  return chains.sort((a, b) => {
    const ai = PRIORITY_CHAINS.indexOf(a.id);
    const bi = PRIORITY_CHAINS.indexOf(b.id);
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return a.name.localeCompare(b.name);
  });
}

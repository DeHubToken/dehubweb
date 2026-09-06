/**
 * DHB market cap, corrected on the way in
 * =======================================
 * `cmc-market-cap` answers $DHB from a hardcoded stub rather than from CMC,
 * because the coin is not listed and trading is paused. That stub is the single
 * source of the market cap every surface prints.
 *
 * It is also a Supabase edge function, which does not ride the Cloudflare deploy
 * that ships the rest of this app — a corrected stub only goes live when the
 * function is redeployed by hand. So the value is normalised here as well: the
 * cap is `price × DHB_TOTAL_SUPPLY` whatever supply the response claims.
 *
 * Once the function is redeployed the two agree exactly and this becomes a
 * no-op, which is the point — it is a floor under the number, not a second
 * opinion about it.
 *
 * Applied at both places that read the function's response, and nowhere else:
 * `fetchCmcMarketCap` (the explore card) and `cmcBySymbol` (the resolver behind
 * feed ticker cards). Correcting it per component is what let the two disagree
 * in the first place.
 */

import { DHB_TOTAL_SUPPLY } from '@/lib/contracts/dhb-token';

/** The shape both callers share — a partial view of the function's response. */
interface DhbCorrectable {
  symbol?: string | null;
  price?: number | null;
  marketCap?: number | null;
  fullyDilutedMarketCap?: number | null;
  circulatingSupply?: number | null;
  totalSupply?: number | null;
  maxSupply?: number | null;
}

export function isDhbSymbol(symbol?: string | null): boolean {
  const s = symbol?.replace(/^\$/, '').toUpperCase();
  return s === 'DHB' || s === 'DEHUB';
}

/**
 * Returns the response unchanged for every other asset. For $DHB it restates
 * the cap and the supplies off `DHB_TOTAL_SUPPLY`, leaving price, logo, links
 * and everything else exactly as the function sent them.
 */
export function correctDhbMarketCap<T extends DhbCorrectable>(data: T | null): T | null {
  if (!data || !isDhbSymbol(data.symbol)) return data;
  if (data.price == null) return data;

  const marketCap = data.price * DHB_TOTAL_SUPPLY;
  // Cast because the two callers pass different views of the same response —
  // the resolver's `CmcAsset` does not declare the supply fields it never reads.
  // Writing them is harmless; widening its interface to satisfy a spread is not
  // worth it.
  return {
    ...data,
    marketCap,
    fullyDilutedMarketCap: marketCap,
    circulatingSupply: DHB_TOTAL_SUPPLY,
    totalSupply: DHB_TOTAL_SUPPLY,
    maxSupply: DHB_TOTAL_SUPPLY,
  } as T;
}

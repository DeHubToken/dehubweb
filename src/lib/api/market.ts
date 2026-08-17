/**
 * Market lookups
 * ==============
 * Everything the asset cards and the composer's ticker picker need, behind four
 * functions: resolve an address, resolve a ticker, search, and fetch a 24h
 * series.
 *
 * Four providers, because no single one covers the market:
 *
 * - **CoinMarketCap** (`cmc-market-cap`, `cmc-chart`) — listed crypto. The only
 *   authority for rank, supply and a market cap that isn't a DEX estimate.
 *   Keyed, so it goes through the edge functions.
 * - **DexScreener** — the long tail. Every chain, every pool, no key, CORS
 *   open, so it is called straight from the client on both platforms. This is
 *   the only provider that can answer "what is this contract address".
 * - **GeckoTerminal** — OHLCV for a pool, which is where the 24h chart for an
 *   unlisted token comes from. No key either.
 * - **Yahoo** (`stock-quote`) — equities, ETFs, indices, futures and FX, with a
 *   5-minute series over the last day already in the response.
 *
 * A provider that is down, rate-limited or (for the two new search actions)
 * not yet redeployed contributes nothing and the others still answer. Nothing
 * here throws: a card that cannot resolve falls back to a chip, and a search
 * that finds nothing closes the dropdown.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  compareAssetPairs,
  DEX_TO_GECKO_NETWORK,
  type AssetRef,
  type RankablePair,
} from '@/lib/asset-refs';
import type { PricePoint } from '@/hooks/use-token-chart';

const DEXSCREENER = 'https://api.dexscreener.com';
const GECKOTERMINAL = 'https://api.geckoterminal.com/api/v2';

export type AssetClass = 'token' | 'stock';

export interface ResolvedAsset {
  assetClass: AssetClass;
  symbol: string;
  name: string;
  logo: string | null;
  price: number | null;
  changePercent24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  liquidityUsd: number | null;
  currency: string;
  /** Tokens: where the price came from, and what the chart keys on. */
  chainId?: string;
  address?: string;
  pairAddress?: string;
  dexId?: string;
  dexUrl?: string;
  cmcSlug?: string | null;
  cmcRank?: number | null;
  /** Stocks: the venue, and the instrument class Yahoo reported. */
  exchange?: string;
  instrumentType?: string;
  /**
   * Set when the provider handed a series over with the quote — Yahoo does, so
   * a stock card draws its chart with no second request.
   */
  series?: PricePoint[];
}

export interface AssetSuggestion {
  assetClass: AssetClass;
  symbol: string;
  name: string;
  logo: string | null;
  price: number | null;
  changePercent24h: number | null;
  chainId?: string;
  address?: string;
  exchange?: string;
  /**
   * Whether a bare `$SYMBOL` in a caption resolves back to exactly this asset.
   *
   * This is what decides what the composer inserts. Stocks and CMC-listed coins
   * are canonical by symbol, so the caption can carry the readable `$AAPL`. A
   * DEX token that is *not* the best-ranked pool for its symbol is not: the
   * reader's card would resolve to the other one, so the composer inserts the
   * contract address instead and the surfaces strip it in favour of the card.
   */
  canonicalBySymbol: boolean;
}

// ── DexScreener ─────────────────────────────────────────────────────────────

interface DexPairLite extends RankablePair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd: string | null;
  priceChange?: { h24?: number } | null;
  marketCap?: number | null;
  fdv?: number | null;
  info?: { imageUrl?: string };
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function assetFromPair(pair: DexPairLite): ResolvedAsset {
  return {
    assetClass: 'token',
    symbol: pair.baseToken.symbol,
    name: pair.baseToken.name,
    logo: pair.info?.imageUrl ?? null,
    price: pair.priceUsd ? Number(pair.priceUsd) : null,
    changePercent24h: pair.priceChange?.h24 ?? null,
    marketCap: pair.marketCap ?? pair.fdv ?? null,
    volume24h: pair.volume?.h24 ?? null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    currency: 'USD',
    chainId: pair.chainId,
    address: pair.baseToken.address,
    pairAddress: pair.pairAddress,
    dexId: pair.dexId,
    dexUrl: pair.url,
  };
}

/** Best pool for a token address, across every chain DexScreener indexes. */
async function bestPairForAddress(address: string): Promise<DexPairLite | null> {
  const data = await getJson<{ pairs?: DexPairLite[] | null }>(
    `${DEXSCREENER}/latest/dex/tokens/${encodeURIComponent(address)}`,
  );
  const pairs = data?.pairs;
  if (!Array.isArray(pairs) || pairs.length === 0) return null;

  // The address may be either side of a pool. Only pools where it is the base
  // token describe *it* — as the quote token, `priceUsd` is the other asset.
  const wanted = address.toLowerCase();
  const asBase = pairs.filter((p) => p.baseToken?.address?.toLowerCase() === wanted);
  const usable = asBase.length > 0 ? asBase : pairs;
  return [...usable].sort((a, b) => compareAssetPairs(a, b))[0] ?? null;
}

/** Every distinct token trading under a symbol, best pool per token, ranked. */
async function tokensForSymbol(symbol: string, exactOnly = true): Promise<DexPairLite[]> {
  const data = await getJson<{ pairs?: DexPairLite[] | null }>(
    `${DEXSCREENER}/latest/dex/search?q=${encodeURIComponent(symbol)}`,
  );
  const pairs = data?.pairs;
  if (!Array.isArray(pairs)) return [];

  const target = symbol.toUpperCase();
  const matches = pairs.filter((p) => {
    const s = p.baseToken?.symbol?.toUpperCase();
    if (!s) return false;
    return exactOnly ? s === target : s.startsWith(target);
  });

  matches.sort((a, b) => compareAssetPairs(a, b));

  const seen = new Set<string>();
  const out: DexPairLite[] = [];
  for (const pair of matches) {
    const key = `${pair.chainId}:${pair.baseToken.address.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pair);
    if (out.length >= 8) break;
  }
  return out;
}

// ── Edge-function providers ─────────────────────────────────────────────────

interface CmcAsset {
  symbol?: string;
  name?: string;
  slug?: string | null;
  logo?: string | null;
  cmcRank?: number | null;
  price?: number | null;
  marketCap?: number | null;
  volume24h?: number | null;
  percentChange24h?: number | null;
  platform?: { name?: string; tokenAddress?: string } | null;
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) return null;
    return (data ?? null) as T | null;
  } catch {
    return null;
  }
}

async function cmcBySymbol(symbol: string): Promise<CmcAsset | null> {
  const data = await invoke<CmcAsset & { error?: string }>('cmc-market-cap', { symbol });
  if (!data || data.error || !data.symbol) return null;
  return data;
}

interface StockQuoteResponse {
  found: boolean;
  name?: string;
  symbol?: string;
  exchange?: string;
  currency?: string;
  instrumentType?: string;
  price?: number | null;
  percentChange24h?: number | null;
  marketCap?: number | null;
  volume24h?: number | null;
  chartData?: PricePoint[];
}

async function stockBySymbol(symbol: string): Promise<ResolvedAsset | null> {
  const q = await invoke<StockQuoteResponse>('stock-quote', { symbol });
  if (!q?.found) return null;
  return {
    assetClass: 'stock',
    symbol: q.symbol || symbol,
    name: q.name || q.symbol || symbol,
    logo: null,
    price: q.price ?? null,
    changePercent24h: q.percentChange24h ?? null,
    marketCap: q.marketCap ?? null,
    volume24h: q.volume24h ?? null,
    liquidityUsd: null,
    currency: q.currency || 'USD',
    exchange: q.exchange || '',
    instrumentType: q.instrumentType || '',
    series: Array.isArray(q.chartData) ? q.chartData : undefined,
  };
}

// ── Resolving ───────────────────────────────────────────────────────────────

/**
 * A CMC listing this far down the ranks is a memecoin that borrowed a ticker,
 * not the thing somebody typing `$NVDA` meant. Above the line CMC wins the
 * symbol; below it, a real instrument on an exchange does.
 */
const CMC_RANK_BEATS_EQUITY = 500;

function assetFromCmc(cmc: CmcAsset, fallbackSymbol: string): ResolvedAsset {
  return {
    assetClass: 'token',
    symbol: cmc.symbol || fallbackSymbol,
    name: cmc.name || cmc.symbol || fallbackSymbol,
    logo: cmc.logo ?? null,
    price: cmc.price ?? null,
    changePercent24h: cmc.percentChange24h ?? null,
    marketCap: cmc.marketCap ?? null,
    volume24h: cmc.volume24h ?? null,
    liquidityUsd: null,
    currency: 'USD',
    address: cmc.platform?.tokenAddress || undefined,
    cmcSlug: cmc.slug ?? null,
    cmcRank: cmc.cmcRank ?? null,
  };
}

/** Merge what DexScreener knows about a pool into a CMC identity, or vice versa. */
function mergeTokenSources(cmc: CmcAsset | null, pair: DexPairLite | null): ResolvedAsset | null {
  if (!cmc && !pair) return null;
  if (!cmc) return assetFromPair(pair as DexPairLite);
  const base = assetFromCmc(cmc, cmc.symbol || '');
  if (!pair) return base;
  const fromPair = assetFromPair(pair);
  return {
    ...fromPair,
    ...base,
    // CMC's are the authoritative numbers, but it has no pool — the chart, the
    // liquidity and the DEX link can only come from the pair.
    logo: base.logo ?? fromPair.logo,
    price: base.price ?? fromPair.price,
    changePercent24h: base.changePercent24h ?? fromPair.changePercent24h,
    marketCap: base.marketCap ?? fromPair.marketCap,
    volume24h: base.volume24h ?? fromPair.volume24h,
    liquidityUsd: fromPair.liquidityUsd,
    chainId: fromPair.chainId,
    address: base.address || fromPair.address,
    pairAddress: fromPair.pairAddress,
    dexId: fromPair.dexId,
    dexUrl: fromPair.dexUrl,
  };
}

/** Resolve a pasted contract address. DexScreener is the only provider that can. */
export async function resolveAddress(address: string): Promise<ResolvedAsset | null> {
  const pair = await bestPairForAddress(address);
  if (!pair) return null;
  const asset = assetFromPair(pair);

  // Enrich with CMC when the symbol is listed *and* CMC agrees it lives at this
  // address — otherwise a shell token borrowing "USDC" inherits USDC's identity,
  // logo and market cap, which is exactly the card a scam wants.
  const cmc = await cmcBySymbol(asset.symbol);
  const cmcAddress = cmc?.platform?.tokenAddress?.toLowerCase();
  if (!cmc || !cmcAddress || cmcAddress !== (asset.address || '').toLowerCase()) return asset;
  return mergeTokenSources(cmc, pair) ?? asset;
}

/**
 * Resolve a bare `$TICKER`.
 *
 * All three providers are asked at once and the winner is picked by rule, not
 * by whichever answered first, so the same caption resolves to the same asset
 * on web, on mobile and on a re-render.
 */
export async function resolveTicker(symbol: string): Promise<ResolvedAsset | null> {
  const [cmc, stock, dexTokens] = await Promise.all([
    cmcBySymbol(symbol),
    stockBySymbol(symbol),
    tokensForSymbol(symbol),
  ]);

  if (cmc && cmc.price != null) {
    const outranksEquity = cmc.cmcRank == null || cmc.cmcRank <= CMC_RANK_BEATS_EQUITY;
    if (outranksEquity || !stock) {
      const cmcAddress = cmc.platform?.tokenAddress?.toLowerCase();
      const pair =
        (cmcAddress
          ? dexTokens.find((p) => p.baseToken.address.toLowerCase() === cmcAddress)
          : undefined) ??
        dexTokens[0] ??
        null;
      return mergeTokenSources(cmc, pair);
    }
  }

  if (stock) return stock;
  if (dexTokens[0]) return assetFromPair(dexTokens[0]);
  return cmc ? assetFromCmc(cmc, symbol) : null;
}

/** Resolve whichever kind of reference a surface found. */
export function resolveAssetRef(ref: AssetRef): Promise<ResolvedAsset | null> {
  return ref.kind === 'address' ? resolveAddress(ref.value) : resolveTicker(ref.value);
}

// ── 24h series ──────────────────────────────────────────────────────────────

/**
 * 24 hourly closes for a pool. GeckoTerminal is per-pool, so this needs the
 * pair the price came from — a token with no indexed pool gets a card without a
 * chart rather than no card.
 */
async function geckoHourly(chainId: string, pairAddress: string): Promise<PricePoint[]> {
  const network = DEX_TO_GECKO_NETWORK[chainId.toLowerCase()];
  if (!network) return [];
  // Pair addresses on some chains carry a "…:4meme" style suffix GeckoTerminal
  // does not know.
  const pool = pairAddress.split(':')[0];
  const data = await getJson<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(
    `${GECKOTERMINAL}/networks/${network}/pools/${encodeURIComponent(pool)}/ohlcv/hour?limit=24&currency=usd`,
  );
  const list = data?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => ({ time: c[0] * 1000, price: c[4] }))
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.time - b.time);
}

/** The card's sparkline: 24h of closes, whatever the asset is. */
export async function fetch24hSeries(asset: ResolvedAsset): Promise<PricePoint[]> {
  if (asset.series?.length) return asset.series;

  if (asset.chainId && asset.pairAddress) {
    const points = await geckoHourly(asset.chainId, asset.pairAddress);
    if (points.length >= 2) return points;
  }

  // A listed coin with no pool we can chart — CMC's daily closes are the only
  // series left, and over one day that is a two-point line. Better than blank.
  if (asset.assetClass === 'token') {
    const data = await invoke<{ prices?: PricePoint[] }>('cmc-chart', {
      symbol: asset.symbol,
      days: 1,
    });
    if (data?.prices?.length) return data.prices;
  }

  return [];
}

// ── Search, for the composer ────────────────────────────────────────────────

/**
 * Enough of the market to answer the first keystroke without a network round
 * trip, and to keep the dropdown useful for stocks even before the two new
 * edge search actions are deployed. Everything else arrives from the providers.
 */
const MAJORS: Array<{ symbol: string; name: string; assetClass: AssetClass }> = [
  { symbol: 'DHB', name: 'DeHub', assetClass: 'token' },
  { symbol: 'BTC', name: 'Bitcoin', assetClass: 'token' },
  { symbol: 'ETH', name: 'Ethereum', assetClass: 'token' },
  { symbol: 'SOL', name: 'Solana', assetClass: 'token' },
  { symbol: 'BNB', name: 'BNB', assetClass: 'token' },
  { symbol: 'XRP', name: 'XRP', assetClass: 'token' },
  { symbol: 'DOGE', name: 'Dogecoin', assetClass: 'token' },
  { symbol: 'ADA', name: 'Cardano', assetClass: 'token' },
  { symbol: 'LINK', name: 'Chainlink', assetClass: 'token' },
  { symbol: 'AVAX', name: 'Avalanche', assetClass: 'token' },
  { symbol: 'USDC', name: 'USD Coin', assetClass: 'token' },
  { symbol: 'USDT', name: 'Tether', assetClass: 'token' },
  { symbol: 'AAPL', name: 'Apple', assetClass: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft', assetClass: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA', assetClass: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet', assetClass: 'stock' },
  { symbol: 'AMZN', name: 'Amazon', assetClass: 'stock' },
  { symbol: 'META', name: 'Meta Platforms', assetClass: 'stock' },
  { symbol: 'TSLA', name: 'Tesla', assetClass: 'stock' },
  { symbol: 'HOOD', name: 'Robinhood Markets', assetClass: 'stock' },
  { symbol: 'COIN', name: 'Coinbase', assetClass: 'stock' },
  { symbol: 'MSTR', name: 'Strategy', assetClass: 'stock' },
  { symbol: 'AMD', name: 'AMD', assetClass: 'stock' },
  { symbol: 'NFLX', name: 'Netflix', assetClass: 'stock' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', assetClass: 'stock' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', assetClass: 'stock' },
  { symbol: 'GC=F', name: 'Gold', assetClass: 'stock' },
  { symbol: 'SI=F', name: 'Silver', assetClass: 'stock' },
  { symbol: 'CL=F', name: 'Crude Oil', assetClass: 'stock' },
];

interface SearchHit {
  suggestion: AssetSuggestion;
  score: number;
}

function scoreFor(symbol: string, query: string, base: number): number {
  const s = symbol.toUpperCase();
  const q = query.toUpperCase();
  if (s === q) return base + 1000;
  if (s.startsWith(q)) return base + 500 - (s.length - q.length);
  return base;
}

interface CmcSearchResponse {
  results?: Array<{
    symbol: string;
    name: string;
    logo?: string | null;
    cmcRank?: number | null;
    price?: number | null;
    percentChange24h?: number | null;
    address?: string | null;
  }>;
}

interface StockSearchResponse {
  results?: Array<{
    symbol: string;
    name: string;
    exchange?: string;
    instrumentType?: string;
  }>;
}

/**
 * Search the market for the composer's dropdown.
 *
 * The two edge search actions are additive to functions that are already live,
 * so an old deploy answers with nothing recognisable rather than an error, and
 * this still returns DEX tokens plus the majors below. `stock-quote` is also
 * asked for the query as an exact symbol, which is what makes any real ticker
 * resolvable even while its prefix search is not deployed yet.
 */
export async function searchAssets(query: string): Promise<AssetSuggestion[]> {
  const q = query.replace(/^\$/, '').trim();
  if (q.length < 1) return [];

  const [dexTokens, cmcSearch, stockSearch, exactStock] = await Promise.all([
    tokensForSymbol(q, false),
    invoke<CmcSearchResponse>('cmc-market-cap', { query: q }),
    invoke<StockSearchResponse>('stock-quote', { query: q }),
    q.length >= 2 ? stockBySymbol(q) : Promise.resolve(null),
  ]);

  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const add = (hit: SearchHit, key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  };

  for (const c of cmcSearch?.results ?? []) {
    if (!c?.symbol) continue;
    add(
      {
        score: scoreFor(c.symbol, q, 3000 - Math.min(c.cmcRank ?? 5000, 5000) / 10),
        suggestion: {
          assetClass: 'token',
          symbol: c.symbol.toUpperCase(),
          name: c.name || c.symbol,
          logo: c.logo ?? null,
          price: c.price ?? null,
          changePercent24h: c.percentChange24h ?? null,
          address: c.address ?? undefined,
          canonicalBySymbol: true,
        },
      },
      `token:${c.symbol.toUpperCase()}`,
    );
  }

  for (const s of stockSearch?.results ?? []) {
    if (!s?.symbol) continue;
    add(
      {
        score: scoreFor(s.symbol, q, 2500),
        suggestion: {
          assetClass: 'stock',
          symbol: s.symbol.toUpperCase(),
          name: s.name || s.symbol,
          logo: null,
          price: null,
          changePercent24h: null,
          exchange: s.exchange || s.instrumentType || '',
          canonicalBySymbol: true,
        },
      },
      `stock:${s.symbol.toUpperCase()}`,
    );
  }

  if (exactStock) {
    add(
      {
        score: scoreFor(exactStock.symbol, q, 2600),
        suggestion: {
          assetClass: 'stock',
          symbol: exactStock.symbol.toUpperCase(),
          name: exactStock.name,
          logo: null,
          price: exactStock.price,
          changePercent24h: exactStock.changePercent24h,
          exchange: exactStock.exchange || '',
          canonicalBySymbol: true,
        },
      },
      `stock:${exactStock.symbol.toUpperCase()}`,
    );
  }

  // DexScreener's own ranking decides which pool owns a symbol, so the first
  // token for a symbol is the one a bare `$SYMBOL` will resolve to and the rest
  // have to be posted by address.
  const symbolTaken = new Set<string>();
  for (const pair of dexTokens) {
    const symbol = pair.baseToken.symbol.toUpperCase();
    const canonical = !symbolTaken.has(symbol);
    symbolTaken.add(symbol);
    add(
      {
        score: scoreFor(symbol, q, pair.volume?.h24 ? 1100 : 1000),
        suggestion: {
          assetClass: 'token',
          symbol,
          name: pair.baseToken.name,
          logo: pair.info?.imageUrl ?? null,
          price: pair.priceUsd ? Number(pair.priceUsd) : null,
          changePercent24h: pair.priceChange?.h24 ?? null,
          chainId: pair.chainId,
          address: pair.baseToken.address,
          canonicalBySymbol: canonical && !seen.has(`token:${symbol}`),
        },
      },
      `dex:${pair.chainId}:${pair.baseToken.address.toLowerCase()}`,
    );
  }

  for (const major of MAJORS) {
    if (!major.symbol.toUpperCase().startsWith(q.toUpperCase())) continue;
    add(
      {
        score: scoreFor(major.symbol, q, 500),
        suggestion: {
          assetClass: major.assetClass,
          symbol: major.symbol,
          name: major.name,
          logo: null,
          price: null,
          changePercent24h: null,
          canonicalBySymbol: true,
        },
      },
      `${major.assetClass}:${major.symbol}`,
    );
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((h) => h.suggestion);
}

/**
 * What the composer should type into the caption for a picked asset.
 *
 * A readable ticker whenever a ticker round-trips to this exact asset; the
 * contract address when it would not, because the address is the only text form
 * that survives two tokens sharing a symbol. Either way the reader sees a card.
 */
export function composerTextFor(suggestion: AssetSuggestion): string {
  if (suggestion.canonicalBySymbol || !suggestion.address) return `$${suggestion.symbol}`;
  return suggestion.address;
}

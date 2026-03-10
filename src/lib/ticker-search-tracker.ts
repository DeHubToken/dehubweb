/**
 * Tracks most-searched tickers (cashtags) in localStorage.
 */

const STORAGE_KEY = 'dehub_ticker_searches';
const MAX_TICKERS = 20;

export interface TickerSearchEntry {
  symbol: string; // e.g. "DHB", "BTC"
  count: number;
  lastSearched: number; // timestamp
}

function getAll(): TickerSearchEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(entries: TickerSearchEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_TICKERS)));
  } catch { /* ignore */ }
}

/**
 * Record a ticker search. Call when a cashtag result is displayed.
 */
export function recordTickerSearch(symbol: string) {
  const clean = symbol.replace(/^$/, '').toUpperCase().trim();
  if (!clean || clean.length < 1) return;

  const entries = getAll();
  const existing = entries.find(e => e.symbol === clean);
  if (existing) {
    existing.count += 1;
    existing.lastSearched = Date.now();
  } else {
    entries.push({ symbol: clean, count: 1, lastSearched: Date.now() });
  }

  // Sort by count desc, keep top MAX_TICKERS
  entries.sort((a, b) => b.count - a.count);
  saveAll(entries);
}

/**
 * Get top N most-searched tickers.
 */
export function getTopTickers(n: number = 8): TickerSearchEntry[] {
  return getAll()
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

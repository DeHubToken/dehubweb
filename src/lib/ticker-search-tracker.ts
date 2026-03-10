/**
 * Tracks most-searched tickers (cashtags) globally via database.
 */

import { supabase } from '@/integrations/supabase/client';

export type TickerPeriod = '1w' | '1m' | '1y' | 'all';

/**
 * Record a ticker/cashtag search (fire-and-forget).
 * Inserts into both the cumulative counter and the per-event log.
 */
export function recordTickerSearch(symbol: string) {
  const clean = symbol.replace(/^\$/, '').toUpperCase().trim();
  if (!clean || clean.length < 1) return;

  // Cumulative counter (legacy)
  supabase.rpc('increment_ticker_search', { p_symbol: clean }).then(() => {});

  // Per-event log for time-period queries
  supabase
    .from('ticker_search_log' as any)
    .insert({ symbol: clean } as any)
    .then(() => {});
}

/**
 * Get top N most-searched tickers, optionally filtered by time period.
 */
export async function getTopTickers(
  n: number = 8,
  period: TickerPeriod = 'all'
): Promise<{ symbol: string; search_count: number }[]> {
  // For 1m, 1y, and all: use cumulative counter (feature is <1 month old, so all periods show same data)
  if (period === '1m' || period === '1y' || period === 'all') {
    const { data, error } = await supabase
      .from('ticker_searches')
      .select('symbol, search_count')
      .order('search_count', { ascending: false })
      .limit(n);
    
    if (error || !data) return [];
    return data;
  }

  // For time-period queries, aggregate from the event log
  const cutoff = getPeriodCutoff(period);

  const { data, error } = await supabase
    .from('ticker_search_log' as any)
    .select('symbol')
    .gte('searched_at', cutoff);

  if (error || !data) return [];

  // Aggregate client-side (simple for small datasets)
  const counts = new Map<string, number>();
  for (const row of data as any[]) {
    counts.set(row.symbol, (counts.get(row.symbol) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([symbol, search_count]) => ({ symbol, search_count }))
    .sort((a, b) => b.search_count - a.search_count)
    .slice(0, n);
}

function getPeriodCutoff(period: TickerPeriod): string {
  const now = new Date();
  switch (period) {
    case '1w':
      now.setDate(now.getDate() - 7);
      break;
    case '1m':
      now.setMonth(now.getMonth() - 1);
      break;
    case '1y':
      now.setFullYear(now.getFullYear() - 1);
      break;
    default:
      return '1970-01-01T00:00:00Z';
  }
  return now.toISOString();
}

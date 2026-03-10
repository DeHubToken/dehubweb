/**
 * Tracks most-searched tickers (cashtags) globally via database.
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Record a ticker/cashtag search (fire-and-forget).
 * Uses a DB function for atomic upsert+increment.
 */
export function recordTickerSearch(symbol: string) {
  const clean = symbol.replace(/^\$/, '').toUpperCase().trim();
  if (!clean || clean.length < 1) return;

  supabase.rpc('increment_ticker_search', { p_symbol: clean }).then(() => {});
}

/**
 * Get top N most-searched tickers from the database.
 */
export async function getTopTickers(n: number = 8): Promise<{ symbol: string; search_count: number }[]> {
  const { data, error } = await supabase
    .from('ticker_searches')
    .select('symbol, search_count')
    .order('search_count', { ascending: false })
    .limit(n);
  
  if (error || !data) return [];
  return data;
}

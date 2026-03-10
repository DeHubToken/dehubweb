/**
 * Tracks most-searched tickers globally via database.
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Record a ticker search (fire-and-forget upsert).
 */
export function recordTickerSearch(symbol: string) {
  const clean = symbol.replace(/^\$/, '').toUpperCase().trim();
  if (!clean || clean.length < 1) return;

  // Upsert: increment count or insert with count=1
  supabase
    .from('ticker_searches')
    .upsert(
      { symbol: clean, search_count: 1, last_searched_at: new Date().toISOString() },
      { onConflict: 'symbol' }
    )
    .then(() => {
      // After upsert with count=1, increment existing rows
      // We use a raw rpc or just do a select+update approach
      // Simpler: just do an update to increment
      supabase
        .from('ticker_searches')
        .select('search_count')
        .eq('symbol', clean)
        .single()
        .then(({ data }) => {
          if (data) {
            supabase
              .from('ticker_searches')
              .update({ 
                search_count: (data.search_count || 0) + 1,
                last_searched_at: new Date().toISOString()
              })
              .eq('symbol', clean)
              .then(() => {});
          }
        });
    });
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

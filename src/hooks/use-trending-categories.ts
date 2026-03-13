/**
 * Hook to fetch trending categories from the trending_categories DB table.
 * For 1d/1w periods, aggregates from category_post_log for accurate time-filtered data.
 * Hardcoded fallback data ensures instant first render.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TopicPeriod = '1d' | '1w' | '1m' | '1y' | 'all';

export interface CategoryCount {
  name: string;
  post_count: number;
}

const EXCLUDED_CATEGORIES = new Set(['general', '']);

const HARDCODED_DATA: Record<TopicPeriod, CategoryCount[]> = {
  'all': [
    { name: 'Entertainment', post_count: 117 },
    { name: 'Crypto', post_count: 63 },
    { name: 'Comedy', post_count: 53 },
    { name: 'Action', post_count: 52 },
    { name: 'Music', post_count: 51 },
    { name: 'Life', post_count: 39 },
    { name: 'Sport', post_count: 32 },
    { name: 'Dehub', post_count: 31 },
    { name: 'Viral', post_count: 31 },
    { name: 'Educational', post_count: 24 },
  ],
  '1y': [
    { name: 'Entertainment', post_count: 61 },
    { name: 'Gaming', post_count: 42 },
    { name: 'Viral', post_count: 40 },
    { name: 'Action', post_count: 25 },
    { name: 'Comedy', post_count: 24 },
    { name: 'Funny', post_count: 20 },
    { name: 'Sport', post_count: 19 },
    { name: 'Blockchain', post_count: 18 },
    { name: 'Music', post_count: 18 },
    { name: 'Dehub', post_count: 16 },
  ],
  '1m': [
    { name: 'Viral', post_count: 18 },
    { name: 'Elder scrolls online', post_count: 9 },
    { name: 'Xbox', post_count: 9 },
    { name: 'Gaming clips', post_count: 9 },
    { name: 'Action', post_count: 6 },
    { name: 'Ai', post_count: 5 },
    { name: 'Animals', post_count: 5 },
    { name: 'Interesting', post_count: 5 },
    { name: 'Israel', post_count: 5 },
    { name: 'Advertising', post_count: 4 },
  ],
  '1w': [
    { name: 'Viral', post_count: 5 },
    { name: 'Action', post_count: 3 },
    { name: 'Crypto', post_count: 3 },
    { name: 'Entertainment', post_count: 3 },
    { name: 'Comedy', post_count: 2 },
    { name: 'Gaming', post_count: 2 },
    { name: 'Music', post_count: 2 },
    { name: 'Sport', post_count: 2 },
    { name: 'Art', post_count: 1 },
    { name: 'Dehub', post_count: 1 },
  ],
  '1d': [
    { name: 'Viral', post_count: 2 },
    { name: 'Entertainment', post_count: 2 },
    { name: 'Crypto', post_count: 1 },
    { name: 'Action', post_count: 1 },
    { name: 'Comedy', post_count: 1 },
    { name: 'Music', post_count: 1 },
    { name: 'Gaming', post_count: 1 },
    { name: 'Art', post_count: 1 },
    { name: 'Sport', post_count: 1 },
    { name: 'Life', post_count: 1 },
  ],
};

function getPeriodCutoff(period: TopicPeriod): string {
  const now = new Date();
  switch (period) {
    case '1d':
      now.setDate(now.getDate() - 1);
      break;
    case '1w':
      now.setDate(now.getDate() - 7);
      break;
    default:
      return '1970-01-01T00:00:00Z';
  }
  return now.toISOString();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function fetchFromLog(period: TopicPeriod, limit: number): Promise<CategoryCount[]> {
  const cutoff = getPeriodCutoff(period);

  const { data, error } = await supabase
    .from('category_post_log' as any)
    .select('name')
    .gte('posted_at', cutoff);

  if (error || !data || data.length === 0) {
    return HARDCODED_DATA[period];
  }

  // Aggregate client-side
  const counts = new Map<string, number>();
  for (const row of data as any[]) {
    const name = (row.name as string) || '';
    if (!EXCLUDED_CATEGORIES.has(name)) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([name, post_count]) => ({ name: capitalize(name), post_count }))
    .sort((a, b) => b.post_count - a.post_count)
    .slice(0, limit);
}

async function fetchFromCumulative(fetchAll = false): Promise<CategoryCount[]> {
  let query = supabase
    .from('trending_categories')
    .select('name, post_count')
    .order('post_count', { ascending: false });

  if (!fetchAll) {
    query = query.limit(10);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return HARDCODED_DATA['all'];
  }

  return (data as { name: string; post_count: number }[])
    .filter(c => !EXCLUDED_CATEGORIES.has(c.name))
    .map(c => ({ name: capitalize(c.name), post_count: c.post_count }));
}

async function fetchTrendingCategories(period: TopicPeriod, fetchAll = false): Promise<CategoryCount[]> {
  // For short periods, aggregate from the event log
  if (period === '1d' || period === '1w') {
    return fetchFromLog(period, fetchAll ? 1000 : 10);
  }
  // For 1m, 1y, all: use cumulative counter
  return fetchFromCumulative(fetchAll);
}

export function useTrendingCategories(period: TopicPeriod = 'all') {
  return useQuery<CategoryCount[]>({
    queryKey: ['trending-categories', period],
    queryFn: () => fetchTrendingCategories(period),
    initialData: HARDCODED_DATA[period],
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}

/**
 * Fetch ALL categories (no limit) for infinite scroll in the "All" period
 */
export function useAllTrendingCategories() {
  return useQuery<CategoryCount[]>({
    queryKey: ['trending-categories-all-unlimited'],
    queryFn: () => fetchTrendingCategories('all', true),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

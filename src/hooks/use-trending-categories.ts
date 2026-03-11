/**
 * Hook to fetch trending categories from the trending_categories DB table.
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
    { name: 'Action', post_count: 3 },
    { name: 'Viral', post_count: 3 },
    { name: 'Animals', post_count: 3 },
    { name: 'Israel', post_count: 3 },
    { name: 'Dehub', post_count: 2 },
    { name: 'Scifi', post_count: 2 },
    { name: 'Art', post_count: 2 },
    { name: 'Crypto', post_count: 2 },
    { name: 'Sports', post_count: 2 },
    { name: 'Skateboarding', post_count: 2 },
  ],
  '1d': [
    { name: 'Israel', post_count: 3 },
    { name: 'Art', post_count: 2 },
    { name: 'Dhb', post_count: 2 },
    { name: 'Chads', post_count: 1 },
    { name: 'Chad', post_count: 1 },
    { name: 'Tommy', post_count: 1 },
    { name: 'Memories', post_count: 1 },
    { name: 'Felling', post_count: 1 },
    { name: '夕陽吻過的背影', post_count: 1 },
    { name: 'Crypto', post_count: 1 },
  ],
};

async function fetchTrendingCategories(_period: TopicPeriod): Promise<CategoryCount[]> {
  // For now, all periods read from the same cumulative table (all-time counts).
  // Time-period filtering can be added later with a created_at column.
  const { data, error } = await supabase
    .from('trending_categories')
    .select('name, post_count')
    .order('post_count', { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    // Fallback to hardcoded
    return HARDCODED_DATA[_period];
  }

  return (data as { name: string; post_count: number }[])
    .filter(c => !EXCLUDED_CATEGORIES.has(c.name))
    .map(c => ({
      name: c.name.charAt(0).toUpperCase() + c.name.slice(1),
      post_count: c.post_count,
    }));
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

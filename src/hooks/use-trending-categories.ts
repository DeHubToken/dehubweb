/**
 * Hook to fetch trending categories from posts within a time period.
 * Fetches multiple pages from the feed API and aggregates category counts.
 */
import { useQuery } from '@tanstack/react-query';

const DEHUB_API_BASE = 'https://api.dehub.io';
const POSTS_PER_PAGE = 50;

export type TopicPeriod = '1d' | '1w' | '1m' | '1y' | 'all';

export interface CategoryCount {
  name: string;
  post_count: number;
}

const PERIOD_CONFIG: Record<TopicPeriod, { days: number; pages: number }> = {
  '1d': { days: 1, pages: 3 },
  '1w': { days: 7, pages: 5 },
  '1m': { days: 30, pages: 8 },
  '1y': { days: 365, pages: 15 },
  'all': { days: 0, pages: 15 },
};

async function fetchTrendingCategories(period: TopicPeriod): Promise<CategoryCount[]> {
  const config = PERIOD_CONFIG[period];
  
  const categoryMap = new Map<string, number>();

  // Build date filter
  let fromDate: string | undefined;
  if (config.days > 0) {
    const d = new Date();
    d.setDate(d.getDate() - config.days);
    fromDate = d.toISOString().split('T')[0];
  }

  // Fetch pages in parallel
  const pagePromises = Array.from({ length: config.pages }, (_, i) => {
    const url = new URL('/api/feed', DEHUB_API_BASE);
    url.searchParams.set('page', String(i + 1));
    url.searchParams.set('limit', String(POSTS_PER_PAGE));
    url.searchParams.set('sortBy', 'latest');
    if (fromDate) {
      url.searchParams.set('from', fromDate);
    }
    return fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    }).then(r => r.ok ? r.json() : null).catch(() => null);
  });

  const pages = await Promise.all(pagePromises);

  for (const page of pages) {
    if (!page?.result) continue;
    for (const item of page.result) {
      const cats = Array.isArray(item.category) ? item.category : item.category ? [item.category] : [];
      for (const cat of cats) {
        const name = (typeof cat === 'string' ? cat : '').trim();
        if (name && name.toLowerCase() !== 'general') {
          categoryMap.set(name, (categoryMap.get(name) || 0) + 1);
        }
      }
    }
  }

  return Array.from(categoryMap.entries())
    .map(([name, post_count]) => ({ name, post_count }))
    .sort((a, b) => b.post_count - a.post_count)
    .slice(0, 10);
}

export function useTrendingCategories(period: TopicPeriod = 'all') {
  return useQuery<CategoryCount[]>({
    queryKey: ['trending-categories', period],
    queryFn: () => fetchTrendingCategories(period),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    placeholderData: (prev) => prev,
  });
}

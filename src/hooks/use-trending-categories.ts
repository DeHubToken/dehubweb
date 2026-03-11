/**
 * Hook to fetch trending categories from posts within a time period.
 * Fetches pages sequentially with delays to avoid API rate limiting (429).
 */
import { useQuery } from '@tanstack/react-query';

const DEHUB_API_BASE = 'https://api.dehub.io';
const POSTS_PER_PAGE = 50;
const DELAY_BETWEEN_REQUESTS_MS = 350;

export type TopicPeriod = '1d' | '1w' | '1m' | '1y' | 'all';

export interface CategoryCount {
  name: string;
  post_count: number;
}

const PERIOD_CONFIG: Record<TopicPeriod, { days: number; pages: number }> = {
  '1d': { days: 1, pages: 3 },
  '1w': { days: 7, pages: 5 },
  '1m': { days: 30, pages: 8 },
  '1y': { days: 365, pages: 10 },
  'all': { days: 0, pages: 10 },
};

const EXCLUDED_CATEGORIES = new Set(['general', '']);

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(page: number, fromDate?: string): Promise<any[] | null> {
  const url = new URL('/api/feed', DEHUB_API_BASE);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(POSTS_PER_PAGE));
  url.searchParams.set('sortBy', 'latest');
  if (fromDate) {
    url.searchParams.set('from', fromDate);
  }
  try {
    const r = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    });
    if (r.status === 429) return null; // rate limited, stop
    if (!r.ok) return null;
    const data = await r.json();
    return data?.result ?? null;
  } catch {
    return null;
  }
}

async function fetchTrendingCategories(period: TopicPeriod): Promise<CategoryCount[]> {
  const config = PERIOD_CONFIG[period];
  const categoryMap = new Map<string, number>();

  let fromDate: string | undefined;
  if (config.days > 0) {
    const d = new Date();
    d.setDate(d.getDate() - config.days);
    fromDate = d.toISOString().split('T')[0];
  }

  // Fetch pages sequentially with delays to avoid 429s
  // Fetch first 2 pages in parallel (safe), then sequential
  const firstBatch = await Promise.all([
    fetchPage(1, fromDate),
    fetchPage(2, fromDate),
  ]);

  const allResults: any[][] = [];
  for (const result of firstBatch) {
    if (result) allResults.push(result);
  }

  // If first batch had data, continue sequentially for remaining pages
  if (allResults.length > 0 && config.pages > 2) {
    for (let i = 3; i <= config.pages; i++) {
      await delay(DELAY_BETWEEN_REQUESTS_MS);
      const result = await fetchPage(i, fromDate);
      if (!result || result.length === 0) break; // no more data or rate limited
      allResults.push(result);
    }
  }

  // Aggregate categories
  for (const items of allResults) {
    for (const item of items) {
      const cats = Array.isArray(item.category) ? item.category : item.category ? [item.category] : [];
      for (const cat of cats) {
        const name = (typeof cat === 'string' ? cat : '').trim().toLowerCase();
        if (name && !EXCLUDED_CATEGORIES.has(name)) {
          // Store display name (capitalize first letter)
          const displayName = cat.trim();
          const existing = categoryMap.get(name);
          if (existing !== undefined) {
            categoryMap.set(name, existing + 1);
          } else {
            categoryMap.set(name, 1);
          }
        }
      }
    }
  }

  return Array.from(categoryMap.entries())
    .map(([name, post_count]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      post_count,
    }))
    .sort((a, b) => b.post_count - a.post_count)
    .slice(0, 10);
}

export function useTrendingCategories(period: TopicPeriod = 'all') {
  return useQuery<CategoryCount[]>({
    queryKey: ['trending-categories', period],
    queryFn: () => fetchTrendingCategories(period),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: 10 * 60_000,
    placeholderData: (prev) => prev,
  });
}

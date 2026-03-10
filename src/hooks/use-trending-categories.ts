/**
 * Hook to fetch trending categories from recent posts (last 2 weeks).
 * Fetches multiple pages from the feed API and aggregates category counts.
 */
import { useQuery } from '@tanstack/react-query';

const DEHUB_API_BASE = 'https://api.dehub.io';
const PAGES_TO_SCAN = 5;
const POSTS_PER_PAGE = 50;

interface CategoryCount {
  name: string;
  post_count: number;
}

async function fetchTrendingCategories(): Promise<CategoryCount[]> {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const fromDate = twoWeeksAgo.toISOString().split('T')[0]; // YYYY-MM-DD

  const categoryMap = new Map<string, number>();

  // Fetch multiple pages in parallel
  const pagePromises = Array.from({ length: PAGES_TO_SCAN }, (_, i) => {
    const url = new URL('/api/feed', DEHUB_API_BASE);
    url.searchParams.set('page', String(i + 1));
    url.searchParams.set('limit', String(POSTS_PER_PAGE));
    url.searchParams.set('sortBy', 'latest');
    url.searchParams.set('from', fromDate);
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
        if (name) {
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

export function useTrendingCategories() {
  return useQuery<CategoryCount[]>({
    queryKey: ['trending-categories'],
    queryFn: fetchTrendingCategories,
    staleTime: 5 * 60_000, // 5 min
    refetchInterval: 10 * 60_000, // 10 min
    placeholderData: [],
  });
}

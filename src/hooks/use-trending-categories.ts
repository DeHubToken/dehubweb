/**
 * Hook to fetch trending categories from posts within a time period.
 * Fetches pages sequentially with delays to avoid API rate limiting (429).
 * Caches results in sessionStorage so subsequent fetches only scan new pages.
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
  '1d': { days: 1, pages: 5 },
  '1w': { days: 7, pages: 8 },
  '1m': { days: 30, pages: 12 },
  '1y': { days: 365, pages: 15 },
  'all': { days: 0, pages: 20 },
};

const EXCLUDED_CATEGORIES = new Set(['general', '']);

interface CachedCategoryData {
  categoryMap: Record<string, number>;
  pagesScanned: number;
  timestamp: number;
}

const CACHE_KEY_PREFIX = 'trending-cats-cache-';
const CACHE_TTL_MS = 10 * 60_000; // 10 minutes for time-bounded periods

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadCache(period: TopicPeriod): CachedCategoryData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY_PREFIX + period);
    if (!raw) return null;
    const data: CachedCategoryData = JSON.parse(raw);
    // "all" cache never expires; others expire after TTL
    if (period !== 'all' && Date.now() - data.timestamp > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(period: TopicPeriod, data: CachedCategoryData) {
  try {
    sessionStorage.setItem(CACHE_KEY_PREFIX + period, JSON.stringify(data));
  } catch { /* ignore quota errors */ }
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
    if (r.status === 429) return null;
    if (!r.ok) return null;
    const data = await r.json();
    return data?.result ?? null;
  } catch {
    return null;
  }
}

function aggregateCategories(items: any[], categoryMap: Map<string, number>) {
  for (const item of items) {
    const cats = Array.isArray(item.category) ? item.category : item.category ? [item.category] : [];
    for (const cat of cats) {
      const name = (typeof cat === 'string' ? cat : '').trim().toLowerCase();
      if (name && !EXCLUDED_CATEGORIES.has(name)) {
        categoryMap.set(name, (categoryMap.get(name) ?? 0) + 1);
      }
    }
  }
}

async function fetchTrendingCategories(period: TopicPeriod): Promise<CategoryCount[]> {
  const config = PERIOD_CONFIG[period];
  const cached = loadCache(period);

  // Restore cached category counts
  const categoryMap = new Map<string, number>(
    cached ? Object.entries(cached.categoryMap) : []
  );
  const startPage = cached ? cached.pagesScanned + 1 : 1;
  const totalPages = config.pages;

  // If cache already covers all pages, return immediately
  if (startPage > totalPages) {
    return mapToResult(categoryMap);
  }

  let fromDate: string | undefined;
  if (config.days > 0) {
    const d = new Date();
    d.setDate(d.getDate() - config.days);
    fromDate = d.toISOString().split('T')[0];
  }

  let lastPageScanned = cached?.pagesScanned ?? 0;

  // Fetch first batch in parallel (up to 3 pages), then sequential
  const parallelEnd = Math.min(startPage + 2, totalPages);
  const parallelPages: number[] = [];
  for (let i = startPage; i <= parallelEnd; i++) parallelPages.push(i);

  const firstBatch = await Promise.all(parallelPages.map(p => fetchPage(p, fromDate)));

  let hitEnd = false;
  for (let idx = 0; idx < firstBatch.length; idx++) {
    const result = firstBatch[idx];
    if (!result || result.length === 0) { hitEnd = true; break; }
    aggregateCategories(result, categoryMap);
    lastPageScanned = parallelPages[idx];
  }

  // Continue sequentially for remaining pages
  if (!hitEnd && parallelEnd < totalPages) {
    for (let i = parallelEnd + 1; i <= totalPages; i++) {
      await delay(DELAY_BETWEEN_REQUESTS_MS);
      const result = await fetchPage(i, fromDate);
      if (!result || result.length === 0) break;
      aggregateCategories(result, categoryMap);
      lastPageScanned = i;
    }
  }

  // Save to cache
  const cacheObj: Record<string, number> = {};
  categoryMap.forEach((v, k) => { cacheObj[k] = v; });
  saveCache(period, {
    categoryMap: cacheObj,
    pagesScanned: lastPageScanned,
    timestamp: Date.now(),
  });

  return mapToResult(categoryMap);
}

function mapToResult(categoryMap: Map<string, number>): CategoryCount[] {
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

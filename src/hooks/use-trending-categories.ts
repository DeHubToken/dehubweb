/**
 * Hook to fetch trending categories.
 * 1D/1W/1M/1Y use time-filtered data from category_post_log (synced from feed API).
 * "All" uses the trending_categories aggregate table.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TopicPeriod = '1d' | '1w' | '1m' | '1y' | 'all';

export interface CategoryCount {
  name: string;
  post_count: number;
}

const EXCLUDED_CATEGORIES = new Set(['general', '', '-', 'other']);
const TOP_LIMIT = 10;
const PAGE_SIZE = 1000;
const TRENDING_CACHE_MS = 60_000;

function getPeriodCutoff(period: TopicPeriod): string {
  const now = new Date();

  switch (period) {
    case '1d':
      now.setDate(now.getDate() - 1);
      break;
    case '1w':
      now.setDate(now.getDate() - 7);
      break;
    case '1m':
      now.setMonth(now.getMonth() - 1);
      break;
    case '1y':
      now.setFullYear(now.getFullYear() - 1);
      break;
    case 'all':
      now.setFullYear(now.getFullYear() - 3);
      break;
  }

  return now.toISOString();
}

function formatCategoryName(s: string): string {
  return s.toLowerCase();
}

function normalizeCategoryName(raw: string | null | undefined): string {
  return (raw || '').trim().toLowerCase();
}

function withTopTenPlaceholders(items: CategoryCount[]): CategoryCount[] {
  const top = items.slice(0, TOP_LIMIT);
  if (top.length >= TOP_LIMIT) return top;

  return [
    ...top,
    ...Array.from({ length: TOP_LIMIT - top.length }, () => ({
      name: '-',
      post_count: 0,
    })),
  ];
}

/**
 * Fetch category counts from the per-post event log, filtered by time window.
 * This table is synced from the DeHub feed API by the sync-category-log edge function.
 */
async function fetchFromLog(period: TopicPeriod): Promise<CategoryCount[]> {
  const cutoff = getPeriodCutoff(period);
  const rows: Array<{ name: string | null }> = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('category_post_log')
      .select('name, posted_at')
      .gte('posted_at', cutoff)
      .order('posted_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const chunk = (data || []).map((row) => ({ name: row.name }));
    if (chunk.length === 0) break;

    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (!rows.length) return [];

  const counts = new Map<string, number>();
  for (const row of rows) {
    const normalized = normalizeCategoryName(row.name);
    if (!normalized || EXCLUDED_CATEGORIES.has(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, post_count]) => ({ name: formatCategoryName(name), post_count }))
    .sort((a, b) => b.post_count - a.post_count);
}

/**
 * Fetch from category_post_log without time cutoff (for "All" period).
 */
async function fetchFromLogAll(): Promise<CategoryCount[]> {
  const rows: Array<{ name: string | null }> = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('category_post_log')
      .select('name')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const chunk = data || [];
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (!rows.length) return [];

  const counts = new Map<string, number>();
  for (const row of rows) {
    const normalized = normalizeCategoryName(row.name);
    if (!normalized || EXCLUDED_CATEGORIES.has(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, post_count]) => ({ name: formatCategoryName(name), post_count }))
    .sort((a, b) => b.post_count - a.post_count);
}

async function fetchTrendingCategories(period: TopicPeriod, fetchAll = false): Promise<CategoryCount[]> {
  let computed: CategoryCount[];

  if (period === 'all') {
    // "All" aggregates the full event log (synced from feed API)
    computed = await fetchFromLogAll();
  } else {
    // 1D/1W/1M/1Y use the time-filtered event log
    computed = await fetchFromLog(period);
  }

  if (fetchAll) return computed;
  return withTopTenPlaceholders(computed);
}

export function useTrendingCategories(period: TopicPeriod = 'all') {
  return useQuery<CategoryCount[]>({
    queryKey: ['trending-categories', period],
    queryFn: () => fetchTrendingCategories(period),
    staleTime: TRENDING_CACHE_MS,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
}

/**
 * Fetch ALL categories (no top-10 limit) for infinite scroll in the "all" period
 */
export function useAllTrendingCategories() {
  return useQuery<CategoryCount[]>({
    queryKey: ['trending-categories-all-unlimited'],
    queryFn: () => fetchTrendingCategories('all', true),
    staleTime: TRENDING_CACHE_MS,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

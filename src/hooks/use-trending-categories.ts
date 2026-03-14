/**
 * Hook to fetch trending categories.
 * Uses time-filtered event logs for short windows (1D/1W)
 * and aggregated counters for longer windows (1M/1Y/All).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TopicPeriod = '1d' | '1w' | '1m' | '1y' | 'all';

export interface CategoryCount {
  name: string;
  post_count: number;
}

const EXCLUDED_CATEGORIES = new Set(['general', '', '-']);
const TOP_LIMIT = 10;
const PAGE_SIZE = 1000;

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
      // Explicitly scope "All" to the last 3 years as requested.
      now.setFullYear(now.getFullYear() - 3);
      break;
  }

  return now.toISOString();
}

function capitalize(s: string): string {
  return s
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

async function fetchAllLogRowsSince(cutoffIso: string): Promise<Array<{ name: string | null }>> {
  const rows: Array<{ name: string | null }> = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('category_post_log')
      .select('name, posted_at')
      .gte('posted_at', cutoffIso)
      .order('posted_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const chunk = (data || []).map((row) => ({ name: row.name }));
    if (chunk.length === 0) break;

    rows.push(...chunk);

    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchFromLog(period: TopicPeriod): Promise<CategoryCount[]> {
  const cutoff = getPeriodCutoff(period);
  const data = await fetchAllLogRowsSince(cutoff);

  if (!data.length) {
    return [];
  }

  const counts = new Map<string, number>();

  for (const row of data) {
    const normalized = normalizeCategoryName(row.name);
    if (!normalized || EXCLUDED_CATEGORIES.has(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, post_count]) => ({ name: capitalize(name), post_count }))
    .sort((a, b) => b.post_count - a.post_count);
}

async function fetchTrendingCategories(period: TopicPeriod, fetchAll = false): Promise<CategoryCount[]> {
  const computed = await fetchFromLog(period);

  if (fetchAll) {
    return computed;
  }

  return withTopTenPlaceholders(computed);
}

export function useTrendingCategories(period: TopicPeriod = 'all') {
  return useQuery<CategoryCount[]>({
    queryKey: ['trending-categories', period],
    queryFn: () => fetchTrendingCategories(period),
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
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
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

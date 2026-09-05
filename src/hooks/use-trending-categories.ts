/**
 * Hook to fetch trending categories.
 * All periods are counted in Postgres by the `category_counts` RPC over
 * category_post_log (synced from the feed API by sync-category-log).
 * "All" is the same call with no time cutoff.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTrendingTopic } from './use-superpowers';

export type TopicPeriod = '1d' | '1w' | '1m' | '1y' | 'all';

export interface CategoryCount {
  name: string;
  post_count: number;
  /**
   * True when a badge holder paid a Trend Jacker to put this here.
   *
   * The row must be LABELLED wherever it renders. The list's whole pitch is
   * that it reflects what people are posting about, and an unlabelled paid
   * entry at position one makes that untrue — the same argument the boosted
   * post in the feed carries.
   */
  boosted?: boolean;
}

const EXCLUDED_CATEGORIES = new Set(['general', '', '-', 'other']);
const TOP_LIMIT = 10;
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
 * Fetch category counts from the per-post event log.
 *
 * The log is one row per post per category — 12,500+ of them — and this hook
 * only ever needs the ~335 distinct names and their totals. It used to page
 * the entire table into the browser in 1,000-row chunks and count here, which
 * meant thirteen requests and ~225 kB on every view of a sidebar that renders
 * ten words. Postgres does the counting now.
 *
 * Normalisation stays on this side on purpose: two raw names can fold to the
 * same key, so the merge below is still required for a correct total — it just
 * runs over 335 rows instead of 12,533.
 *
 * `period` of 'all' passes no cutoff at all rather than a three-year one, which
 * is what the old "All" path did.
 */
async function fetchCategoryCounts(period: TopicPeriod): Promise<CategoryCount[]> {
  const { data, error } = await supabase.rpc('category_counts' as never, {
    p_since: period === 'all' ? null : getPeriodCutoff(period),
  } as never);

  if (error) throw error;

  const rows = (data || []) as Array<{ name: string | null; post_count: number | string }>;
  const counts = new Map<string, number>();

  for (const row of rows) {
    const normalized = normalizeCategoryName(row.name);
    if (!normalized || EXCLUDED_CATEGORIES.has(normalized)) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + Number(row.post_count || 0));
  }

  return Array.from(counts.entries())
    .map(([name, post_count]) => ({ name: formatCategoryName(name), post_count }))
    .sort((a, b) => b.post_count - a.post_count);
}

async function fetchTrendingCategories(period: TopicPeriod, fetchAll = false): Promise<CategoryCount[]> {
  const computed = await fetchCategoryCounts(period);

  if (fetchAll) return computed;
  return withTopTenPlaceholders(computed);
}

/**
 * Put the paid category first, keeping its real count.
 *
 * Done HERE rather than in the list component, because two surfaces render
 * this — the desktop rail and the Explore page — and a holder who bought the
 * top of the list should get it on both rather than on whichever one
 * remembered.
 *
 * Its **real** count is kept, never inflated. A trend that says 3 posts and
 * sits at number one is honest about what was bought: the position, not the
 * popularity. If the category has nothing in this window it still shows,
 * at zero, which is the truth for that window.
 *
 * A placeholder row is dropped to make space rather than a real one, so
 * jacking never pushes an organically trending category off the list until
 * the list is genuinely full.
 */
function withBoosted(items: CategoryCount[], boosted: string | null | undefined): CategoryCount[] {
  const name = normalizeCategoryName(boosted);
  if (!name) return items;

  const existing = items.find((c) => c.name === name);
  const rest = items.filter((c) => c.name !== name);

  // Drop one trailing placeholder if there is one, so the list keeps its
  // length rather than growing by a row on some periods and not others.
  const lastPlaceholder = rest.map((c) => c.name).lastIndexOf('-');
  if (lastPlaceholder >= 0) rest.splice(lastPlaceholder, 1);

  return [{ name, post_count: existing?.post_count ?? 0, boosted: true }, ...rest];
}

export function useTrendingCategories(period: TopicPeriod = 'all') {
  const { data: jacked } = useTrendingTopic();

  return useQuery<CategoryCount[]>({
    queryKey: ['trending-categories', period],
    queryFn: () => fetchTrendingCategories(period),
    staleTime: TRENDING_CACHE_MS,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
    // `select` rather than a useMemo over `data`, so every consumer of this
    // hook gets the same spliced list without each having to remember.
    select: (items) => withBoosted(items, jacked?.category),
  });
}

/**
 * Fetch ALL categories (no top-10 limit) for infinite scroll in the "all" period
 */
export function useAllTrendingCategories() {
  const { data: jacked } = useTrendingTopic();

  return useQuery<CategoryCount[]>({
    queryKey: ['trending-categories-all-unlimited'],
    queryFn: () => fetchTrendingCategories('all', true),
    staleTime: TRENDING_CACHE_MS,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    select: (items) => withBoosted(items, jacked?.category),
  });
}

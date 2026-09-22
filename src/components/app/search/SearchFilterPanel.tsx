/**
 * Search Filter Panel
 * ===================
 * The home feed's filter panel, pointed at search results: sort, category,
 * upload date and content access. Same `GlassFilterRow` chips and the same
 * `filters.*` labels the home and profile panels use, so the sliders button
 * beside the explore search bar opens something already familiar.
 *
 * Unlike the feed panels, every row here is applied client-side in
 * `ExplorePage`: `/api/search` takes no sort or category parameter, so the
 * rows narrow and reorder the pages already pulled in rather than refetching.
 * That is also why the panel opens on Latest — search results come back in
 * relevance order, and chronological is what people expect to read.
 *
 * @module components/app/search/SearchFilterPanel
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { getCategories } from '@/lib/api/dehub';
import {
  DATE_FILTER_OPTIONS,
  CONTENT_TYPE_FILTERS,
  type DateFilterValue,
  type ContentTypeFilterValue,
} from '@/lib/feed-utils';

/**
 * The sorts search can honour. A subset of the feed's `SORT_OPTIONS`: For You,
 * Discovery, Following and the rest are server-ranked over the whole feed and
 * mean nothing applied to one page of matches.
 */
export const SEARCH_SORT_OPTIONS = [
  { value: 'latest' as const, labelKey: 'filters.latest' },
  { value: 'most-liked' as const, labelKey: 'filters.mostLiked' },
  { value: 'most-viewed' as const, labelKey: 'filters.mostViewed' },
  { value: 'most-comments' as const, labelKey: 'filters.mostComments' },
  { value: 'most-tipped' as const, labelKey: 'filters.mostTips' },
] as const;

export type SearchSortValue = typeof SEARCH_SORT_OPTIONS[number]['value'];

export interface SearchFilterState {
  sort: SearchSortValue;
  /** Category id (lowercase name), or null for all. */
  category: string | null;
  date: DateFilterValue;
  ppv: boolean;
  w2e: boolean;
  locked: boolean;
}

/** Newest first, everything included — what the page opens on. */
export const DEFAULT_SEARCH_FILTERS: SearchFilterState = {
  sort: 'latest',
  category: null,
  date: 'all',
  ppv: false,
  w2e: false,
  locked: false,
};

/** How many rows are off their default — the badge on the sliders button. */
export function countActiveSearchFilters(filters: SearchFilterState): number {
  return [
    filters.sort !== DEFAULT_SEARCH_FILTERS.sort,
    filters.category !== null,
    filters.date !== 'all',
    filters.ppv,
    filters.w2e,
    filters.locked,
  ].filter(Boolean).length;
}

interface SearchFilterPanelProps {
  filters: SearchFilterState;
  onChange: (filters: SearchFilterState) => void;
  onReset: () => void;
}

export function SearchFilterPanel({ filters, onChange, onReset }: SearchFilterPanelProps) {
  const { t } = useTranslation();
  const [categorySearch, setCategorySearch] = useState('');

  // Shares the explore page's own cache entry, so opening this costs no request.
  const { data: categories = [] } = useQuery({
    queryKey: ['dehub-categories'],
    queryFn: getCategories,
    staleTime: 5 * 60 * 1000,
  });

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((cat) => cat.name.toLowerCase().includes(q));
  }, [categories, categorySearch]);

  return (
    <div
      data-no-swipe
      data-feed-filter-panel
      className="relative flex flex-col gap-4 px-2 sm:px-3 py-3 mt-3 rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px]"
    >
      {/* Sort */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.sort')}</span>
        <div className="relative">
          <GlassFilterRow
            items={SEARCH_SORT_OPTIONS.map((o) => ({ key: o.value, label: t(o.labelKey) }))}
            activeKey={filters.sort}
            onSelect={(key) => onChange({ ...filters, sort: key as SearchSortValue })}
            borderRadius="0.75rem"
            buttonClassName="px-3 py-2 rounded-xl text-sm"
          />
        </div>
      </div>

      {/* Category */}
      {categories.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.category')}</span>
          <input
            type="text"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            placeholder={t('filters.searchCategories')}
            aria-label={t('filters.searchCategories')}
            className="w-full px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-200 placeholder-zinc-500 border border-zinc-700 focus:border-zinc-500 focus:outline-none transition-colors mb-1"
          />
          <div className="relative">
            <GlassFilterRow
              items={[
                { key: 'all', label: t('filters.all') },
                ...filteredCategories.map((cat) => ({ key: cat.id, label: cat.name })),
              ]}
              activeKey={filters.category ?? 'all'}
              onSelect={(key) => {
                onChange({ ...filters, category: key === 'all' ? null : key });
                setCategorySearch('');
              }}
              borderRadius="0.75rem"
              buttonClassName="px-3 py-2 rounded-xl text-sm capitalize"
            />
            {filteredCategories.length === 0 && !!categorySearch.trim() && (
              <span className="text-xs text-zinc-500 py-1.5">{t('filters.noMatches')}</span>
            )}
          </div>
        </div>
      )}

      {/* Upload date */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.uploadDate')}</span>
        <div className="relative">
          <GlassFilterRow
            items={DATE_FILTER_OPTIONS.map((o) => ({ key: o.value, label: o.label }))}
            activeKey={filters.date}
            onSelect={(key) => onChange({ ...filters, date: key as DateFilterValue })}
            borderRadius="0.75rem"
            buttonClassName="px-3 py-2 rounded-xl text-sm"
          />
        </div>
      </div>

      {/* Content access — multi-select, like the home feed's row */}
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.contentAccess')}</span>
        <div className="relative">
          <GlassFilterRow
            items={CONTENT_TYPE_FILTERS.map((o) => ({ key: o.value, label: t(`filters.${o.value === 'w2e' ? 'bounty' : o.value}`, o.label) }))}
            activeKeys={CONTENT_TYPE_FILTERS.filter((o) => filters[o.value]).map((o) => o.value)}
            onSelect={(key) => {
              const field = key as ContentTypeFilterValue;
              onChange({ ...filters, [field]: !filters[field] });
            }}
            borderRadius="0.75rem"
            buttonClassName="px-3 py-2 rounded-xl text-sm"
          />
        </div>
      </div>

      {/* Reset. z-50 keeps it above the scroll rows (z-40), which overlap this
          corner and would otherwise swallow the tap. */}
      <button
        type="button"
        onClick={() => { setCategorySearch(''); onReset(); }}
        className="absolute z-50 bottom-0 right-0 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
        aria-label={t('filters.resetFilters')}
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

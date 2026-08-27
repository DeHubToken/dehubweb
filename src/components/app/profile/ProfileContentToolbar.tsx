/**
 * Profile Content Toolbar
 * =======================
 * Sort, search and filter over one creator's own posts — the three things a
 * channel page has always been missing. All of it runs server-side (`/api/feed`
 * takes `sortBy`/`sortOrder`/`search` and the whole filter set next to
 * `minter`), so "oldest first" really is the creator's first upload, a search
 * covers everything they ever posted, and a category narrows their whole
 * catalogue — not just the pages already scrolled into memory.
 *
 * The filter toggle sits next to search and opens the same panel the home feed
 * uses (category / upload date / post type / content access). Active filters
 * are also shown as dismissable chips under the toolbar, so a closed panel can
 * never hide why a tab looks empty.
 *
 * Rendered above the tab panels rather than inside the sticky pill: the pill
 * carries the swallow clip, and anything added to it changes where the feed
 * below gets cut.
 *
 * @module components/app/profile/ProfileContentToolbar
 */

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { ProfileFilterPanel } from '@/components/app/profile/ProfileFilterPanel';
import { getCategories } from '@/lib/api/dehub';
import { cn } from '@/lib/utils';
import {
  DATE_FILTER_OPTIONS,
  POST_TYPE_FILTERS,
  type ContentTypeFilterValue,
} from '@/lib/feed-utils';
import {
  countActiveProfileFilters,
  type ProfileContentFilters,
  type ProfileSortMode,
} from '@/hooks/use-dehub-profile';

/** Multi-select access lanes, in the order the home feed's row shows them. */
const ACCESS_CHIPS: { key: ContentTypeFilterValue; labelKey: string; fallback: string }[] = [
  { key: 'ppv', labelKey: 'filters.ppv', fallback: 'PPV' },
  { key: 'w2e', labelKey: 'filters.bounty', fallback: 'Bounty' },
  { key: 'locked', labelKey: 'filters.locked', fallback: 'Gated' },
];

/** The glass treatment the home feed's active filter chips wear. */
const CHIP_CLASS =
  'inline-flex items-center gap-1.5 pl-2.5 pr-2 py-[5px] rounded-lg text-xs font-medium bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)] transition-all hover:border-white/50';

interface ProfileContentToolbarProps {
  sort: ProfileSortMode;
  onSortChange: (sort: ProfileSortMode) => void;
  search: string;
  onSearchChange: (search: string) => void;
  filters: ProfileContentFilters;
  onFiltersChange: (filters: ProfileContentFilters) => void;
  onFiltersReset: () => void;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  /** The post-type row only applies on the All tab — see useProfilePage. */
  showPostType: boolean;
  /** Items currently rendered under the toolbar — shown while a search runs. */
  resultCount: number;
  isLoading: boolean;
}

export function ProfileContentToolbar({
  sort,
  onSortChange,
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  onFiltersReset,
  filtersOpen,
  onFiltersOpenChange,
  showPostType,
  resultCount,
  isLoading,
}: ProfileContentToolbarProps) {
  const { t } = useTranslation();

  // Off the All tab the post-type row is neither shown nor sent, so it must not
  // be badged or chipped either — a chip for a filter that isn't applied is a
  // lie the visitor can't act on.
  const postTypeActive = showPostType && filters.postType !== 'all';
  const activeFilterCount = countActiveProfileFilters(
    showPostType ? filters : { ...filters, postType: 'all' },
  );

  // Only to put a name on the category chip. Nothing to look up until one is
  // picked, and by then the panel has usually warmed this cache entry already.
  const { data: categories = [] } = useQuery({
    queryKey: ['dehub-categories'],
    queryFn: getCategories,
    staleTime: 5 * 60 * 1000,
    enabled: !!filters.category,
  });

  const sortItems: { key: ProfileSortMode; label: string }[] = [
    { key: 'newest', label: t('profile.sortNewest', 'Newest') },
    { key: 'oldest', label: t('profile.sortOldest', 'Oldest') },
    { key: 'views', label: t('profile.sortMostViewed', 'Most viewed') },
    { key: 'likes', label: t('profile.sortMostLiked', 'Most liked') },
  ];

  const categoryLabel = filters.category
    ? categories.find((cat) => cat.id === filters.category)?.name ?? filters.category
    : null;
  const dateLabel = DATE_FILTER_OPTIONS.find((o) => o.value === filters.date)?.label ?? null;
  const postTypeLabel = POST_TYPE_FILTERS.find((o) => o.value === filters.postType)?.label ?? null;

  const accessChips = ACCESS_CHIPS.filter((chip) => filters[chip.key]);

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-2 sm:w-64 sm:flex-shrink-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('profile.searchThisChannel', 'Search this channel')}
              aria-label={t('profile.searchThisChannel', 'Search this channel')}
              className="w-full h-9 pl-9 pr-9 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none transition-colors [&::-webkit-search-cancel-button]:hidden"
            />
            {!!search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label={t('common.clear', 'Clear')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onFiltersOpenChange(!filtersOpen)}
            aria-expanded={filtersOpen}
            aria-label={t('explorePage.filters', 'Filters')}
            className={cn(
              'relative flex-shrink-0 flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl transition-colors',
              filtersOpen || activeFilterCount > 0
                ? 'text-white'
                : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700',
            )}
          >
            {(filtersOpen || activeFilterCount > 0) && (
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]" />
            )}
            <SlidersHorizontal className="relative z-10 w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="relative z-10 text-xs font-medium">{activeFilterCount}</span>
            )}
          </button>
        </div>

        <GlassFilterRow
          items={sortItems}
          activeKey={sort}
          onSelect={onSortChange}
          className="min-w-0 flex-1"
          borderRadius="0.75rem"
          buttonClassName="px-3 py-1.5 rounded-xl text-xs"
        />
      </div>

      <AnimatePresence initial={false}>
        {filtersOpen && (
          <motion.div
            key="profile-filters"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-y-clip overflow-x-visible"
          >
            <ProfileFilterPanel
              filters={filters}
              onChange={onFiltersChange}
              onReset={onFiltersReset}
              showPostType={showPostType}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active filters, always visible — a chip is the only thing that
          explains an empty tab once the panel is closed again. */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {!!categoryLabel && (
            <button
              type="button"
              data-filter-chip
              data-active="true"
              onClick={() => onFiltersChange({ ...filters, category: null })}
              className={CHIP_CLASS}
            >
              <span className="leading-[1]">{categoryLabel}</span>
              <span className="text-white/40 hover:text-white text-[10px] leading-[1] -mt-px">✕</span>
            </button>
          )}
          {filters.date !== 'all' && !!dateLabel && (
            <button
              type="button"
              data-filter-chip
              data-active="true"
              onClick={() => onFiltersChange({ ...filters, date: 'all' })}
              className={CHIP_CLASS}
            >
              <span className="leading-[1]">{dateLabel}</span>
              <span className="text-white/40 hover:text-white text-[10px] leading-[1] -mt-px">✕</span>
            </button>
          )}
          {postTypeActive && !!postTypeLabel && (
            <button
              type="button"
              data-filter-chip
              data-active="true"
              onClick={() => onFiltersChange({ ...filters, postType: 'all' })}
              className={CHIP_CLASS}
            >
              <span className="leading-[1]">{postTypeLabel}</span>
              <span className="text-white/40 hover:text-white text-[10px] leading-[1] -mt-px">✕</span>
            </button>
          )}
          {accessChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              data-filter-chip
              data-active="true"
              onClick={() => onFiltersChange({ ...filters, [chip.key]: false })}
              className={CHIP_CLASS}
            >
              <span className="leading-[1]">{t(chip.labelKey, chip.fallback)}</span>
              <span className="text-white/40 hover:text-white text-[10px] leading-[1] -mt-px">✕</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onFiltersReset}
            className="px-2 py-1 rounded-lg text-[10px] text-zinc-500 hover:text-white transition-colors"
          >
            {t('explorePage.clearAll', 'Clear all')}
          </button>
        </div>
      )}

      {!!search.trim() && !isLoading && (
        <p className="text-xs text-zinc-500">
          {resultCount === 1
            ? t('profile.searchResultCount', '1 result for "{{query}}"', { query: search.trim() })
            : t('profile.searchResultCountPlural', '{{count}} results for "{{query}}"', {
                count: resultCount,
                query: search.trim(),
              })}
        </p>
      )}
    </div>
  );
}

/**
 * Profile Content Toolbar
 * =======================
 * Sort and search over one creator's own posts — the two things a channel page
 * has always been missing. Both run server-side (`/api/feed` takes
 * `sortBy`/`sortOrder`/`search` next to `minter`), so "oldest first" really is
 * the creator's first upload and a search covers everything they ever posted,
 * not just the pages already scrolled into memory.
 *
 * Rendered above the tab panels rather than inside the sticky pill: the pill
 * carries the swallow clip, and anything added to it changes where the feed
 * below gets cut.
 *
 * @module components/app/profile/ProfileContentToolbar
 */

import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import type { ProfileSortMode } from '@/hooks/use-dehub-profile';

interface ProfileContentToolbarProps {
  sort: ProfileSortMode;
  onSortChange: (sort: ProfileSortMode) => void;
  search: string;
  onSearchChange: (search: string) => void;
  /** Items currently rendered under the toolbar — shown while a search runs. */
  resultCount: number;
  isLoading: boolean;
}

export function ProfileContentToolbar({
  sort,
  onSortChange,
  search,
  onSearchChange,
  resultCount,
  isLoading,
}: ProfileContentToolbarProps) {
  const { t } = useTranslation();

  const sortItems: { key: ProfileSortMode; label: string }[] = [
    { key: 'newest', label: t('profile.sortNewest', 'Newest') },
    { key: 'oldest', label: t('profile.sortOldest', 'Oldest') },
    { key: 'views', label: t('profile.sortMostViewed', 'Most viewed') },
    { key: 'likes', label: t('profile.sortMostLiked', 'Most liked') },
  ];

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-56 sm:flex-shrink-0">
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

        <GlassFilterRow
          items={sortItems}
          activeKey={sort}
          onSelect={onSortChange}
          className="min-w-0 flex-1"
          borderRadius="0.75rem"
          buttonClassName="px-3 py-1.5 rounded-xl text-xs"
        />
      </div>

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

/**
 * Profile Filter Panel
 * ====================
 * The home feed's filter panel, narrowed to one creator's channel: category,
 * upload date, post type and content access. Same rows, same chips, same
 * `/api/feed` parameters — a visitor who has used the filters on Home already
 * knows this one.
 *
 * Every row is server-side (see `ProfileContentFilters`), so the tab counts
 * above always describe the list below. That does mean a filter can empty the
 * tab you are standing on — the same thing the channel search already does —
 * which is why the active chips render above the content rather than inside
 * this panel, where a closed panel would hide them.
 *
 * Categories are fetched on mount, and this component is only mounted while
 * the panel is open, so an unopened panel costs nothing.
 *
 * @module components/app/profile/ProfileFilterPanel
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { getCategories } from '@/lib/api/dehub';
import {
  DATE_FILTER_OPTIONS,
  POST_TYPE_FILTERS,
  CONTENT_TYPE_FILTERS,
  type DateFilterValue,
  type PostTypeFilterValue,
  type ContentTypeFilterValue,
} from '@/lib/feed-utils';
import type { ProfileContentFilters } from '@/hooks/use-dehub-profile';

/** Same label mapping the home feed's panel uses, so the two rows read alike. */
function postTypeLabelKey(value: PostTypeFilterValue): string {
  switch (value) {
    case 'all': return 'all';
    case 'video': return 'videos';
    case 'feed-images': return 'images';
    case 'feed-audio': return 'audio';
    default: return 'text';
  }
}

interface ProfileFilterPanelProps {
  filters: ProfileContentFilters;
  onChange: (filters: ProfileContentFilters) => void;
  onReset: () => void;
  /**
   * Whether to offer the post-type row. Only the All tab does: every other
   * content tab already IS a post type, and a control that can contradict the
   * tab would empty it with nothing on screen to explain why.
   */
  showPostType: boolean;
}

export function ProfileFilterPanel({ filters, onChange, onReset, showPostType }: ProfileFilterPanelProps) {
  const { t } = useTranslation();
  const [categorySearch, setCategorySearch] = useState('');

  // Shares the home feed's cache entry, so opening this after browsing Home
  // costs no request at all.
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
      className="relative flex flex-col gap-4 rounded-xl border border-white/[0.12] bg-white/[0.03] backdrop-blur-[24px] px-2 sm:px-3 py-3"
    >
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
              buttonClassName="px-3 py-2 rounded-xl text-sm"
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

      {/* Post type */}
      {showPostType && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-zinc-500 uppercase tracking-wider">{t('filters.postType')}</span>
          <div className="relative">
            <GlassFilterRow
              items={POST_TYPE_FILTERS.map((o) => ({ key: o.value, label: t(`filters.${postTypeLabelKey(o.value)}`, o.label) }))}
              activeKey={filters.postType}
              onSelect={(key) => onChange({ ...filters, postType: key as PostTypeFilterValue })}
              borderRadius="0.75rem"
              buttonClassName="px-3 py-2 rounded-xl text-sm"
            />
          </div>
        </div>
      )}

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

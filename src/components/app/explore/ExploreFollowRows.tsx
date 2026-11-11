/**
 * Explore on phones: a people section as one line per person.
 *
 * Follow suggestions and New members both draw this when Explore asks for
 * rows. It lives in its own module, loaded only then, so the home feed's copy
 * of those carousels does not carry it on first paint.
 *
 * @module components/app/explore/ExploreFollowRows
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { FollowRow } from '@/components/app/FollowRow';
import { ExploreListSection } from '@/components/app/explore/ExploreListSection';
import type { ThemeIconKey } from '@/components/app/war/WarHudIcon';
import type { SuggestedAccount } from '@/lib/api/dehub';

/** Rows shown before See all. */
const ROWS_COLLAPSED = 4;

export interface ExploreFollowRowItem {
  user: SuggestedAccount;
  phase?: 'following' | 'leaving';
  followedLabel?: string;
  meta?: string;
}

export default function ExploreFollowRows({
  id,
  icon,
  title,
  items,
  onOpen,
  onFollow,
  onLoadMore,
  loadingMore,
  ...data
}: {
  id?: string;
  icon: ThemeIconKey;
  title: ReactNode;
  items: ExploreFollowRowItem[];
  onOpen: (user: SuggestedAccount) => void;
  onFollow: (user: SuggestedAccount) => void;
  /** Shown under the open list while the server has more. */
  onLoadMore?: () => void;
  loadingMore?: boolean;
} & Record<`data-${string}`, string | boolean | undefined>) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, ROWS_COLLAPSED);

  return (
    <ExploreListSection
      id={id}
      icon={icon}
      title={title}
      action={items.length > ROWS_COLLAPSED ? (expanded ? t('settings.showLess', { defaultValue: 'Show less' }) : t('feed.seeAll', { defaultValue: 'See all' })) : undefined}
      onAction={() => setExpanded((v) => !v)}
      chevron={!expanded}
      data-follow-cards
      data-follow-surface="explore-rows"
      {...data}
    >
      {shown.map((item) => (
        <FollowRow
          key={item.user.address}
          user={item.user}
          phase={item.phase}
          followedLabel={item.followedLabel}
          meta={item.meta}
          onOpen={onOpen}
          onFollow={onFollow}
        />
      ))}
      {expanded && onLoadMore && (
        <button
          type="button"
          onClick={() => onLoadMore()}
          disabled={loadingMore}
          className="mt-1 flex h-10 w-full items-center justify-center gap-2 text-[13px] font-medium text-zinc-400"
        >
          {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('common.loadMore', { defaultValue: 'Load more' })}
        </button>
      )}
    </ExploreListSection>
  );
}

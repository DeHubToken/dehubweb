import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { NewPostAuthor } from '@/hooks/use-unified-feed';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const FACE = 22;
const FACE_OVERLAP = 7;
/** How far the drawer's top runs up under the pill. Its slot clips at the
 *  pill's bottom edge, so this part never shows: no seam, no gap. */
const TUCK = 12;
const HEIGHT = 36;
/** What the drawer adds under the pill, for the room the feed leaves it. */
export const FEED_DRAWER_HEIGHT = HEIGHT;

export interface FeedDrawerFilters {
  /** Each active filter as a word: Articles, 1w, Most liked, #music… */
  labels: string[];
  /** Name of the saved preset these filters match, if any. */
  presetName?: string | null;
  onOpen: () => void;
  onClearAll: () => void;
  /** One hashtag and nothing else: Follow the tag from the drawer. */
  follow?: { following: boolean; pending: boolean; onToggle: () => void } | null;
}

/** The drawer that pulls out from under the feed's nav pill, in the pill's own
 *  liquid glass. The pill's own border is untouched; it casts a soft shade onto
 *  the drawer's top. When the nav hides (html[data-nav-hidden]) the drawer
 *  slides back under it first, and pulls back out after the nav returns
 *  (glass-surfaces.css).
 *
 *  It shows the active filters as words ("Articles · 1w · Most liked") with a
 *  ✕ that clears them. When new posts arrive it shows "N new posts" with up to
 *  three faces instead, until tapped (which loads them), then the filters come
 *  back. With no filters it only appears for new posts. */
export function NewPostsBead({ count, authors, onShow, filters }: {
  count: number;
  authors: NewPostAuthor[];
  onShow: () => void;
  filters?: FeedDrawerFilters | null;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const faces = authors.slice(0, 3);
  const showingNew = count > 0 || !filters;

  return (
    <motion.div
      data-feed-new-posts-chip-root
      initial={{ y: '-100%' }}
      animate={{ y: 0 }}
      exit={{ y: '-100%', pointerEvents: 'none' }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
      className="pointer-events-none flex min-w-0 max-w-full justify-center"
    >
      <div
        data-feed-new-posts-chip
        data-feed-drawer={showingNew ? 'new-posts' : 'filters'}
        className="pointer-events-auto relative flex min-w-[180px] max-w-[min(100%,560px)] items-end justify-center whitespace-nowrap text-[13px] font-semibold tabular-nums"
        style={{ marginTop: -TUCK, height: HEIGHT + TUCK }}
      >
        {/* The pill's own glass layer (glass-surfaces.css): same blur, tint
            and rim, so the drawer's border is the pill's border. */}
        <span data-nav-glass-backdrop aria-hidden="true" />
        <span data-feed-new-posts-shade aria-hidden="true" />
        {showingNew ? (
          <button
            type="button"
            onClick={onShow}
            className="flex h-full w-full items-end justify-center gap-2 pb-[7px] pl-2 pr-3.5"
          >
            {faces.length > 0 && (
              <span className="flex">
                {faces.map((author, i) => (
                  <Avatar
                    key={author.address}
                    data-feed-new-posts-face
                    className="block shrink-0 overflow-hidden rounded-[7px]"
                    style={{ width: FACE, height: FACE, marginLeft: i ? -FACE_OVERLAP : 0, zIndex: 3 - i }}
                  >
                    <AvatarImage src={author.avatarUrl} alt="" className="h-full w-full object-cover" />
                    <AvatarFallback className="rounded-[7px] text-[10px] font-bold uppercase">{author.name.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                ))}
              </span>
            )}
            <span className={faces.length ? undefined : 'pl-1.5'}>
              {t('feed.newPosts', { defaultValue: '{{count}} new posts', count })}
            </span>
          </button>
        ) : (
          <div className="flex h-full min-w-0 max-w-full items-end gap-1.5 pb-[6px] pl-1 pr-1.5">
            <button
              type="button"
              onClick={filters.onOpen}
              aria-label={t('feedFilters.show', 'Show filters')}
              className="min-w-0 truncate pb-[3px] pl-2.5 pr-1 text-left"
            >
              {filters.presetName && (
                <>
                  <span>{filters.presetName}</span>
                  <span className="opacity-50"> · </span>
                </>
              )}
              {filters.labels.map((label, i) => (
                <span key={label}>
                  {i > 0 && <span className="opacity-50"> · </span>}
                  {label}
                </span>
              ))}
            </button>
            {filters.follow && (
              <button
                type="button"
                onClick={filters.follow.onToggle}
                disabled={filters.follow.pending}
                aria-pressed={filters.follow.following}
                className="flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-semibold disabled:opacity-60"
                // Solid ink when not followed yet, a hairline once followed.
                style={filters.follow.following
                  ? { boxShadow: 'inset 0 0 0 1px color-mix(in srgb, currentColor 30%, transparent)' }
                  : { background: 'var(--chip-ink)', color: 'var(--chip-face-ring)' }}
              >
                {filters.follow.following ? t('followedTags.following') : t('follow.follow')}
              </button>
            )}
            <button
              type="button"
              onClick={filters.onClearAll}
              aria-label={t('feedFilters.clearAll', 'Clear all filters')}
              className="flex size-6 shrink-0 items-center justify-center rounded-md opacity-90 [@media(hover:hover)]:hover:opacity-100"
              style={{ boxShadow: 'inset 0 0 0 1px color-mix(in srgb, currentColor 30%, transparent)' }}
            >
              <X className="size-3" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Watched Videos
 * ==============
 * "Hide watched" and the Watched marker, both fed by the watch history the
 * backend already keeps (`/api/my_watched_nfts`, the same list the Bookmarks
 * page shows).
 *
 * Videos only, on purpose. A watch record is written on a *unique view*, and
 * what counts as a view differs by card: a video needs 3 seconds or 10% of
 * actual playback, while an image or text post only has to sit on screen for
 * two seconds (see lib/view-tracker.ts). Hiding on the second signal would
 * quietly delete half the feed for scrolling past it, so the set is filtered
 * to `postType=video` server-side and the marker is a video-card thing.
 *
 * The preference is localStorage, not the account: it is a per-device viewing
 * habit, and the backend has no column for it — a named account setting has to
 * be whitelisted server-side or it is silently dropped on write.
 *
 * @module hooks/use-watched-videos
 */

import { useCallback, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWatchHistory } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';

const HIDE_WATCHED_KEY = 'feed-hide-watched';
const HIDE_WATCHED_EVENT = 'hide-watched-changed';

/** How deep into the history to look. 3 × 100 = the last 300 videos played. */
const HISTORY_PAGES = 3;
const HISTORY_PAGE_SIZE = 100;

/** Stable identity so consumers do not re-render on every miss. */
const EMPTY_SET: ReadonlySet<string> = new Set<string>();

function readHideWatched(): boolean {
  try {
    return localStorage.getItem(HIDE_WATCHED_KEY) === 'true';
  } catch {
    return false;
  }
}

function subscribeHideWatched(onChange: () => void) {
  // `storage` covers other tabs; the custom event covers this one, which never
  // fires `storage` for its own writes.
  window.addEventListener(HIDE_WATCHED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(HIDE_WATCHED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * The "hide watched" preference, shared by every feed that reads it.
 * Signed-out readers always get `false` — there is no history to hide by.
 */
export function useHideWatched(): [boolean, (value: boolean) => void] {
  const { isAuthenticated } = useAuth();
  const stored = useSyncExternalStore(subscribeHideWatched, readHideWatched, () => false);

  const setHideWatched = useCallback((value: boolean) => {
    try {
      localStorage.setItem(HIDE_WATCHED_KEY, String(value));
    } catch {
      // Private mode / storage full — the toggle still applies for this render.
    }
    window.dispatchEvent(new CustomEvent(HIDE_WATCHED_EVENT));
  }, []);

  return [isAuthenticated && stored, setHideWatched];
}

/**
 * Token IDs of videos this account has actually played.
 *
 * Only fetched when something is going to use it — passing `enabled: false`
 * keeps the three history requests off the wire for the majority of readers,
 * who never turn the toggle on.
 */
export function useWatchedVideoIds(enabled = true) {
  const { isAuthenticated, walletAddress } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['watched-video-ids', walletAddress?.toLowerCase() ?? null],
    queryFn: async () => {
      const ids = new Set<string>();
      for (let page = 0; page < HISTORY_PAGES; page++) {
        const response = await getWatchHistory(page, HISTORY_PAGE_SIZE, undefined, 'video');
        const items = response?.result ?? [];
        items.forEach(item => {
          if (item?.tokenId !== undefined && item?.tokenId !== null) ids.add(String(item.tokenId));
        });
        if (items.length < HISTORY_PAGE_SIZE) break;
      }
      return ids;
    },
    enabled: enabled && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return { watchedIds: data ?? EMPTY_SET, isLoading };
}

/** Whether one video is in the watched set — for the card marker. */
export function useIsWatchedVideo(tokenId?: string): boolean {
  const { watchedIds } = useWatchedVideoIds();
  return !!tokenId && watchedIds.has(String(tokenId));
}

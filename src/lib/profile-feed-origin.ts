/**
 * Profile feed origin
 * ===================
 * A post opened from a profile tab keeps going through that creator's posts of
 * the same format, in the tab's own order: open a text post from Posts and the
 * page continues into their next text posts, an image into their images, a
 * video into their videos (as Shorts on a phone).
 *
 * The profile tab provides the list it is showing (the exact content query, so
 * the post page reads the pages the profile already downloaded). A card opening
 * a post notes that list against the post's id; the post page and the Shorts
 * viewer look it up by id. The note is moved into the history entry, so Back,
 * Forward and a reload come back to the same continuation.
 */

import { createContext, useContext, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { UseDeHubUserContentOptions } from '@/hooks/use-dehub-profile';
import type { TabValue } from '@/components/app/profile/ProfileConstants';

export type ProfileFeedQuery = Pick<
  UseDeHubUserContentOptions,
  'userId' | 'viewerAddress' | 'sortMode' | 'search' | 'filters' | 'includeOwnScheduled'
>;

export interface ProfileFeedOrigin {
  tab: TabValue;
  query: ProfileFeedQuery;
}

/** Tabs whose list is one creator's posts in a server order a feed can continue. */
const CONTINUABLE_TABS: ReadonlySet<TabValue> = new Set(['home', 'posts', 'images', 'videos', 'songs', 'live', 'articles']);

export function isContinuableProfileTab(tab: TabValue): boolean {
  return CONTINUABLE_TABS.has(tab);
}

/**
 * Read at tap time rather than rendered from, so switching tabs does not
 * re-render every card on the profile.
 */
export interface ProfileFeedSource {
  current: ProfileFeedOrigin | null;
}

export const ProfileFeedOriginContext = createContext<ProfileFeedSource | null>(null);

/** The profile list a card is rendered in, or null outside a profile tab. */
export function useProfileFeedContext(): ProfileFeedSource | null {
  return useContext(ProfileFeedOriginContext);
}

/** A tap that never became a page view should not steer a later visit. */
const NOTE_TTL_MS = 2 * 60 * 1000;
const notes = new Map<string, { origin: ProfileFeedOrigin; at: number }>();

function bareId(id: string | number): string {
  return String(id).replace(/^(text|image|video)-/, '');
}

/** Called by a card as it opens a post from inside a profile tab. */
export function noteProfileFeedOpen(source: ProfileFeedSource | null | undefined, postId: string | number | undefined): void {
  const origin = source?.current;
  if (!origin || postId === undefined || postId === '') return;
  notes.set(bareId(postId), { origin, at: Date.now() });
}

/** The origin noted for this post, if it was opened from a profile just now. */
export function peekProfileFeedOrigin(postId: string | number | undefined): ProfileFeedOrigin | null {
  if (postId === undefined || postId === '') return null;
  const note = notes.get(bareId(postId));
  if (!note) return null;
  if (Date.now() - note.at > NOTE_TTL_MS) {
    notes.delete(bareId(postId));
    return null;
  }
  return note.origin;
}

/**
 * The profile list this post page continues into, or null for an ordinary
 * visit. Reads the history entry first, then a fresh note, which it copies onto
 * the entry (react-router keeps its state under `usr`).
 */
export function usePostProfileFeedOrigin(postId: string | undefined): ProfileFeedOrigin | null {
  const location = useLocation();
  const fromState = (location.state as { profileFeed?: ProfileFeedOrigin } | null)?.profileFeed ?? null;
  return useMemo(() => {
    if (fromState) return fromState;
    const noted = peekProfileFeedOrigin(postId);
    if (noted && typeof window !== 'undefined') {
      try {
        const entry = window.history.state ?? {};
        window.history.replaceState({ ...entry, usr: { ...(entry.usr ?? {}), profileFeed: noted } }, '');
      } catch {
        // A history entry that refuses state just loses the continuation on reload.
      }
    }
    return noted;
    // location.key: a new visit to the same id asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromState, postId, location.key]);
}

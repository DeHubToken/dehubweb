import { POST_STAGE_PHONE_QUERY } from '@/hooks/use-post-stage-phone';

/**
 * Phone post pages show comments as a half-screen sheet under the post, the
 * way Shorts does ("Pill Split"). The logo and the top pill stay where they
 * are, and the pill's Back closes the sheet before it leaves the post.
 */
let closer: (() => void) | null = null;

/** The open sheet registers how to close itself; null when it closes. */
export function setCommentsSplitCloser(close: (() => void) | null) {
  closer = close;
}

/** Closes the sheet if one is open. True when it did, so Back stops there. */
export function closeCommentsSplit(): boolean {
  if (!closer) return false;
  const close = closer;
  closer = null;
  close();
  return true;
}

/** Feed cards on a phone open their post with the comments already up. */
export function opensCommentsSplit(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(POST_STAGE_PHONE_QUERY).matches;
}

/** Route state a feed card passes so the post page opens its comments sheet. */
export interface CommentsSplitRouteState {
  fromFeed?: boolean;
  openComments?: boolean;
}

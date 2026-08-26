/**
 * Tap-gesture reactions
 * =====================
 * The contract between a media surface (which detects the gesture) and the
 * post's ActionBar (which owns the vote). They are far apart in the tree — the
 * thumbnail is inside the card, the bar is a sibling — so this goes through a
 * window CustomEvent keyed by post id rather than a prop drilled through both.
 *
 * The ladder, on every feed surface:
 *
 *   double tap → 👍 like
 *   triple tap → ❤️ love (an upgrade — the third tap replaces the like)
 *   hold       → the reaction tray
 *
 * A gesture only ever ADDS. Double-tapping something already liked does
 * nothing rather than toggling the like off, because the gesture is easy to
 * fire by accident and losing a like you meant to keep is worse than a tap that
 * appears to do nothing.
 */

/** Reactions the tap ladder can cast. Both are positive; see lib/reactions. */
export type TapReaction = 'like' | 'love';

/**
 * Kept under the old name so the surfaces already listening for it keep
 * working — `reaction` is new and absent means 'like'.
 */
export const DOUBLE_TAP_LIKE_EVENT = 'dehub:double-tap-like';

/** A hold on the media asks the post's ActionBar to open its reaction tray. */
export const OPEN_REACTIONS_EVENT = 'dehub:open-reactions';

export interface DoubleTapLikeEventDetail {
  postId: string;
  reaction?: TapReaction;
  /** Viewport coords of the tap, so the burst can start where the finger was. */
  x?: number;
  y?: number;
}

export interface OpenReactionsEventDetail {
  postId: string;
}

function dispatch<T>(name: string, detail: T) {
  try {
    window.dispatchEvent(new CustomEvent<T>(name, { detail }));
  } catch {
    /* a browser without CustomEvent is not one we can react on anyway */
  }
}

export function emitTapReaction(
  postId: string,
  reaction: TapReaction,
  point?: { x: number; y: number },
) {
  if (!postId) return;
  dispatch<DoubleTapLikeEventDetail>(DOUBLE_TAP_LIKE_EVENT, {
    postId: String(postId),
    reaction,
    x: point?.x,
    y: point?.y,
  });
}

/** Back-compat alias for the original double-tap-only callers. */
export function emitDoubleTapLike(postId: string) {
  emitTapReaction(postId, 'like');
}

export function emitOpenReactions(postId: string) {
  if (!postId) return;
  dispatch<OpenReactionsEventDetail>(OPEN_REACTIONS_EVENT, { postId: String(postId) });
}

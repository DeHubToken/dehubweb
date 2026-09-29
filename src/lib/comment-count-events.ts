const COMMENT_COUNT_EVENT = 'dehub:comment-count';

interface CommentCountDetail {
  tokenId: string;
  /** +1 for a comment posted, minus every row a delete took with it. */
  delta: number;
}

/**
 * Fold a fresh server count into the one on screen.
 *
 * `pending` is the net change this viewer made here that the server figure may
 * not include yet. While it is positive a lower server figure is the stale one,
 * so the higher number wins — which is also what happens with nothing pending.
 * After a delete it is negative, and then a higher server figure is the stale
 * one: taking the higher number there is what kept a deleted comment counted
 * on the card for as long as it stayed on screen.
 */
export function reconcileCommentCount(current: number, server: number, pending = 0): number {
  return pending < 0 ? Math.min(current, server) : Math.max(current, server);
}

function emitCommentCountChange(tokenId: string, delta: number): void {
  if (typeof window === 'undefined' || !delta) return;
  window.dispatchEvent(new CustomEvent<CommentCountDetail>(COMMENT_COUNT_EVENT, {
    detail: { tokenId: String(tokenId), delta },
  }));
}

export function emitCommentCreated(tokenId: string): void {
  emitCommentCountChange(tokenId, 1);
}

/**
 * A delete on the server takes the comment's whole reply subtree with it, so
 * `removed` is the comment plus every reply under it that was on screen.
 */
export function emitCommentsDeleted(tokenId: string, removed = 1): void {
  emitCommentCountChange(tokenId, -Math.max(1, removed));
}

export function subscribeToCommentCount(tokenId: string, onChange: (delta: number) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const expectedTokenId = String(tokenId);
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<CommentCountDetail>).detail;
    if (detail?.tokenId === expectedTokenId && detail.delta) onChange(detail.delta);
  };
  window.addEventListener(COMMENT_COUNT_EVENT, listener);
  return () => window.removeEventListener(COMMENT_COUNT_EVENT, listener);
}

const COMMENT_CREATED_EVENT = 'dehub:comment-created';

interface CommentCreatedDetail {
  tokenId: string;
}

export function reconcileCommentCount(current: number, server: number): number {
  return Math.max(current, server);
}

export function emitCommentCreated(tokenId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CommentCreatedDetail>(COMMENT_CREATED_EVENT, {
    detail: { tokenId: String(tokenId) },
  }));
}

export function subscribeToCommentCreated(tokenId: string, onCreated: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const expectedTokenId = String(tokenId);
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<CommentCreatedDetail>).detail;
    if (detail?.tokenId === expectedTokenId) onCreated();
  };
  window.addEventListener(COMMENT_CREATED_EVENT, listener);
  return () => window.removeEventListener(COMMENT_CREATED_EVENT, listener);
}

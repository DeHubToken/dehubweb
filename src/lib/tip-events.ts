/**
 * Post-tip broadcast. The tip modal knows a tip landed; the action bar that
 * opened it does not. One tiny pub/sub keeps the two independent.
 */
type Listener = (tokenId: string) => void;
const listeners = new Set<Listener>();

export function emitPostTipped(tokenId: string | number): void {
  const id = String(tokenId);
  listeners.forEach((fn) => fn(id));
}

export function subscribePostTipped(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Comment tips share the channel under a prefixed key, so they never light a post's gem. */
export const commentTipKey = (commentId: string | number) => `comment:${commentId}`;

/**
 * A tip went out with a message on this post. The comments list listens so it
 * can fetch the tip wall and land the new card with its glow.
 */
const messageListeners = new Set<Listener>();

export function emitTipMessageSent(tokenId: string | number): void {
  const id = String(tokenId);
  messageListeners.forEach((fn) => fn(id));
}

export function subscribeTipMessageSent(fn: Listener): () => void {
  messageListeners.add(fn);
  return () => { messageListeners.delete(fn); };
}

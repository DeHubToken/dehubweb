import { useSyncExternalStore } from 'react';

/**
 * Posts the viewer disliked this session. A dislike means "not for me", so the
 * feeds drop these at once (DislikeVanish) instead of waiting for the next
 * fetch; the API leaves them out of every later feed page on its own. Undoing
 * the dislike, from the post page or the profile Dislikes tab, brings it back.
 */
const hidden = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach(fn => fn());
}

export function hideDislikedPost(postId: string | number) {
  const id = String(postId);
  if (hidden.has(id)) return;
  hidden.add(id);
  emit();
}

export function restoreDislikedPost(postId: string | number) {
  if (hidden.delete(String(postId))) emit();
}

export function isDislikeHidden(postId: string | number | null | undefined): boolean {
  return postId != null && hidden.has(String(postId));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useDislikeHidden(postId: string | number | null | undefined): boolean {
  useSyncExternalStore(subscribe, () => version, () => version);
  return isDislikeHidden(postId);
}

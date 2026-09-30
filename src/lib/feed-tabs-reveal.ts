import { useSyncExternalStore } from 'react';

/**
 * System theme on phones: the home feed has no top bar or tab pill at rest,
 * only the island capsule (FeedIslandCapsule). Tapping the capsule's tab name
 * drops the tab pill in under it; the next scroll of the feed puts it away.
 */
let open = false;
const subscribers = new Set<() => void>();
let detachScroll: (() => void) | null = null;

function emit() {
  subscribers.forEach((cb) => cb());
}

function watchScroll() {
  const read = () => window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  const start = read();
  const onScroll = () => {
    if (Math.abs(read() - start) > 24) setFeedTabsOpen(false);
  };
  const targets: EventTarget[] = [window, document.body];
  targets.forEach((t) => t.addEventListener('scroll', onScroll, { passive: true }));
  return () => targets.forEach((t) => t.removeEventListener('scroll', onScroll));
}

export function setFeedTabsOpen(next: boolean) {
  if (open === next) return;
  open = next;
  detachScroll?.();
  detachScroll = next ? watchScroll() : null;
  emit();
}

export function toggleFeedTabs() {
  setFeedTabsOpen(!open);
}

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

export function useFeedTabsOpen() {
  return useSyncExternalStore(subscribe, () => open, () => false);
}

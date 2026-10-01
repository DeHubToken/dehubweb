import { useSyncExternalStore } from 'react';

let target: HTMLDivElement | null = null;
const listeners = new Set<() => void>();

export function setFeedIslandPortal(node: HTMLDivElement | null) {
  if (target === node) return;
  target = node;
  listeners.forEach((notify) => notify());
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
};

export function useFeedIslandPortal() {
  return useSyncExternalStore(subscribe, () => target, () => null);
}

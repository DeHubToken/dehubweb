/**
 * Opens the badge showcase from anywhere a badge is drawn.
 *
 * BadgeIcon sits in the entry bundle, so this is a few lines of state and
 * nothing else; the showcase itself (three.js and all) is a separate chunk
 * that BadgeShowcaseHost loads the first time someone asks for it.
 */
import { useSyncExternalStore } from 'react';

export interface BadgeShowcaseRequest {
  /** Tier that was clicked. */
  tier: string | null;
  /** The clicked badge, which the showcase flies out of and back into. */
  anchor: HTMLElement | null;
  /** Changes on every open so reopening the same badge starts fresh. */
  id: number;
}

let current: BadgeShowcaseRequest | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function openBadgeShowcase(tier: string | null, anchor: HTMLElement | null) {
  current = { tier, anchor, id: ++sequence };
  emit();
}

export function closeBadgeShowcase() {
  if (!current) return;
  current = null;
  emit();
}

export function useBadgeShowcaseRequest(): BadgeShowcaseRequest | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Start fetching the showcase chunk, so a click opens it without a wait. */
export function preloadBadgeShowcase() {
  return import('@/components/app/badge-showcase/BadgeShowcase');
}

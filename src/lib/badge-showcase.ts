/**
 * Opens a badge showcase from anywhere a badge is drawn.
 *
 * BadgeIcon sits in the entry bundle, so this is a few lines of state and
 * nothing else; the showcases themselves (three.js and all) are separate
 * chunks that BadgeShowcaseHost loads the first time someone asks for one.
 */
import { useSyncExternalStore } from 'react';
import type { StreamerBadgeId } from '@/lib/streamer-badge-art';

interface RequestBase {
  /** The clicked badge, which the showcase flies out of and back into. */
  anchor: HTMLElement | null;
  /** Changes on every open so reopening the same badge starts fresh. */
  id: number;
}

/** A staking tier next to someone's name. */
export interface HolderShowcaseRequest extends RequestBase {
  kind: 'holder';
  tier: string | null;
  /**
   * Set when this opens as a promotion: the tier left behind (null for a
   * first badge). The showcase then opens with the ascension instead of a
   * plain flight.
   */
  promotedFrom?: string | null;
}

/** A collectible card on a streamer's ladder. */
export interface StreamerShowcaseRequest extends RequestBase {
  kind: 'streamer';
  badgeId: StreamerBadgeId;
  /** Whose ladder it is. */
  address: string;
  /** True on your own ladder, where earned cards can be equipped. */
  canSelect: boolean;
}

export type BadgeShowcaseRequest = HolderShowcaseRequest | StreamerShowcaseRequest;

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
  current = { kind: 'holder', tier, anchor, id: ++sequence };
  emit();
}

/** Open the showcase on a tier just reached, playing the promotion first. */
export function openBadgePromotion(from: string | null, to: string, anchor: HTMLElement | null) {
  current = { kind: 'holder', tier: to, promotedFrom: from, anchor, id: ++sequence };
  emit();
}

export function openStreamerShowcase(
  badgeId: StreamerBadgeId,
  address: string,
  canSelect: boolean,
  anchor: HTMLElement | null,
) {
  current = { kind: 'streamer', badgeId, address, canSelect, anchor, id: ++sequence };
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

/** Start fetching the holder showcase chunk, so a click opens it without a wait. */
export function preloadBadgeShowcase(tier?: string, replace = true) {
  return import('@/components/app/badge-showcase/BadgeShowcase').then(module => {
    if (tier) module.warmHolderBadge(tier, replace);
    return module;
  });
}

/** Start fetching the streamer showcase chunk. */
export function preloadStreamerShowcase() {
  return import('@/components/app/badge-showcase/StreamerShowcase');
}

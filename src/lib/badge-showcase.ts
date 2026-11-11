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
let openedAt = 0;

/** Where the loading stand-in left the badge, so the showcase carries on from there. */
export interface ShowcaseHandoff {
  id: number;
  box: { x: number; y: number; size: number } | null;
  /** The art that copy was showing. */
  art: string | null;
}
let handoff: { id: number; copy: HTMLImageElement | null } | null = null;

/**
 * A second tap that lands this soon after the one that opened the showcase is
 * the same gesture (a double tap, or a tap repeated because the first looked
 * ignored), not a request to close it.
 */
const TAP_GRACE_MS = 700;

/** True while a tap on the backdrop should be ignored rather than close. */
export function badgeShowcaseJustOpened(): boolean {
  return performance.now() - openedAt < TAP_GRACE_MS;
}

/** The loading stand-in registers itself (and its copy of the badge, if any). */
export function setBadgeShowcaseHandoff(copy: HTMLImageElement | null) {
  if (current) handoff = { id: current.id, copy };
}

/**
 * Set when the request on screen was already dimmed by the loading stand-in.
 * Read as the showcase first renders, while that copy is still on screen.
 */
export function badgeShowcaseHandoff(): ShowcaseHandoff | null {
  if (!handoff || !current || handoff.id !== current.id) return null;
  const { id, copy } = handoff;
  const r = copy?.isConnected ? copy.getBoundingClientRect() : null;
  if (!copy || !r || r.width === 0) return { id, box: null, art: null };
  return { id, box: { x: r.left, y: r.top, size: r.width }, art: copy.currentSrc || copy.src || null };
}
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
  openedAt = performance.now();
  emit();
}

/** Open the showcase on a tier just reached, playing the promotion first. */
export function openBadgePromotion(from: string | null, to: string, anchor: HTMLElement | null) {
  current = { kind: 'holder', tier: to, promotedFrom: from, anchor, id: ++sequence };
  openedAt = performance.now();
  emit();
}

export function openStreamerShowcase(
  badgeId: StreamerBadgeId,
  address: string,
  canSelect: boolean,
  anchor: HTMLElement | null,
) {
  current = { kind: 'streamer', badgeId, address, canSelect, anchor, id: ++sequence };
  openedAt = performance.now();
  emit();
}

export function closeBadgeShowcase() {
  if (!current) return;
  current = null;
  handoff = null;
  emit();
}

export function useBadgeShowcaseRequest(): BadgeShowcaseRequest | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Start fetching the holder showcase chunk, so a click opens it without a wait. */
export function preloadBadgeShowcase(tier?: string, replace = true) {
  return import('@/components/app/badge-showcase/BadgeShowcase').then(module => {
    holderShowcase = module.default;
    if (tier) module.warmHolderBadge(tier, replace);
    return module;
  });
}

/** Start fetching the streamer showcase chunk. */
export function preloadStreamerShowcase() {
  return import('@/components/app/badge-showcase/StreamerShowcase').then(module => {
    streamerShowcase = module.default;
    return module;
  });
}

type HolderShowcase = typeof import('@/components/app/badge-showcase/BadgeShowcase').default;
type StreamerShowcase = typeof import('@/components/app/badge-showcase/StreamerShowcase').default;
let holderShowcase: HolderShowcase | null = null;
let streamerShowcase: StreamerShowcase | null = null;

/**
 * The showcases once their code has arrived. A lazy component suspends for a
 * beat even when its chunk is already here, which flashed the loading
 * stand-in on every first open; rendering these directly skips that.
 */
export function loadedBadgeShowcase(): HolderShowcase | null {
  return holderShowcase;
}
export function loadedStreamerShowcase(): StreamerShowcase | null {
  return streamerShowcase;
}

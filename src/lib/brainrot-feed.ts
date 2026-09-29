/**
 * Brainrot feed
 * =============
 * The endless shorts feed a phone drops into when someone watching a video
 * fullscreen swipes up — "scroll down" past the video they were on, the way
 * every short-video app works.
 *
 * It is a mix of five ranked lists from /api/feed, not one sort:
 *
 *   trending        most viewed in the last week
 *   new             newest first
 *   mostViewed      all-time most viewed
 *   mostLiked       all-time most liked
 *   mostCommented   all-time most commented
 *
 * `BRAINROT_PATTERN` deals them out in a fixed rotation — trending and new get
 * two slots in seven each, so the feed feels alive, and the three all-time
 * lists one each, so proven hits keep coming round. Within a list the order is
 * the server's ranking with a light shuffle in blocks of four, seeded per
 * opening, so two sessions don't start on the identical clip but the top of
 * each list still comes first.
 *
 * On top of the rotation:
 *  - a clip only plays once, however many lists it tops;
 *  - the video the person swiped away from is never the first thing back;
 *  - clips this account has already watched wait until the fresh ones run out;
 *  - the same creator never plays twice in a row when another pick is close by;
 *  - paid, locked, subscriber-only, bounty and mature posts stay out, because
 *    the shorts viewer has no gate for any of them.
 *
 * The open/close flag lives here, in a module small enough for the app shell,
 * so the viewer and its five queries load only once somebody actually swipes.
 *
 * @module lib/brainrot-feed
 */

import { useEffect, useState } from 'react';
import type { UnifiedFeedParams } from '@/hooks/use-unified-feed';

// ============================================================================
// THE LISTS
// ============================================================================

export type BrainrotBucket = 'trending' | 'new' | 'mostViewed' | 'mostLiked' | 'mostCommented';

/** Page size for every list. A multiple of `SHUFFLE_BLOCK`, see windowShuffle. */
export const BRAINROT_PAGE_SIZE = 12;

const BASE = { postType: 'video', status: 'all', sortOrder: 'desc' } as const;

/** One /api/feed query per list. Keys are shared with the prefetch below. */
export const BRAINROT_QUERIES: Record<BrainrotBucket, Omit<UnifiedFeedParams, 'page' | 'limit'>> = {
  trending: { ...BASE, sortBy: 'views', range: 'week' },
  new: { ...BASE, sortBy: 'createdAt' },
  mostViewed: { ...BASE, sortBy: 'views' },
  mostLiked: { ...BASE, sortBy: 'likes' },
  mostCommented: { ...BASE, sortBy: 'comments' },
};

export const BRAINROT_BUCKETS = Object.keys(BRAINROT_QUERIES) as BrainrotBucket[];

/** Which list fills each slot, repeating. */
export const BRAINROT_PATTERN: readonly BrainrotBucket[] = [
  'trending',
  'mostViewed',
  'new',
  'trending',
  'mostLiked',
  'new',
  'mostCommented',
];

// ============================================================================
// THE MIX
// ============================================================================

/** The fields of a feed row the mix reads. Anything else passes through. */
export interface BrainrotPost {
  tokenId?: number | string;
  id?: number | string;
  minter?: string;
  contentRating?: string;
  transcodingStatus?: string;
  is_ppv?: boolean;
  is_w2e?: boolean;
  isUnlocked?: boolean;
  plansDetails?: unknown[];
  streamInfo?: {
    isPayPerView?: boolean;
    isLockContent?: boolean;
    lockContentAmount?: number | string;
    isAddBounty?: boolean;
  };
}

export interface BrainrotListInput<T> {
  items: T[];
  /** No further pages exist (or the list failed) — nothing more is coming. */
  done: boolean;
}

export interface BrainrotMix<T> {
  items: T[];
  /**
   * The list the rotation paused on because it needs its next page, or null
   * when every list is finished. Fetch this one to keep the feed going.
   */
  waitingOn: BrainrotBucket | null;
}

export interface BrainrotMixOptions {
  /** Changes the shuffle; one per opening. */
  seed: number;
  /** Never emitted — the video the person swiped away from. */
  excludeIds?: ReadonlySet<string>;
  /** Held back until every list has run dry. */
  watchedIds?: ReadonlySet<string>;
}

/** How far ahead a pick may reach to avoid the same creator twice in a row. */
const CREATOR_LOOKAHEAD = 3;
/** Shuffle block. Must divide BRAINROT_PAGE_SIZE so later pages never reshuffle earlier ones. */
const SHUFFLE_BLOCK = 4;

export function postId(post: BrainrotPost): string {
  return String(post.tokenId ?? post.id ?? '');
}

function creatorOf(post: BrainrotPost): string {
  return (post.minter || '').toLowerCase();
}

/** Whether a clip can play in the shorts viewer as-is. */
export function isBrainrotPlayable(post: BrainrotPost): boolean {
  if (!postId(post)) return false;
  if (post.transcodingStatus && post.transcodingStatus !== 'done') return false;
  if (post.contentRating && post.contentRating !== 'safe' && post.contentRating !== 'general') return false;
  const info = post.streamInfo;
  if (post.is_ppv || info?.isPayPerView) return false;
  if (post.is_w2e || info?.isAddBounty) return false;
  if (!post.isUnlocked && info?.isLockContent && Number(info.lockContentAmount) > 0) return false;
  if (!post.isUnlocked && post.plansDetails?.length) return false;
  return true;
}

/** Small, fast, seedable PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffle inside consecutive blocks only. Each block is seeded by its own
 * position, so appending a page never reorders what came before it — the
 * viewer is index-based and an earlier clip moving would jump the person.
 */
export function windowShuffle<T>(items: readonly T[], seed: number, block = SHUFFLE_BLOCK): T[] {
  const out = items.slice();
  for (let start = 0; start < out.length; start += block) {
    const end = Math.min(start + block, out.length);
    const rand = mulberry32(seed ^ Math.imul(start + 1, 0x9e3779b1));
    for (let i = end - 1; i > start; i--) {
      const j = start + Math.floor(rand() * (i - start + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
  }
  return out;
}

/**
 * Deal the lists out into one feed.
 *
 * The walk stops as soon as a slot's list has nothing left to give *yet* but
 * still has pages to fetch, rather than letting the other lists jump the
 * queue — the viewer asks for more pages near the end, and the rotation picks
 * up where it paused. Only a list that is finished for good is skipped over.
 */
export function mixBrainrotFeed<T extends BrainrotPost>(
  lists: Record<BrainrotBucket, BrainrotListInput<T>>,
  { seed, excludeIds, watchedIds }: BrainrotMixOptions,
): BrainrotMix<T> {
  const used = new Set<string>(excludeIds);
  const heldBack: T[] = [];
  const queues = {} as Record<BrainrotBucket, T[]>;
  BRAINROT_BUCKETS.forEach((bucket, index) => {
    queues[bucket] = windowShuffle(lists[bucket]?.items ?? [], seed + index).filter(isBrainrotPlayable);
  });

  const out: T[] = [];
  let lastCreator = '';
  let waitingOn: BrainrotBucket | null = null;

  /** Next usable clip from a list, preferring a different creator from the last one. */
  const take = (bucket: BrainrotBucket): T | undefined => {
    const queue = queues[bucket];
    let fallback = -1;
    let seen = 0;
    for (let i = 0; i < queue.length && seen < CREATOR_LOOKAHEAD; i++) {
      const id = postId(queue[i]);
      if (used.has(id)) {
        queue.splice(i--, 1);
        continue;
      }
      if (watchedIds?.has(id)) {
        used.add(id);
        heldBack.push(queue[i]);
        queue.splice(i--, 1);
        continue;
      }
      seen++;
      if (fallback < 0) fallback = i;
      if (creatorOf(queue[i]) !== lastCreator || !lastCreator) {
        return queue.splice(i, 1)[0];
      }
    }
    return fallback >= 0 ? queue.splice(fallback, 1)[0] : undefined;
  };

  for (let slot = 0; ; slot++) {
    let picked: T | undefined;
    for (let tries = 0; tries < BRAINROT_PATTERN.length && !picked && !waitingOn; tries++) {
      const bucket = BRAINROT_PATTERN[(slot + tries) % BRAINROT_PATTERN.length];
      picked = take(bucket);
      if (!picked && !lists[bucket]?.done) waitingOn = bucket;
    }
    if (!picked) break;
    used.add(postId(picked));
    lastCreator = creatorOf(picked);
    out.push(picked);
  }

  // Everything fresh is out and nothing more is coming: replay the watched ones.
  if (!waitingOn) out.push(...heldBack);
  return { items: out, waitingOn };
}

/**
 * Grow a feed without disturbing what is already on screen: keep every clip
 * already handed to the viewer in place, and add only new ones after them.
 */
export function appendStable<T>(previous: readonly T[], next: readonly T[], idOf: (item: T) => string): T[] {
  const seen = new Set(previous.map(idOf));
  const added = next.filter(item => !seen.has(idOf(item)));
  return added.length ? [...previous, ...added] : (previous as T[]);
}

// ============================================================================
// THE GESTURE
// ============================================================================

/** How far a finger has to travel up before it counts as "next". */
export const BRAINROT_SWIPE_MIN_PX = 60;

/** A clearly vertical flick upwards — the "scroll down" of a short-video app. */
export function isBrainrotSwipe(start: { x: number; y: number }, end: { x: number; y: number }): boolean {
  const dy = end.y - start.y;
  const dx = end.x - start.x;
  return dy <= -BRAINROT_SWIPE_MIN_PX && Math.abs(dy) > Math.abs(dx) * 1.5;
}

/**
 * Touch is the main input (phones, tablets). These get the page's own
 * fullscreen rather than the system video player, which keeps every touch to
 * itself — so the swipe that opens this feed could never be seen.
 */
export function isTouchPrimary(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches === true;
  } catch {
    return false;
  }
}

// ============================================================================
// OPEN / CLOSE
// ============================================================================

export interface BrainrotSession {
  /** Changes on every opening, so the host starts a fresh mix. */
  key: number;
  /** The video the person swiped away from. */
  fromId?: string;
}

let session: BrainrotSession | null = null;
let everOpened = false;
const listeners = new Set<() => void>();

function emit() {
  for (const notify of listeners) notify();
}

export function openBrainrotFeed(fromId?: string): void {
  session = { key: Date.now(), fromId };
  everOpened = true;
  emit();
}

export function closeBrainrotFeed(): void {
  if (!session) return;
  session = null;
  emit();
}

/** The open session, or null. */
export function useBrainrotSession(): BrainrotSession | null {
  const [value, setValue] = useState(session);
  useEffect(() => {
    const sync = () => setValue(session);
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return value;
}

/** True from the first opening on, so the app shell mounts the host once and keeps it. */
export function useBrainrotEverOpened(): boolean {
  const [value, setValue] = useState(everOpened);
  useEffect(() => {
    const sync = () => setValue(everOpened);
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return value;
}

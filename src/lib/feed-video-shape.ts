/**
 * Feed Video Shape
 * ================
 * How tall a vertical video may get in the feed. By default a clip keeps its
 * own shape, so a 9:16 video fills most of the screen. Some viewers would
 * rather scroll past a tidy row of cards: Square and Widescreen cap the frame
 * at 1:1 or 16:9 and show the whole clip letterboxed inside it.
 *
 * Only the feed frame changes. Landscape clips already fit either cap and look
 * the same, and the post page and fullscreen always show the real shape.
 *
 * Same small shape as lib/ad-load: read on the feed's hot path, edited by one
 * select in Settings, synced to the account in ViewingPreferencesSync.
 *
 * @module lib/feed-video-shape
 */

import { useSyncExternalStore } from 'react';

export type FeedVideoShape = 'original' | 'square' | 'wide';

/** Narrowest frame each choice allows, as width/height. */
export const FEED_VIDEO_MIN_ASPECT: Record<FeedVideoShape, number> = {
  original: 0,
  square: 1,
  wide: 16 / 9,
};

export const DEFAULT_FEED_VIDEO_SHAPE: FeedVideoShape = 'original';

const STORAGE_KEY = 'feed-video-shape';
const CHANGE_EVENT = 'feed-video-shape-changed';

export function normaliseFeedVideoShape(value: unknown): FeedVideoShape {
  return value === 'square' || value === 'wide' ? value : DEFAULT_FEED_VIDEO_SHAPE;
}

export function readFeedVideoShape(): FeedVideoShape {
  try {
    return normaliseFeedVideoShape(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_FEED_VIDEO_SHAPE;
  }
}

export function writeFeedVideoShape(value: FeedVideoShape) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode / quota — the choice still applies for this session */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useFeedVideoShape(): FeedVideoShape {
  return useSyncExternalStore(subscribe, readFeedVideoShape, () => DEFAULT_FEED_VIDEO_SHAPE);
}

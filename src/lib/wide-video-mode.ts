/**
 * Long form videos on wide screens (Settings → Appearance → Media).
 *
 * Desktop only. A video that is narrower than the column used to leave empty
 * black or blank space beside it. Each choice fills that space:
 *
 * - ambient: the frame runs the full column width and the space beside the
 *   picture shows the playing video itself, blurred and dimmed.
 * - rails:   the picture hugs its real shape with curved corners, between two
 *   glass pills: who posted it and what it is on the left, top comments on
 *   the right. Wide videos already fill the column and show as normal.
 * - theatre: like ambient, but the space is matte frosted glass with grain and
 *   the picture sits a little in from the edges, like a screen in a cinema.
 * - standard: the old look, the picture on its own.
 *
 * Phones and tablets never read this. Same small shape as lib/feed-video-shape.
 */
import { useSyncExternalStore } from 'react';

export type WideVideoMode = 'standard' | 'ambient' | 'rails' | 'theatre';
export const WIDE_VIDEO_MODES: readonly WideVideoMode[] = ['standard', 'ambient', 'rails', 'theatre'];
export const DEFAULT_WIDE_VIDEO_MODE: WideVideoMode = 'ambient';

/** Rails need room beside the picture: anything wider than this shows as normal. */
export const WIDE_RAILS_MAX_ASPECT = 1.25;

const STORAGE_KEY = 'dehub.wideVideoMode';
const CHANGE_EVENT = 'dehub:wide-video-mode';

export function isWideVideoMode(value: unknown): value is WideVideoMode {
  return typeof value === 'string' && (WIDE_VIDEO_MODES as readonly string[]).includes(value);
}

export function readWideVideoMode(): WideVideoMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isWideVideoMode(stored) ? stored : DEFAULT_WIDE_VIDEO_MODE;
  } catch {
    return DEFAULT_WIDE_VIDEO_MODE;
  }
}

export function writeWideVideoMode(mode: WideVideoMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useWideVideoMode(): WideVideoMode {
  return useSyncExternalStore(subscribe, readWideVideoMode, () => DEFAULT_WIDE_VIDEO_MODE);
}

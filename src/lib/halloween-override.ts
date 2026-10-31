/**
 * Halloween 2026: everyone sees the Horror theme until midnight on their own
 * clock. Nothing is saved; the person's chosen theme paints again on 1 Nov.
 * Picking a theme during the day opts this device out (the pick is honoured).
 * The inline head script in index.html mirrors this check; keep them in sync.
 */
export const HALLOWEEN_THEME = 'horror';
export const HALLOWEEN_OPT_OUT_KEY = 'dehub.halloween2026.optOut';

export function isHalloweenDay(now: Date = new Date()): boolean {
  return now.getFullYear() === 2026 && now.getMonth() === 9 && now.getDate() === 31;
}

export function readHalloweenOptOut(): boolean {
  try {
    return window.localStorage.getItem(HALLOWEEN_OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeHalloweenOptOut() {
  try {
    window.localStorage.setItem(HALLOWEEN_OPT_OUT_KEY, '1');
  } catch {
    // ignore quota / private-mode errors
  }
}

/** Milliseconds until the next local midnight (at least 1s). */
export function msUntilLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

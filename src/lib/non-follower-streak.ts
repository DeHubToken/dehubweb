/**
 * Notices someone unfollowing people who never followed them back, so the app
 * can offer to clear the rest in one go.
 *
 * Every unfollow answer from the server says whether that person followed you
 * (`followsYou`). Two non-followers in a row, within a few minutes, raise the
 * offer once. Unfollowing someone who does follow you resets the run. "Not now"
 * snoozes the offer for a week on this device; finishing the bulk unfollow
 * snoozes it for a day.
 */

const RUN_WINDOW_MS = 10 * 60 * 1000;
export const NOT_NOW_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const DONE_SNOOZE_MS = 24 * 60 * 60 * 1000;
const SNOOZE_KEY = 'dehub.nonFollowerOffer.snoozedUntil';

let run = 0;
let lastAt = 0;
let offeredThisOpen = false;
const listeners = new Set<() => void>();

export function subscribeNonFollowerOffer(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function snoozedUntil(): number {
  try { return Number(localStorage.getItem(SNOOZE_KEY)) || 0; } catch { return 0; }
}

export function snoozeNonFollowerOffer(ms: number) {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + ms)); } catch { /* private mode */ }
}

/** Called with the server's answer to every unfollow. `undefined` = an older server that does not say. */
export function noteUnfollow(followsYou: boolean | undefined, now = Date.now()) {
  if (followsYou === undefined) return;
  if (followsYou) { run = 0; return; }
  run = now - lastAt > RUN_WINDOW_MS ? 1 : run + 1;
  lastAt = now;
  if (run < 2 || offeredThisOpen || snoozedUntil() > now) return;
  offeredThisOpen = true;
  run = 0;
  listeners.forEach(cb => cb());
}

/** Tests only. */
export function resetNonFollowerStreak() {
  run = 0; lastAt = 0; offeredThisOpen = false;
}

/**
 * Quiet hours.
 *
 * The settings UI has stored these three localStorage keys for a while, but
 * nothing ever read them — the values were written and then ignored, so a user
 * who set quiet hours still received every notification. This module is the
 * missing half: the single place that decides whether "now" is silenced.
 *
 * Deliberately client-side. Web's notification preferences live on a backend we
 * do not control here, and delivery is decided server-side; gating the browser
 * notification at the point of display is the part we *can* make honest today.
 * Mobile persists quiet hours server-side (with a timezone) via its own
 * preferences blob — that remains the richer implementation, and if the two are
 * ever unified this local check should defer to the server's.
 *
 * Hours are whole numbers 0–23 in the viewer's local timezone, matching what the
 * settings drawer offers.
 */

export const QH_ENABLED_KEY = 'dehub_qh_enabled';
export const QH_START_KEY = 'dehub_qh_start';
export const QH_END_KEY = 'dehub_qh_end';

export const QH_DEFAULT_START = 22;
export const QH_DEFAULT_END = 8;

function readHour(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = parseInt(raw, 10);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
  } catch {
    return fallback;
  }
}

export interface QuietHoursState {
  enabled: boolean;
  start: number;
  end: number;
}

export function getQuietHours(): QuietHoursState {
  let enabled = false;
  try {
    enabled = localStorage.getItem(QH_ENABLED_KEY) === 'true';
  } catch {
    enabled = false;
  }
  return {
    enabled,
    start: readHour(QH_START_KEY, QH_DEFAULT_START),
    end: readHour(QH_END_KEY, QH_DEFAULT_END),
  };
}

/**
 * Whether `hour` falls inside the window. Windows normally wrap midnight
 * (22 → 8), so the wrapping case is the common one, not the edge case.
 *
 * start === end is treated as "not silenced" rather than "silenced all day":
 * a zero-width window is far more likely to be a mis-set control than a
 * deliberate request to mute everything forever.
 */
export function isHourWithin(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/** True when notifications should be suppressed right now. */
export function isQuietNow(now: Date = new Date()): boolean {
  const { enabled, start, end } = getQuietHours();
  if (!enabled) return false;
  return isHourWithin(now.getHours(), start, end);
}

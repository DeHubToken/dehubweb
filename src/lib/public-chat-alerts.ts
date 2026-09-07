/**
 * Public chat alerts — the preference
 * ===================================
 * Whether the platform chat is allowed to interrupt you while you are in
 * another tab, and how often it may do so at most.
 *
 * Off by default, and that is deliberate rather than cautious: public chat is
 * the one room on DeHub anybody can post in, so it is the one feed whose
 * volume nobody controls. A reader opting in is opting into a stranger's
 * typing speed, which is why the rate limit ships with the switch instead of
 * being a follow-up — see lib/notification-digest for what the limit spends
 * (cards, not messages) and why running out delays a notification rather than
 * dropping what it would have said.
 *
 * The ceiling is 69 an hour. Past roughly one a minute a notification stream
 * is not information any more, it is a denial of service the reader opted into
 * by accident, and the whole point of the control is that a raid cannot turn
 * into one.
 *
 * Tiny and context-free on purpose, like lib/video-glitch: the alert engine
 * reads it from a hook mounted in the app shell, Settings writes it, and the
 * account sync registers it once in ViewingPreferencesSync.
 *
 * @module lib/public-chat-alerts
 */

import { useSyncExternalStore } from 'react';

const ENABLED_KEY = 'dehub_public_chat_alerts';
const RATE_KEY = 'dehub_public_chat_alerts_per_hour';
const CHANGE_EVENT = 'dehub:public-chat-alerts-changed';

/** Highest number of cards an hour a reader may ask public chat for. */
export const PUBLIC_CHAT_MAX_PER_HOUR = 69;

/** Lowest — "one an hour", not "none": off is what the switch is for. */
export const PUBLIC_CHAT_MIN_PER_HOUR = 1;

/**
 * Six an hour: often enough that a conversation you care about reaches you
 * within ten minutes, rare enough that a busy evening cannot fill the tray.
 */
export const PUBLIC_CHAT_DEFAULT_PER_HOUR = 6;

/** The channel name the hourly budget is booked against. */
export const PUBLIC_CHAT_ALLOWANCE_CHANNEL = 'public-chat';

/** Keys in the account's synced preference blob (UserPreferencesContext). */
export const PUBLIC_CHAT_ALERTS_PREF_KEY = 'publicChatAlerts';
export const PUBLIC_CHAT_RATE_PREF_KEY = 'publicChatAlertsPerHour';

export function readPublicChatAlerts(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Clamp anything — a stored string, a synced value from another device. */
export function normalisePerHour(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return PUBLIC_CHAT_DEFAULT_PER_HOUR;
  return Math.min(PUBLIC_CHAT_MAX_PER_HOUR, Math.max(PUBLIC_CHAT_MIN_PER_HOUR, Math.round(n)));
}

export function readPublicChatPerHour(): number {
  try {
    const raw = localStorage.getItem(RATE_KEY);
    if (raw === null) return PUBLIC_CHAT_DEFAULT_PER_HOUR;
    return normalisePerHour(raw);
  } catch {
    return PUBLIC_CHAT_DEFAULT_PER_HOUR;
  }
}

function announce() {
  try {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* no window (tests, SSR) — the value is still written */
  }
}

export function writePublicChatAlerts(value: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, String(value));
  } catch {
    /* private mode / quota — the choice still applies for this session */
  }
  announce();
}

export function writePublicChatPerHour(value: number) {
  try {
    localStorage.setItem(RATE_KEY, String(normalisePerHour(value)));
  } catch {
    /* as above */
  }
  announce();
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function usePublicChatAlertsEnabled(): boolean {
  return useSyncExternalStore(subscribe, readPublicChatAlerts, () => false);
}

export function usePublicChatAlertsPerHour(): number {
  return useSyncExternalStore(
    subscribe,
    readPublicChatPerHour,
    () => PUBLIC_CHAT_DEFAULT_PER_HOUR,
  );
}

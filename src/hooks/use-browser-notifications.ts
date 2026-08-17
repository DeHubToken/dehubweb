/**
 * Browser Notifications Hook
 * ==========================
 * Manages browser notification permissions and delivery via localStorage persistence.
 * Permission is only requested on explicit user action (safe pattern).
 *
 * There are two pieces of state here and they are not the same thing:
 *
 *  - the **browser's permission** for this origin ('default' | 'granted' |
 *    'denied'). Only the browser can change it, a page can ask once, and a
 *    recorded 'denied' makes `requestPermission()` resolve instantly with no
 *    UI at all — nothing in the app can undo it.
 *  - our **stored flag**, the on/off the reader controls from Settings.
 *
 * Delivery needs both, so anything that shows this state to a reader has to
 * read the permission too — otherwise it happily reports "on" for a browser
 * that is silently dropping every notification.
 */

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { isQuietNow } from '@/lib/quiet-hours';

const STORAGE_KEY = 'dehub_browser_notifications';
const LAST_SEEN_KEY = 'dehub_notifications_last_seen';

/** Same-tab change signal — `storage` only fires in the *other* tabs. */
const ENABLED_EVENT = 'dehub:browser-notifications-changed';

/** Raised after the native prompt answers, since not every browser has the
 *  Permissions API to report it. */
const PERMISSION_EVENT = 'dehub:notification-permission-changed';

export function getStoredEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setStoredEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
  // The flag is now driven from three surfaces (the soft-ask toast, Settings →
  // Notifications, the notifications-page sheet). Without this they only
  // re-read on mount, so one would sit showing the opposite of the truth.
  try {
    window.dispatchEvent(new Event(ENABLED_EVENT));
  } catch {}
}

function subscribeStoredEnabled(onChange: () => void): () => void {
  window.addEventListener(ENABLED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(ENABLED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The stored on/off flag, kept in sync across every surface that shows it. */
export function useStoredEnabled(): boolean {
  return useSyncExternalStore(subscribeStoredEnabled, getStoredEnabled, () => false);
}

export function getLastSeenTimestamp(): number {
  try {
    return Number(localStorage.getItem(LAST_SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function setLastSeenTimestamp(ts: number) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, String(ts));
  } catch {}
}

/** 'unsupported' covers browsers with no Notification API (iOS Safari in a tab). */
export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

export function readNotificationPermission(): BrowserNotificationPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/**
 * The browser's permission for this origin, kept current.
 *
 * A reader who blocked us by accident fixes it in the browser's own UI (the
 * padlock menu, site settings), which fires nothing in the page. The
 * Permissions API reports the change live where it exists; the visibility and
 * focus listeners cover the rest, so coming back from a settings tab is enough
 * to un-stick the switch.
 */
export function useNotificationPermission(): BrowserNotificationPermission {
  const [permission, setPermission] = useState<BrowserNotificationPermission>(readNotificationPermission);

  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | undefined;
    const sync = () => {
      if (!cancelled) setPermission(readNotificationPermission());
    };

    // Safari only grew navigator.permissions recently and still rejects some
    // names, so this is strictly an upgrade over the event listeners below.
    navigator.permissions
      ?.query({ name: 'notifications' as PermissionName })
      .then((result) => {
        if (cancelled) return;
        status = result;
        result.addEventListener('change', sync);
        sync();
      })
      .catch(() => {});

    window.addEventListener(PERMISSION_EVENT, sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);

    return () => {
      cancelled = true;
      status?.removeEventListener('change', sync);
      window.removeEventListener(PERMISSION_EVENT, sync);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  return permission;
}

export function useBrowserNotifications() {
  const isEnabled = useStoredEnabled();
  // Track shown notification IDs to avoid duplicates within a session
  const shownRef = useRef<Set<string>>(new Set());

  const setEnabled = useCallback((enabled: boolean) => {
    setStoredEnabled(enabled);
  }, []);

  /**
   * @param onClick Where clicking the notification should take the reader.
   *   Without one, a delivered notification is inert — clicking it does not even
   *   raise the tab it came from, which reads as the notification being broken.
   *   The tab is focused first so the navigation happens somewhere visible.
   */
  const showNotification = useCallback((
    title: string,
    body: string,
    icon?: string,
    id?: string,
    onClick?: () => void,
  ) => {
    // Only show when tab is not focused, permission granted, and feature enabled
    if (!document.hidden) return;
    if (!getStoredEnabled()) return;
    // Quiet hours were written to localStorage but never read until now, so
    // this setting had no effect on delivery at all.
    if (isQuietNow()) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (id && shownRef.current.has(id)) return;

    try {
      const notification = new Notification(title, {
        body,
        icon: icon || '/favicon.ico',
        tag: id, // prevents duplicate OS-level notifications with same tag
      });
      if (id) shownRef.current.add(id);

      if (onClick) {
        notification.onclick = () => {
          try { window.focus(); } catch {}
          notification.close();
          onClick();
        };
      }

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    } catch {}
  }, []);

  return { isEnabled, setEnabled, showNotification };
}

/**
 * Fire one notification right now, ignoring the tab-hidden and quiet-hours
 * rules that gate real ones — this is the reader asking to see one.
 *
 * Returns false when the browser refused to construct it. That is the Android
 * Chrome case: `Notification.permission` can read 'granted' there while
 * `new Notification()` throws, because delivery needs a push-capable service
 * worker the app doesn't have. Enabling the setting fires one of these, so
 * that gap surfaces as an honest "not supported here" instead of a switch that
 * looks on and never delivers anything.
 */
export function showTestNotification(title: string, body: string): boolean {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'dehub-test-notification',
    });
    setTimeout(() => notification.close(), 5000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Request notification permission.
 *
 * Returns what the browser actually recorded. 'default' is a real outcome and
 * is NOT the same as 'denied': it means the reader waved the prompt away — or
 * never engaged with Chrome's quiet variant, the little crossed-out bell in
 * the address bar — so nothing was decided and asking again later is legal.
 * This used to collapse to 'denied', which told people their browser was
 * blocking notifications when it wasn't.
 */
export async function requestNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';

  try {
    const result = await Notification.requestPermission();
    // Tell every mounted control what the answer was: the settings switch has
    // to show a fresh 'denied' immediately, and only Chrome and Firefox would
    // otherwise report it through the Permissions API.
    try {
      window.dispatchEvent(new Event(PERMISSION_EVENT));
    } catch {}
    return result;
  } catch {
    return 'unsupported';
  }
}

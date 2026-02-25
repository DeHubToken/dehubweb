/**
 * Browser Notifications Hook
 * ==========================
 * Manages browser notification permissions and delivery via localStorage persistence.
 * Permission is only requested on explicit user action (safe pattern).
 */

import { useState, useCallback, useRef } from 'react';

const STORAGE_KEY = 'dehub_browser_notifications';
const LAST_SEEN_KEY = 'dehub_notifications_last_seen';

function getStoredEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
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

export function useBrowserNotifications() {
  const [isEnabled, setIsEnabledState] = useState(getStoredEnabled);
  // Track shown notification IDs to avoid duplicates within a session
  const shownRef = useRef<Set<string>>(new Set());

  const setEnabled = useCallback((enabled: boolean) => {
    setIsEnabledState(enabled);
    try {
      if (enabled) {
        localStorage.setItem(STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }, []);

  const showNotification = useCallback((title: string, body: string, icon?: string, id?: string) => {
    // Only show when tab is not focused, permission granted, and feature enabled
    if (!document.hidden) return;
    if (!getStoredEnabled()) return;
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

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    } catch {}
  }, []);

  return { isEnabled, setEnabled, showNotification };
}

/**
 * Request notification permission. Returns 'granted', 'denied', or 'unsupported'.
 */
export async function requestNotificationPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  
  try {
    const result = await Notification.requestPermission();
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

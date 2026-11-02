/**
 * Overlay open registry
 * =====================
 * Global count of currently-open modal overlays (bottom drawers, dialogs —
 * which are bottom sheets on mobile — side sheets, alert dialogs, the story
 * viewer) so page chrome can get out of the way while one is up. The sticky
 * feed nav pills sit at z-110 (they must top the in-feed post overlay) and the
 * mobile header at z-60, but overlay scrims are z-50 (dialog/sheet/alert) or
 * z-100 (drawer) — without this signal the chrome floats crisp above every
 * sheet's dimmed backdrop.
 *
 * `OverlayOpenTracker` is a render-nothing component that each overlay
 * primitive mounts INSIDE its portal, next to the scrim. Portal children only
 * exist while the overlay is open (Radix Presence), so the count is correct
 * for controlled and uncontrolled overlays alike, without relying on
 * onOpenChange (which never fires for programmatic `setOpen(true)`).
 */

import * as React from 'react';
import { settleAfterOverlayClose } from './scroll-freeze-watchdog';

let openOverlayCount = 0;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((l) => l());
}

/** True while any registered overlay (drawer / dialog / sheet / …) is open. */
export function useAnyOverlayOpen(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => openOverlayCount > 0,
  );
}

/** Mount inside an overlay's portal (or open-only JSX) to register it. */
export function OverlayOpenTracker(): null {
  React.useEffect(() => {
    openOverlayCount++;
    notifyListeners();
    return () => {
      openOverlayCount--;
      notifyListeners();
      // Also covers uncontrolled dialogs and route unmounts, where the
      // drawer's onOpenChange callback never runs.
      settleAfterOverlayClose();
    };
  }, []);
  return null;
}

/*
 * Android Back closes the open sheet
 * ----------------------------------
 * On a phone, the system Back gesture is a browser history step. Overlays never
 * touched history, so Back with a sheet up ("Reacted by" from a notification,
 * a post's menu, a tip drawer) left the page — or the whole site, when the tab
 * was opened from a link — instead of closing the sheet.
 *
 * While any overlay is open on a touch screen, one extra history entry with the
 * same URL sits on top (react-router's `idx` is kept, so its own Back handling
 * is unaffected). Back pops that entry, and the topmost overlay is closed the
 * way Escape closes it (Radix and vaul both listen for it on the document, and
 * only the top layer answers). An overlay closed any other way removes the
 * entry again, unless a navigation from inside the sheet already replaced it.
 */
const SENTINEL = '__dehubOverlay';
let entryPushed = false;
let ignoreNextPop = false;
let backWired = false;

function touchScreen(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

function onSentinel(): boolean {
  const state = window.history.state as Record<string, unknown> | null;
  return !!state && state[SENTINEL] === true;
}

function syncBackEntry() {
  if (typeof window === 'undefined') return;
  const want = openOverlayCount > 0 && touchScreen();
  if (want && !entryPushed) {
    window.history.pushState({ ...(window.history.state ?? {}), [SENTINEL]: true }, '');
    entryPushed = true;
  } else if (!want && entryPushed) {
    entryPushed = false;
    if (onSentinel()) {
      ignoreNextPop = true;
      window.history.back();
    }
  }
}

function wireBack() {
  if (backWired || typeof window === 'undefined') return;
  backWired = true;
  window.addEventListener('popstate', () => {
    if (ignoreNextPop) {
      ignoreNextPop = false;
      return;
    }
    if (entryPushed && openOverlayCount > 0) {
      entryPushed = false;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      // An overlay that refuses Escape (unsaved input) stays up: put the
      // entry back so the next Back is still caught.
      setTimeout(syncBackEntry, 0);
      return;
    }
    // Landed on an entry left behind by a sheet that navigated away: step past
    // it so Back never looks like it did nothing.
    if (openOverlayCount === 0 && onSentinel()) window.history.back();
  });
}

listeners.add(() => {
  wireBack();
  syncBackEntry();
});

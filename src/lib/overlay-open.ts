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
    };
  }, []);
  return null;
}

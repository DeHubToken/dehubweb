/**
 * Surface switching.
 * ==================
 * /creator and /editor are co-mounted by CreatorEditorHost and the inactive one
 * is hidden with `display: none`, which preserves its state so switching is
 * instant. Radix renders popovers, dialogs, drawers and sheets into a portal on
 * `document.body` though, so they sit outside that hidden wrapper and stay on
 * screen, fully interactive, over the surface you just switched to.
 *
 * Setting `open` to false is not enough on its own: Radix keeps the content
 * mounted until its exit animation reports back, and that never lands here, so
 * the panel just sits there at full opacity. Overlay owners therefore also key
 * their Radix root on the surface epoch, which unmounts the portal outright.
 *
 * Both halves matter. `useCloseOnSurfaceSwitch` resets the owner's own state so
 * the overlay does not reappear when you switch back, and `useSurfaceEpoch`
 * guarantees the portalled node is gone now rather than whenever Radix decides.
 */
import { useEffect, useState } from 'react';

const EVENT = 'dehub:surface-switch';

/** Called by CreatorEditorHost when the visible surface changes. */
export function emitSurfaceSwitch() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Run `close` whenever the visible surface changes. Pass a stable callback,
 * typically wrapped in useCallback.
 */
export function useCloseOnSurfaceSwitch(close: () => void) {
  useEffect(() => {
    const handler = () => close();
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [close]);
}

/**
 * A counter that increments on every surface switch. Use it as the `key` of a
 * Radix root (Popover, Dialog, Drawer, Sheet) so its portal is torn down rather
 * than left waiting on an exit animation that never completes.
 */
export function useSurfaceEpoch(): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const handler = () => setEpoch((n) => n + 1);
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return epoch;
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';

/** Interactive portals exist only while their owner is open. */
export const OverlayContentPresent = createContext(true);

export function useOverlayLifetime(
  controlledOpen: boolean | undefined,
  defaultOpen: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
  exitDurationMs = 0,
) {
  const pageActive = useContext(CachedPageActiveContext);
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const open = pageActive && (controlledOpen ?? internalOpen);
  const [exitPresent, setExitPresent] = useState(open);
  useEffect(() => {
    if (open) {
      setExitPresent(true);
      return;
    }
    if (!pageActive || exitDurationMs === 0) {
      setExitPresent(false);
      return;
    }
    const timer = setTimeout(() => setExitPresent(false), exitDurationMs);
    return () => clearTimeout(timer);
  }, [open, pageActive, exitDurationMs]);
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;

  useEffect(() => {
    if (!pageActive && (controlledOpen ?? internalOpen)) {
      setInternalOpen(false);
      changeRef.current?.(false);
    }
  }, [pageActive, controlledOpen, internalOpen]);

  const onChange = useCallback((next: boolean) => {
    setInternalOpen(next);
    changeRef.current?.(next);
  }, []);

  // Radix's exiting content still owns RemoveScroll and DismissableLayer.
  // Even a bounded exit swallows the next touch gesture on the feed, and an
  // interrupted animation can keep the invisible backdrop around indefinitely.
  // Release the portal with the close state, not an animation or timer callback.
  // Only explicitly animated sheets retain their closing frame. The timeout
  // also removes the portal when a browser interrupts its animation event.
  return { open, onChange, present: pageActive && (open || (exitDurationMs > 0 && exitPresent)) };
}

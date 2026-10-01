import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';

/** Interactive portals exist only while their owner is open. */
export const OverlayContentPresent = createContext(true);

export function useOverlayLifetime(
  controlledOpen: boolean | undefined,
  defaultOpen: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
) {
  const pageActive = useContext(CachedPageActiveContext);
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const open = pageActive && (controlledOpen ?? internalOpen);
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
  return { open, onChange, present: open };
}

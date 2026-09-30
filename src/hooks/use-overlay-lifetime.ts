import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CachedPageActiveContext } from '@/contexts/CachedPageActiveContext';

/** Stop waiting for animationend after an interrupted drawer/dialog exit. */
export const OverlayContentPresent = createContext(true);
export const OVERLAY_EXIT_DEADLINE_MS = 700;

export function useOverlayLifetime(
  controlledOpen: boolean | undefined,
  defaultOpen: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
) {
  const pageActive = useContext(CachedPageActiveContext);
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const open = pageActive && (controlledOpen ?? internalOpen);
  const [exiting, setExiting] = useState(open);
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;

  useEffect(() => {
    if (open) {
      setExiting(true);
      return;
    }
    if (!exiting) return;
    const timer = window.setTimeout(() => setExiting(false), OVERLAY_EXIT_DEADLINE_MS);
    return () => window.clearTimeout(timer);
  }, [open, exiting]);

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

  // Cached pages stay mounted, but their portals must relinquish the new page.
  return { open, onChange, present: pageActive && (open || exiting) };
}

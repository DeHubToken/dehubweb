import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Pull a full-height list drawer down from anywhere on it to close it; the
 * rules live in lib/drawer-pull-close. Loaded on first open, so the gesture
 * code stays off the boot path (the drawer is mounted by AppLayout).
 */
export function useDrawerPullClose(
  sheetRef: RefObject<HTMLElement | null>,
  scrollRef: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    // The sheet portals in after `open` flips; wait for it.
    let frame = 0;
    let cancelled = false;
    let detach: (() => void) | undefined;
    void import('@/lib/drawer-pull-close').then(({ bindDrawerPullClose }) => {
      const attach = () => {
        if (cancelled) return;
        const sheet = sheetRef.current;
        const scroller = scrollRef.current;
        if (!sheet || !scroller) {
          frame = requestAnimationFrame(attach);
          return;
        }
        detach = bindDrawerPullClose(sheet, scroller, () => closeRef.current());
      };
      attach();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      detach?.();
    };
  }, [open, sheetRef, scrollRef]);
}


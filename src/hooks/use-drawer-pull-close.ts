import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { DrawerPullOptions } from '@/lib/drawer-pull-close';

/**
 * Pull a list drawer down from anywhere on it to close it (and, with snap, up
 * to fill the screen); the rules live in lib/drawer-pull-close. Use with
 * vaul's `handleOnly`, so this is the only drag. Loaded on first open, so the gesture
 * code stays off the boot path (the drawer is mounted by AppLayout).
 */
export function useDrawerPullClose(
  sheetRef: RefObject<HTMLElement | null>,
  scrollRef: RefObject<HTMLElement | null> | null,
  open: boolean,
  close: () => void,
  options?: DrawerPullOptions,
) {
  const snap = options?.snap ?? true;
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
        // No list of its own: a `scrollable` DrawerContent's scroller, else the sheet.
        const scroller = scrollRef?.current ?? sheet?.querySelector<HTMLElement>('[data-drawer-scroll]') ?? sheet;
        if (!sheet || !scroller) {
          frame = requestAnimationFrame(attach);
          return;
        }
        detach = bindDrawerPullClose(sheet, scroller, () => closeRef.current(), { snap });
      };
      attach();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      detach?.();
    };
  }, [open, sheetRef, scrollRef, snap]);
}


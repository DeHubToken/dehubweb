/**
 * Opening a reaction tray
 * =======================
 * Hold on touch, hover on a mouse — the gesture that opens the nine-reaction
 * picker, and the guard that stops the click ending a hold from also casting a
 * plain vote.
 *
 * This used to be written out twice (ActionBar and ShortsViewer). It is now
 * needed once per THUMB rather than once per surface — the thumbs-down carries
 * a tray of its own whenever it has more than one reaction to offer — so a
 * feed card wants two of these and a comment row wants two more, and four
 * hand-rolled copies of a 400ms timer is how one of them ends up leaking a
 * timeout on unmount.
 *
 * WHY NOT A POPOVER PRIMITIVE
 * See ReactionPicker's own note: a focus-trapping primitive would swallow the
 * pointer stream that is still down on the thumb, which is the gesture. This
 * hook only decides WHEN the tray is open; the tray positions itself.
 *
 * @module hooks/use-reaction-tray
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsTouchDevice } from '@/hooks/use-touch-device';

/** How long a press has to last before it counts as "open the tray". */
const HOLD_MS = 400;
/** …and how long a pointer has to rest on the thumb for the same, on a mouse. */
const HOVER_OPEN_MS = 450;
/**
 * Grace after the pointer leaves before the tray closes. The gap between the
 * thumb and the tray is real, and closing on the first `mouseleave` made the
 * tray impossible to reach with a mouse.
 */
const HOVER_CLOSE_MS = 220;

export interface ReactionTray {
  open: boolean;
  openNow: () => void;
  close: () => void;
  /**
   * Spread on the element that wraps BOTH the thumb and the tray, so moving
   * from one to the other does not count as leaving. No-ops on touch.
   */
  areaProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  /** Spread on the thumb itself. */
  buttonProps: {
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
    onContextMenu: (event: { preventDefault: () => void }) => void;
  };
  /**
   * Call at the top of the thumb's `onClick`. True means this click is the tail
   * of a hold that already opened the tray, and the vote must not be cast.
   */
  consumePress: () => boolean;
}

export function useReactionTray(
  enabled: boolean,
  options: {
    /**
     * Open on hover as well as on hold. On by default; the shorts viewer turns
     * it off because its chrome auto-hides and a resting cursor would keep
     * popping a tray over the video.
     */
    hover?: boolean;
  } = {},
): ReactionTray {
  const { hover = true } = options;
  const [open, setOpen] = useState(false);
  const isTouchDevice = useIsTouchDevice();
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a hold opened the tray, so the click that ends the same press
  // doesn't also cast a plain vote.
  const heldOpen = useRef(false);

  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );

  // A tray on a button that has just been disabled (the surface turned
  // reactions off) must not stay up with nothing behind it.
  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  const openNow = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const onPointerDown = useCallback(() => {
    if (!enabled) return;
    heldOpen.current = false;
    holdTimer.current = setTimeout(() => {
      heldOpen.current = true;
      setOpen(true);
    }, HOLD_MS);
  }, [enabled]);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const onMouseEnter = useCallback(() => {
    if (!enabled || !hover || isTouchDevice) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(true), HOVER_OPEN_MS);
  }, [enabled, hover, isTouchDevice]);

  const onMouseLeave = useCallback(() => {
    if (isTouchDevice) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  }, [isTouchDevice]);

  const consumePress = useCallback(() => {
    if (!heldOpen.current) return false;
    heldOpen.current = false;
    return true;
  }, []);

  return {
    open,
    openNow,
    close,
    areaProps: { onMouseEnter, onMouseLeave },
    buttonProps: {
      onPointerDown,
      onPointerUp: cancelHold,
      onPointerLeave: cancelHold,
      onPointerCancel: cancelHold,
      // Holding an element on touch otherwise pops the OS text/callout menu.
      onContextMenu: (event) => {
        if (enabled) event.preventDefault();
      },
    },
    consumePress,
  };
}

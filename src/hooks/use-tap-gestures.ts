/**
 * useTapGestures
 * ==============
 * The double / triple / hold ladder on a feed media surface. See
 * `lib/tap-reactions` for what each rung casts.
 *
 * **Pointer events, not click.** VideoCard's feed branch calls
 * `preventDefault()` on `touchend` to stop the tap becoming a navigation, which
 * also suppresses the synthesized click — a click-based handler there works
 * with a mouse and silently does nothing on a phone, which is the one platform
 * this gesture is for. Pointer events are not suppressed by that, and they
 * cover mouse and touch in one path.
 *
 * **Nothing here calls `preventDefault` or `stopPropagation`.** The shorts
 * carousel drags vertically on the same element, the images card runs an embla
 * carousel under it, and the feed has pull-to-refresh above it. Swallowing the
 * stream would break all three. Instead a pointer that travels more than
 * `MOVE_SLOP_PX` stops being a tap and is left entirely to those layers.
 */
import { useCallback, useEffect, useRef } from 'react';
import { emitOpenReactions, emitTapReaction } from '@/lib/tap-reactions';

/** How long after a tap another one still counts as part of the same gesture. */
const TAP_WINDOW_MS = 260;

/** Hold time before the reaction tray opens. Matches ActionBar's own thumb. */
const LONG_PRESS_MS = 400;

/**
 * Travel that turns a press into a scroll/drag/swipe. Deliberately small: on a
 * carousel the competing gesture starts almost immediately, and a "tap" that
 * survived 20px of travel is usually a failed swipe rather than a tap.
 */
const MOVE_SLOP_PX = 10;

export interface UseTapGesturesOptions {
  postId?: string | number;
  /** Runs once a tap is confirmed to be alone — about `TAP_WINDOW_MS` late. */
  onSingleTap?: (event: React.PointerEvent) => void;
  /** Turn the whole ladder off; single taps still fire, immediately. */
  disabled?: boolean;
  /** Set false where a hold already means something else on this surface. */
  enableLongPress?: boolean;
}

export function useTapGestures({
  postId,
  onSingleTap,
  disabled,
  enableLongPress = true,
}: UseTapGesturesOptions) {
  const id = postId != null && String(postId).length > 0 ? String(postId) : '';

  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taps = useRef(0);
  /** Where and which pointer started the press, or null once it is disqualified. */
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  /** A hold already acted, so the release that ends it must not also tap. */
  const held = useRef(false);

  const clearTimers = useCallback(() => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
    }
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const reset = useCallback(() => {
    clearTimers();
    taps.current = 0;
    origin.current = null;
  }, [clearTimers]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled || !id) return;
      // A second finger means a pinch or a two-finger scroll, never a tap.
      if (origin.current && origin.current.id !== event.pointerId) {
        reset();
        return;
      }
      held.current = false;
      origin.current = { x: event.clientX, y: event.clientY, id: event.pointerId };

      if (!enableLongPress) return;
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        held.current = true;
        // Drop any part-built tap gesture: the hold is what the user meant.
        if (tapTimer.current) {
          clearTimeout(tapTimer.current);
          tapTimer.current = null;
        }
        taps.current = 0;
        emitOpenReactions(id);
      }, LONG_PRESS_MS);
    },
    [disabled, id, enableLongPress, reset],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const from = origin.current;
      if (!from || from.id !== event.pointerId) return;
      const travelled = Math.hypot(event.clientX - from.x, event.clientY - from.y);
      if (travelled <= MOVE_SLOP_PX) return;
      // Now a scroll, swipe or drag — hand it back to whoever owns those.
      origin.current = null;
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
    },
    [],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }

      if (disabled || !id) {
        onSingleTap?.(event);
        return;
      }

      // The release that ends a hold is not a tap.
      if (held.current) {
        held.current = false;
        origin.current = null;
        return;
      }

      // Disqualified by travel, or belongs to a pointer we are not tracking.
      const from = origin.current;
      if (!from || from.id !== event.pointerId) {
        origin.current = null;
        return;
      }
      origin.current = null;

      const point = { x: event.clientX, y: event.clientY };
      taps.current += 1;

      if (taps.current === 1) {
        // Hold the single tap back long enough for a second to overtake it.
        tapTimer.current = setTimeout(() => {
          tapTimer.current = null;
          taps.current = 0;
          onSingleTap?.(event);
        }, TAP_WINDOW_MS);
        return;
      }

      if (taps.current === 2) {
        // Cast immediately — this is meant to feel like a quick like, not
        // something that waits to see whether a third tap is coming.
        if (tapTimer.current) clearTimeout(tapTimer.current);
        emitTapReaction(id, 'like', point);
        tapTimer.current = setTimeout(() => {
          tapTimer.current = null;
          taps.current = 0;
        }, TAP_WINDOW_MS);
        return;
      }

      // Third tap: upgrade the like that just landed to a love.
      if (tapTimer.current) clearTimeout(tapTimer.current);
      tapTimer.current = null;
      taps.current = 0;
      emitTapReaction(id, 'love', point);
    },
    [disabled, id, onSingleTap],
  );

  const onPointerCancel = useCallback(() => {
    held.current = false;
    reset();
  }, [reset]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}

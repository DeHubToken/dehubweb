/**
 * useDoubleTapLike
 * ================
 * Instagram-style double-tap-to-like helper for photo thumbnails and
 * fullscreen image viewers. Emits a `dehub:double-tap-like` CustomEvent
 * with `{ postId }` when the container is double-tapped. The matching
 * post's ActionBar listens for the event and casts a like vote.
 *
 * The hook preserves the container's normal single-click behavior by
 * delaying the single-tap callback ~260 ms — if a second tap arrives in
 * that window, the single tap is cancelled and a like is dispatched
 * instead.
 */
import { useCallback, useEffect, useRef } from 'react';

export const DOUBLE_TAP_LIKE_EVENT = 'dehub:double-tap-like';
const DOUBLE_TAP_WINDOW_MS = 260;

export interface DoubleTapLikeEventDetail {
  postId: string;
}

export function emitDoubleTapLike(postId: string) {
  if (!postId) return;
  try {
    window.dispatchEvent(
      new CustomEvent<DoubleTapLikeEventDetail>(DOUBLE_TAP_LIKE_EVENT, {
        detail: { postId: String(postId) },
      }),
    );
  } catch {
    /* ignore */
  }
}

interface UseDoubleTapLikeOptions {
  postId?: string | number;
  /** Called for a confirmed single tap (fires ~260ms after the tap). */
  onSingleTap?: (event: React.SyntheticEvent) => void;
  /** Disable the double-tap behavior entirely. */
  disabled?: boolean;
}

export function useDoubleTapLike({
  postId,
  onSingleTap,
  disabled,
}: UseDoubleTapLikeOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<number>(0);
  const lastEventRef = useRef<React.SyntheticEvent | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleTap = useCallback(
    (event: React.SyntheticEvent) => {
      if (disabled) {
        onSingleTap?.(event);
        return;
      }
      const now = Date.now();
      const withinWindow = now - lastTapRef.current < DOUBLE_TAP_WINDOW_MS;
      lastTapRef.current = now;
      lastEventRef.current = event;

      if (withinWindow) {
        // Second tap — cancel pending single-tap and dispatch like.
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        lastTapRef.current = 0;
        if (postId != null && String(postId).length > 0) {
          emitDoubleTapLike(String(postId));
        }
        return;
      }

      // First tap — delay the single-tap callback so a follow-up tap can cancel it.
      if (timerRef.current) clearTimeout(timerRef.current);
      const capturedEvent = event;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onSingleTap?.(capturedEvent);
      }, DOUBLE_TAP_WINDOW_MS);
    },
    [postId, onSingleTap, disabled],
  );

  const onClick = useCallback(
    (event: React.MouseEvent) => {
      // React fires this once per mouse click. `detail` counts consecutive clicks
      // (1 = single, 2 = dblclick's first, but browsers still send two events).
      handleTap(event);
    },
    [handleTap],
  );

  return { onClick };
}

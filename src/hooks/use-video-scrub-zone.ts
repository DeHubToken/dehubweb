import { useEffect, useRef } from 'react';
import type { HTMLAttributes, PointerEvent, RefObject } from 'react';

type ScrubArgs = {
  enabled: boolean;
  duration: number;
  onStart: () => void;
  onPreview: (time: number) => void;
  onCommit: (time: number) => void;
  onFinish: () => void;
  onCancel: () => void;
  ignoreSelector?: string;
  /** Media geometry when handlers live on the surrounding post. */
  mediaRef?: RefObject<HTMLDivElement>;
  eventRef?: RefObject<HTMLDivElement>;
};

/** Invisible target: 64px above the rail, plus 24px below inside its post. */
export function useVideoScrubZone(args: ScrubArgs): HTMLAttributes<HTMLDivElement> {
  const gesture = useRef<{
    id: number; x: number; y: number; button: boolean; dragging: boolean;
  } | null>(null);
  const swallowClick = useRef(false);
  const bottomTouch = useRef(false);
  const rectAt = (element: HTMLDivElement) => (args.mediaRef?.current ?? element).getBoundingClientRect();
  const timeAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = rectAt(event.currentTarget);
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / (rect.width || 1))) * args.duration;
  };
  const inZone = (element: HTMLDivElement, x: number, y: number) => {
    const { left, right, top, bottom } = rectAt(element);
    return args.enabled && x >= left && x <= right && y >= Math.max(top, bottom - 64)
      && y <= bottom + (args.mediaRef ? 24 : 0);
  };
  useEffect(() => {
    const element = args.eventRef?.current;
    if (!element) return;
    // The expanded area includes ordinary caption/author DOM below the player.
    // Prevent browser panning only while a scrub owns this touch; React's root
    // touch listeners are passive and cannot keep that pointer stream alive.
    const keepScrub = (event: TouchEvent) => {
      if (gesture.current?.dragging && event.cancelable) event.preventDefault();
    };
    // Run before React stops propagation at its root capture listener.
    const document = element.ownerDocument;
    document.addEventListener('touchmove', keepScrub, { capture: true, passive: false });
    return () => document.removeEventListener('touchmove', keepScrub, true);
  }, [args.eventRef]);
  const cancel = () => {
    const active = gesture.current;
    gesture.current = null;
    swallowClick.current = true;
    if (active?.dragging) {
      args.onCancel();
      args.onFinish();
    }
  };

  return {
    onPointerDownCapture(event) {
      swallowClick.current = false;
      if (!event.isPrimary || event.button !== 0) {
        if (gesture.current) cancel();
        return;
      }
      if (!inZone(event.currentTarget, event.clientX, event.clientY)) return;
      if (args.ignoreSelector && (event.target as Element).closest(args.ignoreSelector)) return;
      const target = event.target as Element;
      const button = !!target.closest('button, [role="button"]')
        && (!args.mediaRef || !!target.closest('[data-video-controls], [data-audio-controls]'));
      const dedicated = !button;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, button, dragging: dedicated };
      // Disable the range's native seek; this gesture commits only on release.
      if (!button) {
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
      }
      if (dedicated) {
        swallowClick.current = true;
        args.onStart();
        args.onPreview(timeAt(event));
      }
    },
    onPointerMoveCapture(event) {
      const active = gesture.current;
      if (!active || active.id !== event.pointerId) return;
      const dx = Math.abs(event.clientX - active.x);
      const dy = Math.abs(event.clientY - active.y);
      if (!active.dragging) {
        if (dy > 6 && dy >= dx) { cancel(); return; }
        if (dx <= 6 || dx <= dy) return;
        active.dragging = true;
        swallowClick.current = true;
        args.onStart();
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      event.stopPropagation();
      args.onPreview(timeAt(event));
    },
    onPointerUpCapture(event) {
      const active = gesture.current;
      if (!active || active.id !== event.pointerId) return;
      gesture.current = null;
      if (active.button && !active.dragging) return;
      swallowClick.current = true;
      event.preventDefault();
      event.stopPropagation();
      if (!active.dragging) args.onStart();
      args.onCommit(timeAt(event));
      args.onFinish();
    },
    onPointerCancelCapture() { if (gesture.current) cancel(); },
    onLostPointerCaptureCapture() { if (gesture.current?.dragging) cancel(); },
    onTouchStartCapture(event) {
      const touch = event.touches[0];
      bottomTouch.current = !!touch && inZone(event.currentTarget, touch.clientX, touch.clientY)
        && !(args.ignoreSelector && (event.target as Element).closest(args.ignoreSelector));
      if (bottomTouch.current) event.stopPropagation();
    },
    onTouchEndCapture(event) {
      if (bottomTouch.current) event.stopPropagation();
      bottomTouch.current = false;
    },
    onTouchMoveCapture(event) {
      if (bottomTouch.current) event.stopPropagation();
    },
    onTouchCancelCapture(event) {
      if (bottomTouch.current) event.stopPropagation();
      bottomTouch.current = false;
      if (gesture.current) cancel();
    },
    onClickCapture(event) {
      // Keyboard activation has no pointer gesture and keeps working.
      if (swallowClick.current && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}

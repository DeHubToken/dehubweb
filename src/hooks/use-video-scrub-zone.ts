import { useRef } from 'react';
import type { HTMLAttributes, PointerEvent } from 'react';

type ScrubArgs = {
  enabled: boolean;
  duration: number;
  onStart: () => void;
  onPreview: (time: number) => void;
  onCommit: (time: number) => void;
  onFinish: () => void;
  onCancel: () => void;
  ignoreSelector?: string;
};

/** The bottom 48px shares taps with buttons, but owns horizontal drags. */
export function useVideoScrubZone(args: ScrubArgs): HTMLAttributes<HTMLDivElement> {
  const gesture = useRef<{
    id: number; x: number; y: number; button: boolean; dragging: boolean;
  } | null>(null);
  const swallowClick = useRef(false);
  const bottomTouch = useRef(false);
  const timeAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / (rect.width || 1))) * args.duration;
  };
  const inZone = (element: HTMLDivElement, y: number) => {
    const bottom = element.getBoundingClientRect().bottom;
    return args.enabled && y >= bottom - 48 && y <= bottom;
  };
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
      if (!inZone(event.currentTarget, event.clientY)) return;
      if (args.ignoreSelector && (event.target as Element).closest(args.ignoreSelector)) return;
      const button = !!(event.target as Element).closest('button, [role="button"]');
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, button, dragging: false };
      // Disable the range's native seek; this gesture commits only on release.
      if (!button) {
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
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
      bottomTouch.current = !!touch && inZone(event.currentTarget, touch.clientY)
        && !(args.ignoreSelector && (event.target as Element).closest(args.ignoreSelector));
      if (bottomTouch.current) event.stopPropagation();
    },
    onTouchEndCapture(event) {
      if (bottomTouch.current) event.stopPropagation();
      bottomTouch.current = false;
    },
    onTouchCancelCapture() { bottomTouch.current = false; },
    onClickCapture(event) {
      // Keyboard activation has no pointer gesture and keeps working.
      if (swallowClick.current && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}

import { useRef, type TouchEvent } from 'react';

/** Pull down from the top of comments without stealing ordinary list scrolling. */
export function useCommentsPullDismiss(onClose: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const reset = () => { start.current = null; };

  return {
    onTouchStartCapture(event: TouchEvent<HTMLElement>) {
      reset();
      if (event.touches.length !== 1) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, button, a, [contenteditable="true"]')) return;
      // A pull that starts partway through a thread belongs to its scroll area,
      // even if that area reaches the top before the finger lifts.
      for (let node: HTMLElement | null = target; node && node !== event.currentTarget; node = node.parentElement) {
        if (node.scrollTop > 0) return;
      }
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY };
    },
    onTouchEndCapture(event: TouchEvent<HTMLElement>) {
      const origin = start.current;
      reset();
      if (!origin || !event.changedTouches.length) return;
      const touch = event.changedTouches[0];
      const dy = touch.clientY - origin.y;
      if (dy > 60 && dy > Math.abs(touch.clientX - origin.x) * 1.5) onClose();
    },
    onTouchCancelCapture: reset,
  };
}

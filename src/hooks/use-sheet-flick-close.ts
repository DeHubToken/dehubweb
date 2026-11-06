import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Decides a drag-down release on a bottom sheet from how the finger was moving
 * when it let go, not from the gesture's average speed.
 *
 * vaul measures speed as total distance / total time. A pull that starts
 * gently and ends in a quick flick averages out slow, so the sheet sprang back
 * even though the finger was still travelling down. This keeps the last
 * ~100ms of movement and closes when the finger was still heading down at
 * release, or would have carried the sheet past a third of its height.
 *
 * It only ever adds closes: vaul's own rules (a quarter of the height, or a
 * fast average) still close as before. Spring-back is left for a finger that
 * stopped, or let go early after a short pull.
 *
 * Every close also starts the slide down on the compositor right at release.
 * Closing re-renders the composer's parent, and on a busy phone that held the
 * sheet still under the finger for a few frames before vaul's exit began.
 */
const WINDOW_MS = 100;
/** px/ms downward at release that still reads as "moving". */
const MOVING = 0.15;
/** How far the release speed is projected forward. */
const PROJECT_MS = 180;
const MIN_PULL = 24;

type Sample = { t: number; y: number };

const EXIT_MS = 400;
const EXIT_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * Slide the sheet off from where the finger left it, on the compositor.
 *
 * A script animation, not a style change: vaul's own exit is a CSS animation
 * that starts only once React has re-rendered the closed state, and a CSS
 * animation would also cancel a transition here. This one outranks the CSS
 * exit and keeps running however busy the page gets.
 */
function slideOut(sheet: HTMLElement | null) {
  if (!sheet || typeof sheet.animate !== 'function') return;
  const from = sheet.style.transform || 'translate3d(0, 0, 0)';
  // After vaul's release handling, which may set a spring-back transition:
  // pin the inline style where the finger let go so no transition starts.
  queueMicrotask(() => {
    sheet.style.transition = 'none';
    sheet.style.transform = from;
    sheet.animate(
      [{ transform: from }, { transform: 'translate3d(0, 100%, 0)' }],
      { duration: EXIT_MS, easing: EXIT_EASE, fill: 'forwards' },
    );
  });
}

/** Runs `fn` once the next frame has been handed to the compositor. */
export function afterNextFrame(fn: () => void) {
  requestAnimationFrame(() => setTimeout(fn, 0));
}

/**
 * @param close   closes the sheet (the same path as vaul's onOpenChange(false)).
 * @param canClose false while the sheet refuses to close (camera, full-screen
 *                 media), so nothing slides away that will stay open.
 */
export function useSheetFlickClose(close: () => void, canClose: () => boolean = () => true) {
  const samples = useRef<Sample[]>([]);
  const startY = useRef<number | null>(null);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    startY.current = e.pageY;
    samples.current = [{ t: e.timeStamp, y: e.pageY }];
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (startY.current === null) return;
    const list = samples.current;
    list.push({ t: e.timeStamp, y: e.pageY });
    while (list.length > 2 && e.timeStamp - list[0].t > WINDOW_MS) list.shift();
  }, []);

  /** vaul's onRelease: `open` is true when vaul is about to spring back. */
  const onRelease = useCallback(
    (e: PointerEvent | ReactPointerEvent<HTMLElement>, open: boolean) => {
      const start = startY.current;
      startY.current = null;
      const list = samples.current;
      samples.current = [];
      const sheet = (e.target as HTMLElement | null)?.closest?.('[data-vaul-drawer]') as HTMLElement | null;
      if (!open) {
        // vaul is closing on its own rules.
        if (canClose()) slideOut(sheet);
        return;
      }
      if (start === null || list.length < 2 || !canClose()) return;
      const height = sheet?.getBoundingClientRect().height || window.innerHeight;
      const last = list[list.length - 1];
      const first = list[0];
      // A gap since the last move means the finger stopped before letting go.
      const idle = e.timeStamp - last.t;
      const dt = Math.max(1, last.t - first.t);
      const speed = idle > 60 ? 0 : (last.y - first.y) / dt;
      const pulled = last.y - start;
      if (pulled < MIN_PULL) return;
      const projected = pulled + Math.max(0, speed) * PROJECT_MS;
      if (speed > MOVING || projected > height / 3) {
        slideOut(sheet);
        close();
      }
    },
    [close, canClose],
  );

  return { onPointerDown, onPointerMove, onRelease };
}

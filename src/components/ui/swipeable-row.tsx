import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface SwipeRowAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** Tailwind classes for the action panel button. */
  className?: string;
  onSelect: () => void;
  /**
   * The action a long swipe runs on its own — delete, in practice. The row
   * slides out and folds away before `onSelect` fires, so the list can drop
   * it without the rest jumping. Put it last: it is the one that stretches to
   * follow the finger.
   */
  destructive?: boolean;
}

interface SwipeableRowProps {
  actions: SwipeRowAction[];
  children: React.ReactNode;
  className?: string;
}

const ACTION_WIDTH = 76;
/** Past this share of the row's width, letting go runs the destructive action. */
const FULL_SWIPE_RATIO = 0.55;
/** Finger speed (px/ms) that decides open or closed regardless of distance. */
const FLING_VELOCITY = 0.35;
const SNAP_MS = 220;
const COLLAPSE_MS = 180;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/*
 * Only one row is open at a time, the way a native list behaves. Without it a
 * scroll down the list leaves a trail of half-open rows.
 */
let closeOpenRow: (() => void) | null = null;

interface Gesture {
  x: number;
  y: number;
  base: number;
  width: number;
  lastX: number;
  lastT: number;
  vx: number;
  axis: 'x' | 'y' | null;
}

/**
 * Drag a list row to the left to reveal its actions; drag it most of the way
 * across to run the destructive one outright. Touch only — a mouse has the
 * row's own menu, and hijacking horizontal drags on desktop would break text
 * selection.
 *
 * The drag writes the transform straight to the DOM rather than through state.
 * Going through React re-rendered the whole row — avatar, badges, preview — on
 * every touchmove, which is where the stutter came from on a mid-range phone.
 */
export function SwipeableRow({ actions, children, className }: SwipeableRowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const lastActionRef = useRef<HTMLButtonElement>(null);
  const offset = useRef(0);
  const gesture = useRef<Gesture | null>(null);
  const armed = useRef(false);
  const mounted = useRef(true);

  const maxOffset = actions.length * ACTION_WIDTH;
  const last = actions[actions.length - 1];
  const stretches = !!last?.destructive;

  const paint = useCallback((px: number, animate: boolean) => {
    offset.current = px;
    const track = trackRef.current;
    if (track) {
      track.style.transition = animate ? `transform ${SNAP_MS}ms ${EASE}` : 'none';
      track.style.transform = `translate3d(${-px}px, 0, 0)`;
    }
    const panel = actionsRef.current;
    if (panel) {
      panel.setAttribute('aria-hidden', String(px === 0));
      panel.querySelectorAll('button').forEach((button) => { button.disabled = px === 0; });
    }
    const lastBtn = lastActionRef.current;
    if (lastBtn && stretches) {
      lastBtn.style.transition = animate ? `width ${SNAP_MS}ms ${EASE}` : 'none';
      lastBtn.style.width = `${ACTION_WIDTH + Math.max(0, px - maxOffset)}px`;
    }
  }, [maxOffset, stretches]);

  const close = useCallback(() => {
    paint(0, true);
    if (closeOpenRow === close) closeOpenRow = null;
  }, [paint]);

  const open = useCallback(() => {
    paint(maxOffset, true);
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close;
  }, [close, maxOffset, paint]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (closeOpenRow === close) closeOpenRow = null;
    };
  }, [close]);

  useEffect(() => { paint(offset.current, false); }, [actions, paint]);

  /**
   * Slide the row the rest of the way out, fold its height to nothing, then
   * hand over. The caller is expected to drop the row from its list at that
   * point; if it does not (the action was refused, say), the row comes back.
   */
  const dismissThen = useCallback((run: () => void) => {
    const root = rootRef.current;
    if (closeOpenRow === close) closeOpenRow = null;
    if (!root) {
      run();
      return;
    }
    paint(root.offsetWidth, true);
    window.setTimeout(() => {
      root.style.height = `${root.offsetHeight}px`;
      root.style.transition = `height ${COLLAPSE_MS}ms ${EASE}, opacity ${COLLAPSE_MS}ms ease`;
      requestAnimationFrame(() => {
        root.style.height = '0px';
        root.style.opacity = '0';
      });
      window.setTimeout(() => {
        run();
        window.setTimeout(() => {
          if (!mounted.current) return;
          root.style.transition = 'none';
          root.style.height = '';
          root.style.opacity = '';
          paint(0, false);
        }, 400);
      }, COLLAPSE_MS);
    }, SNAP_MS);
  }, [close, paint]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    gesture.current = {
      x: touch.clientX,
      y: touch.clientY,
      base: offset.current,
      width: rootRef.current?.offsetWidth ?? 360,
      lastX: touch.clientX,
      lastT: performance.now(),
      vx: 0,
      axis: null,
    };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    const touch = e.touches[0];
    const dx = touch.clientX - g.x;
    const dy = touch.clientY - g.y;

    // Nothing moves until the first few pixels decide between a horizontal
    // swipe and a vertical scroll. Once it is a scroll we stay out of the way.
    if (g.axis === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.axis === 'x' && closeOpenRow && closeOpenRow !== close) closeOpenRow();
    }
    if (g.axis !== 'x') return;

    const now = performance.now();
    g.vx = (touch.clientX - g.lastX) / Math.max(1, now - g.lastT);
    g.lastX = touch.clientX;
    g.lastT = now;

    let px = Math.max(0, g.base - dx);
    if (px > maxOffset) {
      // The destructive action follows the finger all the way; anything else
      // resists past its panel instead of revealing empty space.
      px = stretches ? Math.min(px, g.width) : maxOffset + (px - maxOffset) * 0.25;
    }
    paint(px, false);

    const past = stretches && px > g.width * FULL_SWIPE_RATIO;
    if (past !== armed.current) {
      armed.current = past;
      if (past) navigator.vibrate?.(8);
      lastActionRef.current?.toggleAttribute('data-armed', past);
    }
  }, [close, maxOffset, paint, stretches]);

  const onTouchEnd = useCallback(() => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== 'x') return;

    if (armed.current && last?.destructive) {
      armed.current = false;
      lastActionRef.current?.removeAttribute('data-armed');
      dismissThen(last.onSelect);
      return;
    }
    const shouldOpen =
      g.vx < -FLING_VELOCITY || (g.vx <= FLING_VELOCITY && offset.current > maxOffset / 2);
    if (shouldOpen) open();
    else close();
  }, [close, dismissThen, last, maxOffset, open]);

  if (actions.length === 0) return <>{children}</>;

  return (
    <div ref={rootRef} className={cn('overflow-hidden', className)}>
      {/*
        Content and actions sit side by side and the pair slides, rather than
        the content riding over a hidden panel. That keeps the row transparent,
        which every theme relies on — an opaque row here would paint a slab
        over the surface behind it.

        pan-y hands vertical scrolling to the browser and leaves horizontal
        drags to us, so a swipe never also scrolls the page or triggers the
        browser's own back gesture on the way.
      */}
      <div
        ref={trackRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="flex will-change-transform"
        style={{ touchAction: 'pan-y' }}
      >
        <div
          className="w-full shrink-0"
          // A tap on an open row closes it, as in Mail, instead of opening
          // whatever the row links to.
          onClickCapture={(e) => {
            if (offset.current > 0) {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          }}
        >
          {children}
        </div>
        <div ref={actionsRef} data-swipe-actions aria-hidden="true" className="flex shrink-0">
        {actions.map((action, i) => (
          <button
            key={action.key}
            ref={(button) => {
              if (i === actions.length - 1) lastActionRef.current = button;
              if (button) button.disabled = offset.current === 0;
            }}
            type="button"
            aria-label={action.label}
            onClick={() => {
              if (action.destructive) {
                dismissThen(action.onSelect);
                return;
              }
              close();
              action.onSelect();
            }}
            className={cn(
              'shrink-0 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-white',
              'data-[armed]:brightness-110',
              action.className ?? 'bg-zinc-700',
            )}
            style={{ width: ACTION_WIDTH }}
          >
            {action.icon}
            <span className="px-1 truncate">{action.label}</span>
          </button>
        ))}
        </div>
      </div>
    </div>
  );
}

export default SwipeableRow;

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SwipeRowAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** Tailwind classes for the action panel button. */
  className?: string;
  onSelect: () => void;
}

interface SwipeableRowProps {
  actions: SwipeRowAction[];
  children: React.ReactNode;
  className?: string;
}

const ACTION_WIDTH = 76;

/*
 * Only one row is open at a time, the way a native list behaves. Without it a
 * scroll down the list leaves a trail of half-open rows.
 */
let closeOpenRow: (() => void) | null = null;

/**
 * Drag a list row to the left to reveal its actions. Touch only — a mouse has
 * the row's own menu, and hijacking horizontal drags on desktop would break
 * text selection.
 */
export function SwipeableRow({ actions, children, className }: SwipeableRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  // Null until the first move decides whether this is a horizontal swipe or a
  // vertical scroll. Once it is a scroll we stay out of the way entirely.
  const axis = useRef<'x' | 'y' | null>(null);

  const maxOffset = actions.length * ACTION_WIDTH;

  const close = useCallback(() => {
    setOffset(0);
    if (closeOpenRow === close) closeOpenRow = null;
  }, []);

  useEffect(() => () => {
    if (closeOpenRow === close) closeOpenRow = null;
  }, [close]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (actions.length === 0) return;
    const touch = e.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY, base: offset };
    axis.current = null;
  }, [actions.length, offset]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!start.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - start.current.x;
    const dy = touch.clientY - start.current.y;

    if (axis.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis.current === 'x') {
        setDragging(true);
        if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
        closeOpenRow = close;
      }
    }
    if (axis.current !== 'x') return;

    const next = Math.min(maxOffset, Math.max(0, start.current.base - dx));
    setOffset(next);
  }, [close, maxOffset]);

  const onTouchEnd = useCallback(() => {
    start.current = null;
    if (axis.current !== 'x') {
      axis.current = null;
      return;
    }
    axis.current = null;
    setDragging(false);
    setOffset(prev => (prev > maxOffset / 2 ? maxOffset : 0));
  }, [maxOffset]);

  if (actions.length === 0) return <>{children}</>;

  return (
    <div className={cn('overflow-hidden', className)}>
      {/*
        Content and actions sit side by side and the pair slides, rather than
        the content riding over a hidden panel. That keeps the row transparent,
        which every theme relies on — an opaque row here would paint a slab
        over the surface behind it.
      */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="flex"
        style={{
          transform: `translateX(-${offset}px)`,
          transition: dragging ? 'none' : 'transform 180ms ease-out',
        }}
      >
        <div className="w-full shrink-0">{children}</div>
        {actions.map(action => (
          <button
            key={action.key}
            type="button"
            aria-label={action.label}
            onClick={() => {
              close();
              action.onSelect();
            }}
            className={cn(
              'shrink-0 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-white',
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
  );
}

export default SwipeableRow;

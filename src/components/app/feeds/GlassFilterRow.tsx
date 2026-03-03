/**
 * Glass Filter Row
 * ================
 * Wraps a row of filter buttons with a front-overlay GlassIndicator
 * so the spring bounce animation is never clipped by scroll containers.
 */

import { useRef, useState, useCallback, useLayoutEffect, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { GlassIndicator } from './GlassIndicator';

interface GlassFilterRowProps<T extends string> {
  items: { key: T; label: React.ReactNode }[];
  activeKey: T;
  onSelect: (key: T) => void;
  className?: string;
  buttonClassName?: string;
  borderRadius?: string;
}

export function GlassFilterRow<T extends string>({
  items,
  activeKey,
  onSelect,
  className,
  buttonClassName,
  borderRadius = '0.5rem',
}: GlassFilterRowProps<T>) {
  const layerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Partial<Record<T, HTMLElement | null>>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState({ x: 0, y: 0, width: 0, height: 0, ready: false });

  const update = useCallback(() => {
    const layer = layerRef.current;
    const btn = btnRefs.current[activeKey];
    if (!layer || !btn) return;
    const lr = layer.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setRect({
      x: br.left - lr.left,
      y: br.top - lr.top,
      width: br.width,
      height: br.height,
      ready: true,
    });
  }, [activeKey]);

  useLayoutEffect(() => { update(); }, [update]);

  useEffect(() => {
    const handler = () => requestAnimationFrame(update);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [update]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => requestAnimationFrame(update);
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [update]);

  return (
    <div className={cn('relative', className)} style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
      {/* Overlay layer for indicator - overflow visible so spring bounce isn't clipped */}
      <div ref={layerRef} className="absolute inset-0 overflow-visible pointer-events-none z-10">
        <GlassIndicator rect={rect} borderRadius={borderRadius} />
      </div>
      {/* Scrollable button row */}
      <div
        ref={scrollRef}
        className="relative z-20 flex gap-1.5 overflow-x-auto overflow-y-visible scrollbar-hide whitespace-nowrap pl-1 pr-6 py-1"
        style={{ touchAction: 'pan-x' }}
      >
        {items.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              ref={(el) => { btnRefs.current[item.key] = el; }}
              onClick={() => onSelect(item.key)}
              className={cn(
                'relative flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                isActive ? 'text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
                buttonClassName,
              )}
            >
              <span className="relative z-20">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

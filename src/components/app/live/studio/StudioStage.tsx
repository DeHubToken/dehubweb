/**
 * Live Studio's preview: the creator's widgets over a stand-in picture, moved
 * by dragging and resized from the corner.
 *
 * Every widget is the real one from overlay-widgets, so what is placed here is
 * exactly what viewers get — the stage only adds the handles. Positions are
 * fractions of the picture, edited for whichever shape is showing: a landscape
 * and a portrait stream keep separate layouts.
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import '@/styles/live-overlay.css';
import { drawOrder } from '@/lib/live-overlay/layout';
import { isKnownKind, type OverlayKind } from '@/lib/live-overlay/registry';
import type { OverlayRect, OverlayStats, OverlayWidget } from '@/lib/live-overlay/types';
import { OverlayWidgetView } from '../overlay/overlay-widgets';

const MIN_SIDE = 0.03;

interface Props {
  widgets: OverlayWidget[];
  portrait: boolean;
  selectedId: string | null;
  stats: OverlayStats;
  onSelect: (id: string | null) => void;
  onMove: (id: string, rect: OverlayRect) => void;
}

type Drag = { id: string; mode: 'move' | 'resize'; startX: number; startY: number; start: OverlayRect };

function clampRect(rect: OverlayRect): OverlayRect {
  const w = Math.min(1, Math.max(MIN_SIDE, rect.w));
  const h = Math.min(1, Math.max(MIN_SIDE, rect.h));
  return { w, h, x: Math.min(1 - w, Math.max(0, rect.x)), y: Math.min(1 - h, Math.max(0, rect.y)) };
}

export function StudioStage({ widgets, portrait, selectedId, stats, onSelect, onMove }: Props) {
  const { t } = useTranslation();
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<Drag | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const rectOf = (w: OverlayWidget) => (portrait ? w.portrait : w.landscape);

  const begin = (e: PointerEvent, widget: OverlayWidget, mode: Drag['mode']) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(widget.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: widget.id, mode, startX: e.clientX, startY: e.clientY, start: { ...rectOf(widget) } };
  };

  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !size.w || !size.h) return;
    const dx = (e.clientX - d.startX) / size.w;
    const dy = (e.clientY - d.startY) / size.h;
    const next =
      d.mode === 'move'
        ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy }
        : { ...d.start, w: d.start.w + dx, h: d.start.h + dy };
    onMove(d.id, clampRect(next));
  };

  const end = () => {
    drag.current = null;
  };

  const nudge = (e: KeyboardEvent, widget: OverlayWidget) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const r = rectOf(widget);
    const moves: Record<string, Partial<OverlayRect>> = {
      ArrowLeft: { x: r.x - step },
      ArrowRight: { x: r.x + step },
      ArrowUp: { y: r.y - step },
      ArrowDown: { y: r.y + step },
    };
    const change = moves[e.key];
    if (!change) return;
    e.preventDefault();
    onMove(widget.id, clampRect({ ...r, ...change }));
  };

  const drawable = drawOrder(widgets.filter((w) => isKnownKind(w.kind)));

  return (
    <div
      ref={stageRef}
      data-studio-stage
      role="application"
      aria-label={t('liveStudio.stageLabel')}
      onPointerDown={() => onSelect(null)}
      className={cn(
        'relative mx-auto w-full select-none overflow-hidden rounded-xl',
        'bg-[radial-gradient(120%_80%_at_30%_20%,#3f3f46_0%,#18181b_55%,#09090b_100%)]',
        portrait ? 'aspect-[9/16] max-w-[360px]' : 'aspect-video',
      )}
    >
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-white/25">
        {t('liveStudio.stageLabel')}
      </span>

      {size.h > 0 &&
        drawable.map((widget) => {
          const r = rectOf(widget);
          const heightPx = r.h * size.h;
          const selected = widget.id === selectedId;
          const style = {
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.w * 100}%`,
            height: `${r.h * 100}%`,
            '--ow-h': `${heightPx}px`,
            '--ow-w': `${r.w * size.w}px`,
            opacity: widget.enabled ? 1 : 0.35,
          } as CSSProperties;
          return (
            <div
              key={widget.id}
              data-overlay-widget={widget.kind}
              style={style}
              tabIndex={0}
              aria-label={t(`liveStudio.kinds.${widget.kind}`)}
              aria-pressed={selected}
              onPointerDown={(e) => begin(e, widget, 'move')}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onKeyDown={(e) => nudge(e, widget)}
              onFocus={() => onSelect(widget.id)}
              className={cn(
                'cursor-move outline-none',
                selected ? 'ring-2 ring-white' : 'ring-1 ring-white/25 hover:ring-white/60 focus-visible:ring-white/80',
              )}
            >
              <div className="pointer-events-none h-full w-full">
                <OverlayWidgetView
                  kind={widget.kind as OverlayKind}
                  settings={widget.settings || {}}
                  streamId=""
                  stats={stats}
                  initialViewers={0}
                />
              </div>
              {selected && (
                <span
                  aria-hidden
                  onPointerDown={(e) => begin(e, widget, 'resize')}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  className="absolute bottom-0.5 right-0.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-zinc-900 bg-white"
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

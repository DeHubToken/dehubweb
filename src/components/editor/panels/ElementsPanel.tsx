/**
 * Elements — vector shapes. Click one to drop it on the page as a new layer at
 * the playhead; it is then moved, resized and styled like any other layer.
 */
import { useTranslation } from 'react-i18next';
import { PenLine } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useEditorUiStore } from '@/store/editorUiStore';
import { SHAPE_KINDS, type ShapeKind } from '@/lib/editor/types';
import { useEditorStore } from '@/store/editorStore';
import { PanelHeading } from './DesignPanel';

/** Preview glyph for each shape, drawn in a 40×40 box. */
function ShapeIcon({ shape }: { shape: ShapeKind }) {
  const common = { fill: 'currentColor', stroke: 'none' };
  switch (shape) {
    case 'rect':
      return <rect x="6" y="9" width="28" height="22" rx="3" {...common} />;
    case 'ellipse':
      return <ellipse cx="20" cy="20" rx="14" ry="14" {...common} />;
    case 'triangle':
      return <polygon points="20,6 34,33 6,33" {...common} />;
    case 'star':
      return <polygon points="20,5 24,15 35,15 26,22 29,33 20,26 11,33 14,22 5,15 16,15" {...common} />;
    case 'heart':
      return <path d="M20 33 C6 24 6 12 13 10 C17 9 19 12 20 14 C21 12 23 9 27 10 C34 12 34 24 20 33 Z" {...common} />;
    case 'hexagon':
      return <polygon points="34,20 27,32 13,32 6,20 13,8 27,8" {...common} />;
    case 'line':
      return <line x1="6" y1="20" x2="34" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />;
    case 'arrow':
      return (
        <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <line x1="6" y1="20" x2="33" y2="20" />
          <polyline points="25,13 33,20 25,27" />
        </g>
      );
  }
}

export function ElementsPanel() {
  const { t } = useTranslation();
  const addShapeClip = useEditorStore((s) => s.addShapeClip);
  const draw = useEditorUiStore((s) => s.draw);
  const setDraw = useEditorUiStore((s) => s.setDraw);
  const pen = draw ?? { color: '#ffffff', width: 10 };
  const names: Record<ShapeKind, string> = {
    rect: t('editor.shape.rect'),
    ellipse: t('editor.shape.ellipse'),
    triangle: t('editor.shape.triangle'),
    star: t('editor.shape.star'),
    heart: t('editor.shape.heart'),
    hexagon: t('editor.shape.hexagon'),
    line: t('editor.shape.line'),
    arrow: t('editor.shape.arrow'),
  };

  return (
    <div className="h-full overflow-y-auto p-3">
      <PanelHeading>{t('editor.elements.shapes')}</PanelHeading>
      <div className="grid grid-cols-4 gap-1.5">
        {SHAPE_KINDS.map((shape) => (
          <button
            key={shape}
            type="button"
            title={names[shape]}
            aria-label={names[shape]}
            onClick={() => {
              addShapeClip(shape);
              window.dispatchEvent(new Event('editor:open-inspector'));
            }}
            className="flex aspect-square items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/80 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden>
              <ShapeIcon shape={shape} />
            </svg>
          </button>
        ))}
      </div>
      <p className="mt-3 px-0.5 text-[10px] leading-relaxed text-white/40">{t('editor.elements.hint')}</p>

      <PanelHeading className="mt-5">{t('editor.draw.heading')}</PanelHeading>
      <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <button
          type="button"
          aria-pressed={!!draw}
          onClick={() => setDraw(draw ? null : pen)}
          className={cn(
            'flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[12px] font-semibold transition',
            draw ? 'bg-white text-black' : 'border border-white/20 text-white hover:bg-white/10',
          )}
        >
          <PenLine className="h-4 w-4" /> {draw ? t('editor.draw.stop') : t('editor.draw.start')}
        </button>
        <div className="grid grid-cols-[auto_1fr] items-center gap-3">
          <input
            type="color"
            value={pen.color}
            aria-label={t('editor.draw.colour')}
            onChange={(e) => setDraw({ ...pen, color: e.target.value })}
            className="h-8 w-10 cursor-pointer rounded-md border border-white/10 bg-white/5"
          />
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-white/40">{t('editor.draw.width', { value: pen.width })}</p>
            <Slider value={[pen.width]} min={2} max={60} step={1} onValueChange={(v) => setDraw({ ...pen, width: v[0] ?? pen.width })} />
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-white/40">{t('editor.draw.hint')}</p>
      </div>
    </div>
  );
}

/**
 * Dual-format live: where the creator picks the 9:16 window phones see of
 * their landscape stream in the vertical feed.
 *
 * Part of the overlay draft, so it saves with the Save bar like everything else
 * in Live Studio. Off, or never set, the feed shows the middle of the picture.
 */
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone } from 'lucide-react';
import { PageSection } from '@/components/app/page-kit/PageKit';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { CENTRED_CROP, MIN_CROP_HEIGHT, cropAt, type VerticalCrop } from '@/lib/live-overlay/vertical-crop';

interface Props {
  crop: VerticalCrop | null;
  onChange: (crop: VerticalCrop) => void;
}

type Drag = { startX: number; startY: number; start: VerticalCrop; width: number; height: number };

export function VerticalCropPanel({ crop, onChange }: Props) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const current = crop ?? { ...CENTRED_CROP, enabled: true };
  const centreOf = (c: VerticalCrop) => ({ cx: c.x + c.w / 2, cy: c.y + c.h / 2 });

  const begin = (e: PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current?.getBoundingClientRect();
    if (!frame) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, start: current, width: frame.width, height: frame.height };
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const { cx, cy } = centreOf(d.start);
    onChange(
      cropAt(d.start.h, cx + (e.clientX - d.startX) / d.width, cy + (e.clientY - d.startY) / d.height, current.enabled),
    );
  };

  const end = () => {
    drag.current = null;
  };

  const nudge = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const by = moves[e.key];
    if (!by) return;
    e.preventDefault();
    const { cx, cy } = centreOf(current);
    onChange(cropAt(current.h, cx + by[0], cy + by[1], current.enabled));
  };

  const zoom = (height: number) => {
    const { cx, cy } = centreOf(current);
    onChange(cropAt(height, cx, cy, current.enabled));
  };

  return (
    <PageSection
      title={t('liveStudio.vertical.title')}
      action={
        <Switch
          checked={current.enabled}
          onCheckedChange={(enabled) => onChange({ ...current, enabled })}
          aria-label={t('liveStudio.vertical.enabled')}
        />
      }
    >
      <p className="mb-3 text-xs text-zinc-500">{t('liveStudio.vertical.intro')}</p>
      <div
        ref={frameRef}
        aria-label={t('liveStudio.vertical.frame')}
        className="relative aspect-video w-full select-none overflow-hidden rounded-xl bg-[radial-gradient(120%_80%_at_30%_20%,#3f3f46_0%,#18181b_55%,#09090b_100%)]"
        style={{ opacity: current.enabled ? 1 : 0.45 }}
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label={t('liveStudio.vertical.box')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((current.x / Math.max(0.0001, 1 - current.w)) * 100)}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onKeyDown={nudge}
          className="absolute flex cursor-move items-center justify-center rounded-md outline-none ring-2 ring-white focus-visible:ring-4"
          style={{
            left: `${current.x * 100}%`,
            top: `${current.y * 100}%`,
            width: `${current.w * 100}%`,
            height: `${current.h * 100}%`,
            // Everything outside the box is what phones will not see.
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
          }}
        >
          <Smartphone className="h-5 w-5 text-white/70" aria-hidden />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-zinc-400">{t('liveStudio.vertical.zoom')}</span>
        <Slider
          className="flex-1"
          min={MIN_CROP_HEIGHT}
          max={1}
          step={0.01}
          // Higher is closer in, so the slider runs from the full height down.
          value={[1 + MIN_CROP_HEIGHT - current.h]}
          onValueChange={([v]) => zoom(1 + MIN_CROP_HEIGHT - v)}
          aria-label={t('liveStudio.vertical.zoom')}
        />
        <Button size="sm" variant="outline" onClick={() => onChange({ ...CENTRED_CROP, enabled: current.enabled })}>
          {t('liveStudio.vertical.centre')}
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{t('liveStudio.vertical.hint')}</p>
    </PageSection>
  );
}

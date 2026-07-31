/**
 * Design panel.
 * =============
 * The first thing a new project sees. Pick a format, pick a background, and
 * the canvas is set up. Before this the editor opened on an empty black
 * timeline with no indication of where to begin.
 */
import { useCallback } from 'react';
import { Film, Instagram, Monitor, Smartphone, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editorStore';
import { useEditorUiStore } from '@/store/editorUiStore';
import { aspectToDims, type AspectPreset } from '@/lib/editor/types';

const FORMATS: {
  preset: AspectPreset;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Preview box proportions inside the tile. */
  box: string;
}[] = [
  { preset: '16:9', label: 'Landscape', detail: 'YouTube, web', icon: Monitor, box: 'w-12 h-[27px]' },
  { preset: '9:16', label: 'Vertical', detail: 'Shorts, Reels', icon: Smartphone, box: 'w-[27px] h-12' },
  { preset: '1:1', label: 'Square', detail: 'Feed post', icon: Square, box: 'w-10 h-10' },
  { preset: '4:5', label: 'Portrait', detail: 'Instagram', icon: Instagram, box: 'w-[34px] h-[42px]' },
];

const BACKGROUNDS = ['#000000', '#0b0b0d', '#18181b', '#3f3f46', '#a1a1aa', '#f4f4f5', '#ffffff'];

export function DesignPanel() {
  const settings = useEditorStore((s) => s.settings);
  const updateSettings = useEditorStore((s) => s.updateSettings);
  const clips = useEditorStore((s) => s.clips);
  const setPanel = useEditorUiStore((s) => s.setPanel);

  const applyFormat = useCallback(
    (preset: AspectPreset) => {
      const { width, height } = aspectToDims(preset);
      updateSettings({ aspectPreset: preset, width, height });
    },
    [updateSettings],
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <PanelHeading>Format</PanelHeading>
      <div className="grid grid-cols-2 gap-2">
        {FORMATS.map((f) => {
          const active = settings.aspectPreset === f.preset;
          return (
            <button
              key={f.preset}
              type="button"
              onClick={() => applyFormat(f.preset)}
              aria-pressed={active}
              aria-label={`${f.label} ${f.preset} for ${f.detail}`}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-3 transition',
                active
                  ? 'border-white/40 bg-white/[0.12]'
                  : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.09]',
              )}
            >
              <span
                className={cn(
                  'rounded border',
                  f.box,
                  active ? 'border-white/60 bg-white/25' : 'border-white/25 bg-white/10',
                )}
              />
              <span className="text-center leading-tight">
                <span className="block text-[12px] font-semibold text-white">{f.label}</span>
                <span className="block text-[10px] text-white/40">{f.detail}</span>
              </span>
            </button>
          );
        })}
      </div>

      <PanelHeading className="mt-5">Canvas</PanelHeading>
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-white/50">Resolution</span>
          <span className="tabular-nums text-white/85">
            {settings.width} × {settings.height}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px]">
          <span className="text-white/50">Frame rate</span>
          <div className="flex gap-1">
            {[24, 30, 60].map((fps) => (
              <button
                key={fps}
                type="button"
                onClick={() => updateSettings({ fps })}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums transition',
                  settings.fps === fps
                    ? 'bg-white text-black'
                    : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white',
                )}
              >
                {fps}
              </button>
            ))}
          </div>
        </div>
      </div>

      <PanelHeading className="mt-5">Background</PanelHeading>
      <div className="flex flex-wrap gap-2">
        {BACKGROUNDS.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => updateSettings({ background: hex })}
            aria-label={`Background ${hex}`}
            aria-pressed={settings.background.toLowerCase() === hex}
            className={cn(
              'h-8 w-8 rounded-lg border transition',
              settings.background.toLowerCase() === hex
                ? 'border-white ring-2 ring-white/60'
                : 'border-white/20 hover:border-white/50',
            )}
            style={{ backgroundColor: hex }}
          />
        ))}
        <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-lg border border-white/20 transition hover:border-white/50">
          <span
            className="block h-full w-full"
            style={{
              background:
                'conic-gradient(from 180deg, #f4f4f5, #a1a1aa, #3f3f46, #18181b, #f4f4f5)',
            }}
          />
          <input
            type="color"
            value={settings.background}
            onChange={(e) => updateSettings({ background: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Custom background colour"
          />
        </label>
      </div>

      {clips.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-white/12 p-4 text-center">
          <Film className="mx-auto h-5 w-5 text-white/25" />
          <p className="mt-2 text-[13px] font-medium text-white/70">The timeline is empty</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/40">
            Bring in a file, generate something, or drop in a headline to get started.
          </p>
          <div className="mt-3 grid gap-1.5">
            <button
              type="button"
              onClick={() => setPanel('media')}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12px] font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
            >
              Import media
            </button>
            <button
              type="button"
              onClick={() => setPanel('generate')}
              className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-[12px] font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white"
            >
              Generate a clip
            </button>
            <button
              type="button"
              onClick={() => setPanel('text')}
              className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-[12px] font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white"
            >
              Add a headline
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PanelHeading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        'mb-2 px-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40',
        className,
      )}
    >
      {children}
    </h3>
  );
}

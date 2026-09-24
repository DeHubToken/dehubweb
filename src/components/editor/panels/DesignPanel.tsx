/**
 * Design panel.
 * =============
 * The first thing a new project sees. Pick a format, pick a background, and
 * the canvas is set up. Before this the editor opened on an empty black
 * timeline with no indication of where to begin.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Film, Instagram, Loader2, Monitor, Smartphone, Square } from 'lucide-react';
import { useEditorQuota } from '@/hooks/use-editor-quota';
import { TEMPLATES, applyTemplate, type EditorTemplate } from '@/lib/editor/templates';
import { loadGoogleFont } from '@/lib/editor/googleFonts';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editorStore';
import { useEditorUiStore } from '@/store/editorUiStore';
import { aspectToDims, type AspectPreset } from '@/lib/editor/types';

const FORMATS: {
  preset: AspectPreset;
  labelKey: string;
  detailKey: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Preview box proportions inside the tile. */
  box: string;
}[] = [
  { preset: '16:9', labelKey: 'editor.design.landscape', detailKey: 'editor.design.landscapeDetail', icon: Monitor, box: 'w-12 h-[27px]' },
  { preset: '9:16', labelKey: 'editor.design.vertical', detailKey: 'editor.design.verticalDetail', icon: Smartphone, box: 'w-[27px] h-12' },
  { preset: '1:1', labelKey: 'editor.design.square', detailKey: 'editor.design.squareDetail', icon: Square, box: 'w-10 h-10' },
  { preset: '4:5', labelKey: 'editor.design.portrait', detailKey: 'editor.design.portraitDetail', icon: Instagram, box: 'w-[34px] h-[42px]' },
];

const BACKGROUNDS = ['#000000', '#0b0b0d', '#18181b', '#3f3f46', '#a1a1aa', '#f4f4f5', '#ffffff'];

/** Preview box for a template tile, in the template's own proportions. */
const TILE_BOX: Record<string, string> = {
  '16:9': 'aspect-video',
  '9:16': 'aspect-[9/16]',
  '1:1': 'aspect-square',
  '4:5': 'aspect-[4/5]',
};

function TemplateTile({ template, busy, onPick }: { template: EditorTemplate; busy: boolean; onPick: () => void }) {
  const { t } = useTranslation();
  const title = t(template.titleKey);
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy}
      onMouseEnter={() => loadGoogleFont(template.preview.font, [400, 700, 900])}
      aria-label={t('editor.templates.use', { name: title })}
      title={title}
      className="group flex flex-col gap-1 text-left disabled:opacity-60"
    >
      <span
        className={cn(
          'relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-white/10 p-2 transition group-hover:border-white/40',
          TILE_BOX[template.aspect] ?? 'aspect-square',
        )}
        style={{ background: template.preview.bg }}
      >
        <span
          className="line-clamp-3 text-center text-[13px] font-black uppercase leading-none"
          style={{ color: template.preview.fg, fontFamily: `'${template.preview.font}', sans-serif` }}
        >
          {title}
        </span>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          </span>
        )}
      </span>
      <span className="truncate px-0.5 text-[10px] text-white/45">{template.aspect}</span>
    </button>
  );
}

export function DesignPanel() {
  const { t } = useTranslation();
  const quota = useEditorQuota();
  const [applyingId, setApplyingId] = useState<string | null>(null);
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

  const pickTemplate = async (template: EditorTemplate) => {
    if (applyingId) return;
    const hasWork = useEditorStore.getState().clips.length > 0;
    if (hasWork && !window.confirm(t('editor.templates.replaceConfirm'))) return;
    setApplyingId(template.id);
    try {
      await applyTemplate(template, t, { wallet: quota.walletAddress });
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <PanelHeading>{t('editor.templates.heading')}</PanelHeading>
      <div className="grid grid-cols-2 items-end gap-2">
        {TEMPLATES.map((tpl) => (
          <TemplateTile key={tpl.id} template={tpl} busy={applyingId === tpl.id} onPick={() => void pickTemplate(tpl)} />
        ))}
      </div>
      <p className="mt-2 px-0.5 text-[10px] leading-relaxed text-white/40">{t('editor.templates.hint')}</p>

      <PanelHeading className="mt-5">{t('editor.design.format')}</PanelHeading>
      <div className="grid grid-cols-2 gap-2">
        {FORMATS.map((f) => {
          const active = settings.aspectPreset === f.preset;
          return (
            <button
              key={f.preset}
              type="button"
              onClick={() => applyFormat(f.preset)}
              aria-pressed={active}
              aria-label={`${t(f.labelKey)} ${f.preset} · ${t(f.detailKey)}`}
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
                <span className="block text-[12px] font-semibold text-white">{t(f.labelKey)}</span>
                <span className="block text-[10px] text-white/40">{t(f.detailKey)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <PanelHeading className="mt-5">{t('editor.design.canvas')}</PanelHeading>
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-white/50">{t('editor.design.resolution')}</span>
          <span className="tabular-nums text-white/85">
            {settings.width} × {settings.height}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px]">
          <span className="text-white/50">{t('editor.design.frameRate')}</span>
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

      <PanelHeading className="mt-5">{t('editor.design.background')}</PanelHeading>
      <div className="flex flex-wrap gap-2">
        {BACKGROUNDS.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => updateSettings({ background: hex })}
            aria-label={t('editor.design.backgroundSwatch', { hex })}
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
            aria-label={t('editor.design.customBackground')}
          />
        </label>
      </div>

      {clips.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-white/12 p-4 text-center">
          <Film className="mx-auto h-5 w-5 text-white/25" />
          <p className="mt-2 text-[13px] font-medium text-white/70">{t('editor.design.emptyTitle')}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-white/40">
            {t('editor.design.emptyBody')}
          </p>
          <div className="mt-3 grid gap-1.5">
            <button
              type="button"
              onClick={() => setPanel('assets')}
              className="rounded-lg border border-white/25 bg-white px-3 py-2 text-[12px] font-semibold text-black transition hover:bg-white/85 active:scale-[0.98]"
            >
              {t('editor.design.browseAssets')}
            </button>
            <button
              type="button"
              onClick={() => setPanel('media')}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12px] font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
            >
              {t('editor.design.importMedia')}
            </button>
            <button
              type="button"
              onClick={() => setPanel('generate')}
              className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-[12px] font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white"
            >
              {t('editor.design.generateClip')}
            </button>
            <button
              type="button"
              onClick={() => setPanel('text')}
              className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-[12px] font-medium text-white/85 transition hover:border-white/30 hover:bg-white/[0.12] hover:text-white"
            >
              {t('editor.design.addHeadline')}
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

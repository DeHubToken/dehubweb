/**
 * Brand kit in the Design panel: colours, heading and body fonts, and a logo.
 * "Apply brand" restyles the whole design in one undo; the AI agent also uses
 * the kit on its own.
 */
import { useTranslation } from 'react-i18next';
import { Plus, Stamp, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useBrandStore, hasBrand } from '@/store/editorBrandStore';
import { useEditorStore } from '@/store/editorStore';
import { FontPicker } from '@/components/editor/FontPicker';
import { applyBrand, addBrandLogo } from '@/lib/editor/brand';
import { PanelHeading } from './DesignPanel';

export function BrandSection() {
  const { t } = useTranslation();
  const kit = useBrandStore((s) => s.kit);
  const update = useBrandStore((s) => s.update);
  const addColor = useBrandStore((s) => s.addColor);
  const removeColor = useBrandStore((s) => s.removeColor);
  const media = useEditorStore((s) => s.media);
  const images = media.filter((m) => m.kind === 'image');
  const logo = images.find((m) => m.id === kit.logoMediaId);

  return (
    <>
      <PanelHeading className="mt-5">{t('editor.brand.heading')}</PanelHeading>
      <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-white/40">{t('editor.brand.colors')}</p>
          <div className="flex flex-wrap gap-1.5">
            {kit.colors.map((c) => (
              <span key={c} className="group relative">
                <span className="block h-7 w-7 rounded-md border border-white/20" style={{ background: c }} title={c} />
                <button
                  type="button"
                  onClick={() => removeColor(c)}
                  aria-label={t('editor.brand.removeColor', { color: c })}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-black text-white ring-1 ring-white/40 group-hover:flex"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            <label
              title={t('editor.brand.addColor')}
              className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-dashed border-white/30 text-white/60 hover:border-white/60 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              <input
                type="color"
                aria-label={t('editor.brand.addColor')}
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) => addColor(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-white/40">{t('editor.brand.headingFont')}</p>
          <FontPicker value={kit.headingFont ?? 'Inter'} onChange={(css) => update({ headingFont: css })} />
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-white/40">{t('editor.brand.bodyFont')}</p>
          <FontPicker value={kit.bodyFont ?? 'Inter'} onChange={(css) => update({ bodyFont: css })} />
        </div>

        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-white/40">{t('editor.brand.logo')}</p>
          {images.length ? (
            <select
              value={kit.logoMediaId ?? ''}
              onChange={(e) => update({ logoMediaId: e.target.value || null })}
              className="h-8 w-full rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white"
            >
              <option value="" className="bg-black">{t('editor.brand.noLogo')}</option>
              {images.map((m) => (
                <option key={m.id} value={m.id} className="bg-black">{m.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-[11px] text-white/40">{t('editor.brand.logoHint')}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <button
            type="button"
            disabled={!hasBrand(kit)}
            onClick={async () => {
              const n = await applyBrand();
              toast.success(t('editor.brand.applied', { count: n }));
            }}
            className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-white text-[11px] font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
          >
            <Wand2 className="h-3.5 w-3.5" /> {t('editor.brand.apply')}
          </button>
          <button
            type="button"
            disabled={!logo}
            onClick={() => addBrandLogo()}
            className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/15 text-[11px] font-medium text-white/85 transition hover:bg-white/10 disabled:opacity-40"
          >
            <Stamp className="h-3.5 w-3.5" /> {t('editor.brand.addLogo')}
          </button>
        </div>
      </div>
    </>
  );
}

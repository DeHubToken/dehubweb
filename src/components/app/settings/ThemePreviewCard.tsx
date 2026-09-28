import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';

/**
 * A thumbnail of the app in one theme: the theme's real backdrop (a still of
 * the live canvas, public/theme-previews/) with a miniature feed drawn over it
 * in that theme's own surfaces — nav pill, two post bentos, bottom bar.
 *
 * Every colour is inline on purpose. The theme stylesheets recolour zinc
 * classes and spans on whichever theme is *active*, which would paint every
 * thumbnail in the current theme instead of its own. `data-theme-option` sits
 * on the frame only, so each theme's picker styling (war-theme.css,
 * osaka-theme.css, jungle-theme.css) still reaches the selection ring.
 *
 * The same palette lives in dehub-mobile components/Settings/ThemePicker.tsx.
 */
type Swatch = {
  page: string;
  image?: string;
  bento: string;
  border: string;
  line: string;
  faint: string;
  accent: string;
  square?: boolean;
  /** Minimal: bentos dissolve into the canvas, hairlines separate. */
  flat?: boolean;
};

const GLASS = { bento: 'rgba(9,9,11,0.82)', border: 'rgba(255,255,255,0.12)', line: 'rgba(255,255,255,0.78)', faint: 'rgba(255,255,255,0.28)', accent: '#ffffff' };

export const THEME_SWATCHES: Record<string, Swatch> = {
  system: { page: '#000000', bento: '#18181b', border: 'rgba(255,255,255,0.06)', line: 'rgba(255,255,255,0.8)', faint: 'rgba(255,255,255,0.22)', accent: '#ffffff' },
  light: { page: '#f4f4f5', bento: '#ffffff', border: '#e4e4e7', line: '#18181b', faint: '#d4d4d8', accent: '#18181b' },
  minimal: { page: '#000000', bento: 'transparent', border: 'rgba(255,255,255,0.1)', line: 'rgba(255,255,255,0.8)', faint: 'rgba(255,255,255,0.22)', accent: '#ffffff', square: true, flat: true },
  cosmic: { page: '#040407', image: 'cosmic', ...GLASS },
  hazy: { page: '#0a0714', image: 'hazy', ...GLASS },
  swarms: { page: '#03080d', image: 'swarms', ...GLASS },
  lavalamp: { page: '#120704', image: 'lavalamp', ...GLASS },
  winter: { page: '#05070a', image: 'winter', ...GLASS },
  war: { page: '#060a09', image: 'war', bento: 'rgba(14,20,18,0.82)', border: 'rgba(79,227,224,0.4)', line: 'rgba(214,208,190,0.9)', faint: 'rgba(79,227,224,0.3)', accent: '#4fe3e0', square: true },
  osaka: { page: '#0a0812', image: 'osaka', bento: 'rgba(17,14,28,0.8)', border: 'rgba(255,111,181,0.28)', line: 'rgba(236,233,245,0.9)', faint: 'rgba(176,170,196,0.35)', accent: '#ff6fb5' },
  island: { page: '#1a2a4a', image: 'island', bento: 'rgba(220,245,255,0.16)', border: 'rgba(255,255,255,0.4)', line: 'rgba(255,255,255,0.9)', faint: 'rgba(255,255,255,0.4)', accent: '#ff7a8a' },
  hacker: { page: '#000000', image: 'hacker', bento: 'rgba(0,8,3,0.88)', border: 'rgba(57,255,136,0.45)', line: 'rgba(57,255,136,0.95)', faint: 'rgba(57,255,136,0.28)', accent: '#39ff88', square: true },
  horror: { page: '#0b0c0d', image: 'horror', bento: 'rgba(10,10,12,0.74)', border: 'rgba(255,255,255,0.16)', line: 'rgba(234,234,234,0.9)', faint: 'rgba(255,255,255,0.22)', accent: '#ff2b2b' },
  jungle: { page: '#16110c', image: 'jungle', bento: 'rgba(38,28,19,0.86)', border: 'rgba(226,176,96,0.28)', line: 'rgba(246,240,227,0.9)', faint: 'rgba(198,182,158,0.35)', accent: '#e2b060' },
};

const COMING_SOON: Swatch = { page: '#0b0b0d', bento: '#18181b', border: 'rgba(255,255,255,0.06)', line: 'rgba(255,255,255,0.35)', faint: 'rgba(255,255,255,0.12)', accent: 'rgba(255,255,255,0.35)' };

function MockPost({ s, media }: { s: Swatch; media?: boolean }) {
  const r = s.square ? 0 : 6;
  const style: CSSProperties = s.flat
    ? { borderBottom: `1px solid ${s.border}`, padding: '6px 2px' }
    : { background: s.bento, border: `1px solid ${s.border}`, borderRadius: r, padding: 6 };
  return (
    <div style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 10, height: 10, borderRadius: s.square ? 0 : 999, background: s.faint }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: 3, width: '60%', borderRadius: 2, background: s.line }} />
          <div style={{ height: 3, width: '38%', marginTop: 3, borderRadius: 2, background: s.faint }} />
        </div>
      </div>
      {media ? <div style={{ height: 30, marginTop: 6, borderRadius: s.square ? 0 : 4, background: s.faint }} /> : null}
    </div>
  );
}

interface ThemePreviewCardProps {
  value: string;
  label: string;
  active: boolean;
  available: boolean;
  onSelect: () => void;
}

export function ThemePreviewCard({ value, label, active, available, onSelect }: ThemePreviewCardProps) {
  const s = THEME_SWATCHES[value] ?? COMING_SOON;
  const pad = s.square ? 0 : 999;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={label}
      className={cn('group flex shrink-0 flex-col items-center gap-2', !available && 'cursor-not-allowed opacity-40')}
    >
      <div
        data-theme-option
        data-active={active ? 'true' : 'false'}
        className={cn(
          'relative h-[160px] w-[112px] overflow-hidden rounded-xl border-2 transition-[border-color,transform] duration-200',
          active ? 'border-white' : 'border-transparent group-hover:border-white/30',
          available && 'group-active:scale-[0.97]',
        )}
      >
        {/* Page colour on a layer, not the frame: the war and jungle picker
            rules repaint the frame's own background with !important. */}
        <div className="absolute inset-0" style={{ backgroundColor: s.page }} />
        {s.image ? (
          <img
            src={`/theme-previews/${s.image}.webp`}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 flex flex-col gap-[6px] p-[7px]" aria-hidden>
          <div
            style={{
              height: 12,
              borderRadius: pad,
              background: s.flat ? 'transparent' : s.bento,
              border: `1px solid ${s.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              padding: '0 6px',
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ width: 4, height: 4, borderRadius: s.square ? 0 : 999, background: i === 0 ? s.accent : s.faint }} />
            ))}
          </div>
          <MockPost s={s} media />
          <MockPost s={s} />
          <div className="flex-1" />
          <div
            style={{
              height: 14,
              margin: '0 10px',
              borderRadius: s.square ? 0 : 7,
              background: s.flat ? 'transparent' : s.bento,
              border: `1px solid ${s.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 10, height: 6, borderRadius: s.square ? 0 : 2, background: s.accent }} />
          </div>
        </div>
      </div>
      <span className={cn('max-w-[112px] truncate text-sm', active ? 'font-medium text-white' : 'text-zinc-400')}>{label}</span>
    </button>
  );
}

import type { LucideIcon } from 'lucide-react';

/** Crisp strokes only: no blur, glow, filter or shadow around the control. */
export function MediaControlIcon({ icon: Icon, captions = false, spinning = false }: { icon?: LucideIcon; captions?: boolean; spinning?: boolean }) {
  const glyph = (outline: boolean) => captions ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={outline ? 'rgba(0,0,0,0.8)' : '#fff'} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-video-glyph-outline={outline || undefined} style={{ position: 'relative', zIndex: outline ? 0 : 1 }}>
      <rect x="3" y="5" width="18" height="14" rx="2" strokeWidth={outline ? 3 : 1.75} />
      <path d="M10 9H8a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2M17 9h-2a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2" strokeWidth={outline ? 2.5 : 1.25} />
    </svg>
  ) : Icon ? <Icon size={18} strokeWidth={outline ? 3 : 1.75} stroke={outline ? 'rgba(0,0,0,0.8)' : '#fff'} aria-hidden="true" data-video-glyph-outline={outline || undefined} style={{ position: 'relative', zIndex: outline ? 0 : 1 }} /> : null;
  return <span data-video-glyph className={spinning ? 'relative inline-flex h-[18px] w-[18px] animate-spin' : 'relative inline-flex h-[18px] w-[18px]'}>
    <span className="absolute inset-0" aria-hidden="true">{glyph(true)}</span>
    {glyph(false)}
  </span>;
}

import type { LucideIcon } from 'lucide-react';

/** Crisp strokes only: no blur, glow, filter or shadow around the control. */
export function MediaControlIcon({ icon: Icon, captions = false, spinning = false, active = false, size = 18 }: { icon?: LucideIcon; captions?: boolean; spinning?: boolean; active?: boolean; size?: number }) {
  const foreground = active ? '#000' : '#fff';
  const outlineColor = active ? '#fff' : 'rgba(0,0,0,0.8)';
  const glyph = (outline: boolean) => captions ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={outline ? outlineColor : foreground} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-video-glyph-outline={outline || undefined} style={{ position: 'relative', zIndex: outline ? 0 : 1 }}>
      <rect x="3" y="5" width="18" height="14" rx="2" strokeWidth={outline ? 3 : 1.75} />
      <path d="M10 9H8a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2M17 9h-2a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2" strokeWidth={outline ? 2.5 : 1.25} />
    </svg>
  ) : Icon ? <Icon size={size} strokeWidth={outline ? 3 : 1.75} stroke={outline ? outlineColor : foreground} aria-hidden="true" data-video-glyph-outline={outline || undefined} style={{ position: 'relative', zIndex: outline ? 0 : 1 }} /> : null;
  return <span data-video-glyph data-video-glyph-active={active || undefined} className={spinning ? 'relative inline-flex animate-spin' : 'relative inline-flex'} style={{ width: size, height: size }}>
    <span className="absolute inset-0" aria-hidden="true">{glyph(true)}</span>
    {glyph(false)}
  </span>;
}

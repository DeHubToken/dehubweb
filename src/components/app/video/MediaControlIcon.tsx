import Captions from '@/components/ui/cut-icons/captions';
import type { LucideIcon } from 'lucide-react';

/** Crisp strokes only: no blur, glow, filter or shadow around the control. */
export function MediaControlIcon({ icon: Icon, captions = false, spinning = false, active = false, size = 18 }: { icon?: LucideIcon; captions?: boolean; spinning?: boolean; active?: boolean; size?: number }) {
  const foreground = active ? '#000' : '#fff';
  const outlineColor = active ? '#fff' : 'rgba(0,0,0,0.8)';
  const Glyph = captions ? Captions : Icon;
  const glyph = (outline: boolean) => Glyph ? <Glyph size={size} strokeWidth={outline ? 3 : 1.75} color={outline ? outlineColor : foreground} stroke={outline ? outlineColor : foreground} aria-hidden="true" data-video-glyph-outline={outline || undefined} style={{ position: 'relative', zIndex: outline ? 0 : 1 }} /> : null;
  return <span data-video-glyph data-video-glyph-active={active || undefined} className={spinning ? 'relative inline-flex animate-spin' : 'relative inline-flex'} style={{ width: size, height: size }}>
    <span className="absolute inset-0" aria-hidden="true">{glyph(true)}</span>
    {glyph(false)}
  </span>;
}

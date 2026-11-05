import { readShape } from '@/lib/remembered-shape';

/** Phones and wider screens lay the studio deck out differently. */
export function audioStudioShapeKey(): string {
  return typeof window !== 'undefined' && window.innerWidth < 640 ? 'audio-studio:phone' : 'audio-studio:wide';
}

/**
 * Height the audio studio deck had last time on this kind of screen, so the
 * placeholder shown while its code loads is the same size and the card does
 * not grow when it arrives. A first visit on a phone assumes the usual deck.
 */
export function audioStudioPlaceholderHeight(): number | undefined {
  const key = audioStudioShapeKey();
  return readShape(key) ?? (key === 'audio-studio:phone' ? 394 : undefined);
}

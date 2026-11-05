/**
 * Back keeps your place
 * =====================
 * Every history entry remembers how far down the page was scrolled. Going
 * back (or forward) to it puts the page back at that offset, so a profile,
 * Explore or a standalone post never drops you at the top after you open
 * something from it.
 *
 * The page coming back may still be loading (a profile remounts and its
 * grid fills in a moment later), so the offset is written again on each
 * frame until the page is tall enough to hold it, for at most
 * RESTORE_WINDOW_MS. Any touch, wheel or key from the reader stops it at
 * once: their own scroll always wins.
 */

import { getDocumentScrollTop, scrollDocumentTo } from '@/lib/document-scroll';

const RESTORE_WINDOW_MS = 1500;
const saved = new Map<string, number>();
const MAX_ENTRIES = 200;

export function rememberScroll(key: string, top: number): void {
  if (saved.has(key)) saved.delete(key);
  saved.set(key, top);
  if (saved.size > MAX_ENTRIES) {
    const oldest = saved.keys().next().value;
    if (oldest !== undefined) saved.delete(oldest);
  }
}

export function savedScroll(key: string): number | undefined {
  return saved.get(key);
}

/** Read `history.state.idx`, the counter react-router keeps per entry. */
export function historyIndex(): number {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === 'number' ? idx : 0;
}

/**
 * Put the page at `top` now and keep it there while the page fills in.
 * Returns a cancel function.
 */
export function restoreDocumentScroll(top: number): () => void {
  scrollDocumentTo(top);
  if (top <= 0) return () => {};

  let frame = 0;
  let done = false;
  const started = performance.now();
  const stop = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    window.removeEventListener('touchstart', stop, true);
    window.removeEventListener('wheel', stop, true);
    window.removeEventListener('keydown', stop, true);
  };
  window.addEventListener('touchstart', stop, { capture: true, passive: true });
  window.addEventListener('wheel', stop, { capture: true, passive: true });
  window.addEventListener('keydown', stop, true);

  const tick = () => {
    if (done) return;
    if (Math.abs(getDocumentScrollTop() - top) > 1) scrollDocumentTo(top);
    const settled = Math.abs(getDocumentScrollTop() - top) <= 1;
    // Keep holding for a short while even once it lands: late content above
    // (a header image, a pinned row) can still push the page.
    if (performance.now() - started > RESTORE_WINDOW_MS || (settled && performance.now() - started > 400)) {
      stop();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return stop;
}

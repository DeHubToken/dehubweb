/**
 * Jungle cinematic bus.
 * =====================
 * The Jungle theme's background is not only chrome — it is also the game's
 * establishing shot. When a player deploys, the app chrome slides away and the
 * SAME canvas that was sitting behind the feed a second earlier dollies forward
 * down the trail, so the hand-off reads as one continuous camera move rather
 * than as "a website, then an iframe".
 *
 * That needs two things to agree on a number:
 *   - JungleGameLauncher, which owns the phase (idle -> pushing -> handed off),
 *   - JungleBackground, whose render loop reads the push each frame.
 *
 * They are lazy siblings that never share a parent below <App>, and the value
 * changes at 60 Hz during the move, so React context would mean re-rendering
 * the whole subtree once a frame. A module-level store with a subscribe hook is
 * the smaller, cheaper answer, and it also survives either side being unmounted
 * (the background is free to be absent; the launcher still animates the DOM).
 *
 * `push` is 0 at rest and 1 at full dolly. Nothing here animates it — the
 * launcher drives it with its own rAF so the easing lives next to the DOM
 * transition it has to stay in sync with.
 */

export type JunglePhase = 'idle' | 'pushing' | 'in-game';

let push = 0;
let phase: JunglePhase = 'idle';

const pushListeners = new Set<(value: number) => void>();
const phaseListeners = new Set<(value: JunglePhase) => void>();

/** Current dolly amount, 0 (feed) to 1 (fully pushed into the trail). */
export function getJunglePush(): number {
  return push;
}

export function setJunglePush(value: number): void {
  const next = Math.max(0, Math.min(1, value));
  if (next === push) return;
  push = next;
  for (const fn of pushListeners) fn(next);
}

/**
 * Subscribe to the dolly value. Returns an unsubscribe.
 *
 * The background does NOT re-render on this — it stores the number on a ref and
 * lets its existing rAF loop pick it up. Subscribing exists so the loop can be
 * woken when it is idling at a throttled frame rate.
 */
export function subscribeJunglePush(fn: (value: number) => void): () => void {
  pushListeners.add(fn);
  return () => pushListeners.delete(fn);
}

export function getJunglePhase(): JunglePhase {
  return phase;
}

/**
 * Set the phase. Also mirrored onto <html data-jungle-phase> so the CSS half of
 * the transition (panels sliding out, chrome fading) can be driven entirely by
 * stylesheets, with no per-element inline styles to clean up afterwards.
 */
export function setJunglePhase(value: JunglePhase): void {
  if (value === phase) return;
  phase = value;
  if (typeof document !== 'undefined') {
    if (value === 'idle') {
      delete document.documentElement.dataset.junglePhase;
    } else {
      document.documentElement.dataset.junglePhase = value;
    }
  }
  for (const fn of phaseListeners) fn(value);
}

export function subscribeJunglePhase(fn: (value: JunglePhase) => void): () => void {
  phaseListeners.add(fn);
  return () => phaseListeners.delete(fn);
}

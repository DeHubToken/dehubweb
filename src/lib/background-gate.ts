/**
 * Background render gate
 * ======================
 * A tiny process-wide observable boolean that lets heavy full-screen WebGL
 * backgrounds pause their render loop when a full-page surface (docs / blog)
 * is composited on top of them.
 *
 * WHY: the docs/blog surface renders large `backdrop-blur` liquid-glass panels
 * directly over the persistent canvas. Running the fbm/particle shaders at full
 * rate *underneath* that blur is pure wasted GPU fill-rate — enough to hang or
 * crash weaker GPUs the moment docs opens (the canvas is barely visible through
 * the blur, so a frozen frame is indistinguishable from an animated one).
 *
 * Backgrounds subscribe and stop their `requestAnimationFrame` loop while
 * `paused` is true, then resume when it flips back. The cosmic/lavalamp/swarms/
 * hazy loops all consult this via `createRenderGate` or a direct subscription.
 */

let paused = false;
const listeners = new Set<(paused: boolean) => void>();
// Handle for a pending deferred resume (see scheduleBackgroundResume). Any
// explicit setBackgroundPaused() cancels it, so re-opening docs before the
// resume fires can never leave the canvas running under the glass.
let resumeTimer: ReturnType<typeof setTimeout> | null = null;

function cancelScheduledResume(): void {
  if (resumeTimer !== null) {
    clearTimeout(resumeTimer);
    resumeTimer = null;
  }
}

/** Current paused state (backgrounds should not render while true). */
export function isBackgroundPaused(): boolean {
  return paused;
}

/** Pause or resume all subscribed backgrounds. Idempotent. */
export function setBackgroundPaused(next: boolean): void {
  // An explicit set always wins over a pending deferred resume.
  cancelScheduledResume();
  if (paused === next) return;
  paused = next;
  listeners.forEach((fn) => {
    try {
      fn(paused);
    } catch {
      /* a single subscriber throwing must not break the others */
    }
  });
}

/**
 * Resume the background AFTER the current app↔docs slide-in, on idle.
 *
 * Resuming the fbm/particle shaders is a GPU/CPU spike. Doing it synchronously
 * in a docs-surface unmount effect lands that spike right on top of the app
 * panels sliding back in, which janks or outright freezes weaker machines. This
 * waits out the slide-in on a calm main thread, then spins the canvas back up
 * on idle — so the side panels always come back fluidly and the (imperceptible,
 * blurred-away) background catches up a beat later.
 *
 * Any subsequent setBackgroundPaused() (e.g. docs re-opening) cancels the
 * pending resume, and the deferred callback bails if a docs/blog surface is
 * open again by the time it runs.
 */
export function scheduleBackgroundResume(delayMs = 520): void {
  cancelScheduledResume();
  resumeTimer = setTimeout(() => {
    resumeTimer = null;
    const run = () => {
      // A docs/blog surface re-opened while we waited — leave it paused.
      if (typeof document !== 'undefined' && document.documentElement.dataset.docsOpen) return;
      setBackgroundPaused(false);
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
        .requestIdleCallback(run, { timeout: 400 });
    } else {
      run();
    }
  }, delayMs);
}

/** Subscribe to paused-state changes. Returns an unsubscribe fn. */
export function subscribeBackgroundPaused(fn: (paused: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

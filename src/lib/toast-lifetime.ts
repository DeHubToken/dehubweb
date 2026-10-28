/**
 * How long any toast may stay on screen, whatever its caller asked for.
 *
 * Sonner pauses a toast's timer for as long as the pointer rests on the toast
 * stack, and a tap on a phone leaves a mouse pointer behind at the tap until
 * the next tap somewhere else. A cursor parked at the top of the page after
 * signing in held "Welcome back!" up indefinitely. Callers also ask for
 * `duration: Infinity`, and a loading toast that pins itself that way keeps the
 * pin when it is later turned into a success.
 *
 * So the toaster runs a second clock per toast (ui/sonner's lifetime guard)
 * that hover does not pause. The numbers:
 *  - plain toasts: what they asked for, at most 8s;
 *  - errors and warnings: at most 12s, they usually carry an explanation;
 *  - anything with a button to press: at most 15s;
 *  - loading toasts: 2 minutes without a change. Each progress update restarts
 *    it, and the finished state replaces the toast anyway.
 * plus a short grace so a reader hovering to finish the sentence gets it.
 */

export const TOAST_DEFAULT_MS = 3000;
export const TOAST_MAX_MS = 8000;
export const TOAST_ERROR_MAX_MS = 12_000;
export const TOAST_ACTION_MAX_MS = 15_000;
export const TOAST_LOADING_MAX_MS = 120_000;
export const TOAST_HOVER_GRACE_MS = 2000;

export interface LifetimeToast {
  type?: string;
  duration?: number;
  title?: unknown;
  description?: unknown;
  action?: unknown;
  cancel?: unknown;
}

function hasButtons(t: LifetimeToast): boolean {
  if (t.action || t.cancel) return true;
  // A React element in the body is how this app adds its own buttons
  // (the version and notification prompts); plain text never has one.
  const isElement = (v: unknown) => v != null && typeof v === 'object';
  return isElement(t.title) || isElement(t.description);
}

/** Milliseconds from when this toast (in this state) appeared to its forced close. */
export function toastLifetimeMs(t: LifetimeToast, toasterDefault = TOAST_DEFAULT_MS): number {
  if (t.type === 'loading') return TOAST_LOADING_MAX_MS;
  const cap = hasButtons(t)
    ? TOAST_ACTION_MAX_MS
    : t.type === 'error' || t.type === 'warning'
      ? TOAST_ERROR_MAX_MS
      : TOAST_MAX_MS;
  const asked = typeof t.duration === 'number' && t.duration > 0 ? t.duration : toasterDefault;
  return Math.min(asked, cap) + TOAST_HOVER_GRACE_MS;
}

/**
 * What restarts the clock: the toast becoming something else (loading turning
 * into success, a progress label moving). Re-raising the same words does not.
 */
export function toastStateKey(t: LifetimeToast): string {
  const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : typeof v);
  return [t.type ?? 'default', text(t.title), text(t.description), String(t.duration)].join('\u0000');
}

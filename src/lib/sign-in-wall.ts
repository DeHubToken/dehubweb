/**
 * Signed-out reading ends a little way into any feed (riftn-backend
 * common/util/signed-out-wall.ts: 100 posts). Past that the API answers an
 * empty page flagged `signInRequired`, which ends the feed on its own; this
 * turns it into the sign-in sheet, once a minute at most, so scrolling to the
 * bottom of Explore signed out asks you to sign in the way X does.
 */

export const SIGN_IN_WALL_EVENT = 'riftn:sign-in-wall';
const QUIET_MS = 60_000;
let lastAsked = 0;

export function isSignInWall(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as { signInRequired?: unknown }).signInRequired === true;
}

/** Call with any /api/feed response body. Opens the sign-in sheet when it hit the wall. */
export function noteSignInWall(body: unknown): void {
  if (!isSignInWall(body) || typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastAsked < QUIET_MS) return;
  lastAsked = now;
  window.dispatchEvent(new CustomEvent(SIGN_IN_WALL_EVENT));
}

/** Tests only. */
export function resetSignInWallForTests(): void {
  lastAsked = 0;
}

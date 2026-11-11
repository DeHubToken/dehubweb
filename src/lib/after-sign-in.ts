/**
 * After sign-in
 * =============
 * A signed-out tap on something that needs an account opens the sign-in sheet
 * over the page they are on. Once they are signed in, the thing they tapped
 * carries on: the page they were heading to opens, or the button they pressed
 * is pressed again (now with an account behind it).
 *
 * Three kinds of follow-up, in order of preference:
 * - `run`  — a callback the caller hands to openLoginModal({ then }).
 * - `path` — a page to open. Kept in sessionStorage too, so a redirect login
 *            (Google, X, Apple...) that reloads the tab still lands there.
 * - `tap`  — the button pressed just before the sheet opened, replayed with a
 *            click if it is still on screen and looks exactly as it did.
 *
 * AfterSignIn (components/app/AfterSignIn) runs it once the login flow goes
 * quiet with a new account signed in, and drops it when the flow ends without
 * one.
 */

const STORAGE_KEY = 'riftn.afterSignIn';
/** A follow-up older than this is from a sign-in the user walked away from. */
const MAX_AGE_MS = 10 * 60 * 1000;
/** How recent a tap must be to count as the one that opened the sheet. */
const TAP_WINDOW_MS = 1200;

/**
 * Pages that are only about the signed-in account. A signed-out tap on a link
 * to one of these opens the sign-in sheet in place, and the page opens after.
 */
const ACCOUNT_ONLY_PATHS = new Set([
  '/app/notifications', '/notifications',
  '/app/messages', '/messages',
  '/app/assistant', '/assistant',
  '/app/bookmarks', '/bookmarks',
  '/app/settings', '/settings',
  '/app/command-centre', '/command-centre',
  '/app/wallet',
  '/app/buy', '/buy',
  '/app/live-studio', '/live-studio',
  '/app/affiliate', '/affiliate',
  '/app/profile', '/profile',
]);

export function isAccountOnlyPath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ACCOUNT_ONLY_PATHS.has(normalized);
}

interface TapRecord {
  el: HTMLElement;
  snapshot: string;
  at: number;
}

export interface AfterSignInAction {
  run?: () => void;
  path?: string;
  tap?: TapRecord;
  /** The wallet signed in when the sheet opened; a follow-up needs a new one. */
  fromAddress: string | null;
  at: number;
}

let pending: AfterSignInAction | null = null;
let lastTap: TapRecord | null = null;

const LOGIN_LABEL = /\b(log\s?in|login|sign\s?in|sign\s?up|connect wallet|create account|get started)\b/i;

function snapshotOf(el: HTMLElement): string {
  return [
    el.className && typeof el.className === 'string' ? el.className : '',
    el.getAttribute('aria-pressed') ?? '',
    el.getAttribute('aria-checked') ?? '',
    el.getAttribute('aria-expanded') ?? '',
    el.getAttribute('data-state') ?? '',
    el.getAttribute('aria-label') ?? '',
    (el.textContent ?? '').trim().slice(0, 120),
  ].join('|');
}

/** Called for every click (capture phase): remembers the button that was pressed. */
export function recordTap(target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  const el = target.closest('button, [role="button"], [data-after-sign-in]') as HTMLElement | null;
  if (!el) {
    lastTap = null;
    return;
  }
  lastTap = { el, snapshot: snapshotOf(el), at: Date.now() };
}

function replayable(tap: TapRecord): boolean {
  const el = tap.el;
  if (el.hasAttribute('data-no-after-sign-in')) return false;
  if (el.closest('[data-login-sheet], [data-auth-gate]')) return false;
  const label = `${el.getAttribute('aria-label') ?? ''} ${el.textContent ?? ''}`;
  if (LOGIN_LABEL.test(label)) return false;
  return true;
}

function readStoredPath(): { path: string; fromAddress: string | null; at: number } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.path !== 'string' || typeof parsed?.at !== 'number') return null;
    return { path: parsed.path, fromAddress: parsed.fromAddress ?? null, at: parsed.at };
  } catch {
    return null;
  }
}

function writeStoredPath(path: string | undefined, fromAddress: string | null, at: number): void {
  try {
    if (path) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ path, fromAddress, at }));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode: the in-memory copy still covers sheet logins */
  }
}

/**
 * Remember what to do once this sign-in finishes. With no `run` or `path`, the
 * button tapped a moment ago is the follow-up.
 */
export function armAfterSignIn(options: { run?: () => void; path?: string; fromAddress: string | null }): void {
  const now = Date.now();
  let tap: TapRecord | undefined;
  if (!options.run && !options.path && lastTap && now - lastTap.at <= TAP_WINDOW_MS && replayable(lastTap)) {
    tap = lastTap;
  }
  lastTap = null;
  if (!options.run && !options.path && !tap) {
    // A sheet opened with nothing to continue (the Log in button, a session
    // expiry) must not inherit an older follow-up.
    clearAfterSignIn();
    return;
  }
  pending = { run: options.run, path: options.path, tap, fromAddress: options.fromAddress, at: now };
  writeStoredPath(options.path, options.fromAddress, now);
}

export function clearAfterSignIn(): void {
  pending = null;
  writeStoredPath(undefined, null, 0);
}

export function hasAfterSignIn(): boolean {
  return !!pending || !!readStoredPath();
}

/**
 * Take the follow-up for a sign-in that just finished as `address`. Returns
 * null when there is none, it is stale, or the same account was already signed
 * in when the sheet opened (an unlock or add-profile sheet, not a sign-in).
 */
export function takeAfterSignIn(address: string | null): AfterSignInAction | null {
  const now = Date.now();
  let action: AfterSignInAction | null = pending;
  if (!action) {
    const stored = readStoredPath();
    if (stored) action = { path: stored.path, fromAddress: stored.fromAddress, at: stored.at };
  }
  clearAfterSignIn();
  if (!action || !address) return null;
  if (now - action.at > MAX_AGE_MS) return null;
  if (action.fromAddress && action.fromAddress.toLowerCase() === address.toLowerCase()) return null;
  return action;
}

/** Press the remembered button again, if it is still there and unchanged. */
export function replayTap(tap: TapRecord): boolean {
  const el = tap.el;
  if (!el.isConnected) return false;
  if (snapshotOf(el) !== tap.snapshot) return false;
  if ((el as HTMLButtonElement).disabled) return false;
  el.click();
  return true;
}

/**
 * An account-only page asked for the sheet as it stepped back off itself. The
 * sheet opens once the step back has landed: opened first, the phone Back
 * entry the sheet pushes (lib/overlay-open) would take the step and close it.
 */
let sheetAfterLeave: { from: string; at: number } | null = null;

export function requestSheetAfterLeave(from: string): void {
  sheetAfterLeave = { from, at: Date.now() };
}

/** The page to open after sign-in, once the step back has left `from`. */
export function takeSheetAfterLeave(currentPath: string): string | null {
  const req = sheetAfterLeave;
  if (!req) return null;
  if (Date.now() - req.at > 5000) {
    sheetAfterLeave = null;
    return null;
  }
  const fromPath = req.from.split(/[?#]/)[0];
  if (currentPath === fromPath) return null;
  sheetAfterLeave = null;
  return req.from;
}

let signedOutAt = 0;

/** The user just signed out on purpose (Settings, the profile menu...). */
export function noteSignedOut(): void {
  signedOutAt = Date.now();
}

/** True for a few seconds after a sign-out the user asked for. */
export function signedOutRecently(): boolean {
  return Date.now() - signedOutAt < 8000;
}

/** Test hook. */
export function __resetAfterSignInForTests(): void {
  pending = null;
  lastTap = null;
  signedOutAt = 0;
  sheetAfterLeave = null;
  writeStoredPath(undefined, null, 0);
}

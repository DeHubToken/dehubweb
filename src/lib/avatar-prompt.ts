/**
 * "Add a profile photo" prompt for signed-in accounts with no picture.
 *
 * Shown once per app open at most, from the second open onward (the open that
 * ran the sign-up welcome flow already offered a photo step), and never more
 * than MAX_SHOWS times per account on this device, each at least GAP_MS apart.
 * Adding a photo anywhere retires it, because the account then has one.
 */

export const AVATAR_PROMPT_MAX_SHOWS = 3;
export const AVATAR_PROMPT_GAP_MS = 3 * 24 * 60 * 60 * 1000;

const STATE_PREFIX = 'dehub_avatar_prompt:';
const SIGNUP_SESSION_KEY = 'dehub_avatar_prompt_signup';

export interface AvatarPromptState {
  shows: number;
  lastShownAt: number;
}

/** True when the account has no picture of its own. Empty strings count as none. */
export function hasNoAvatar(user: { avatarImageUrl?: string | null; avatarUrl?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const path = (user.avatarImageUrl ?? user.avatarUrl ?? '').trim();
  return path === '';
}

export function readAvatarPromptState(account: string): AvatarPromptState {
  try {
    const raw = localStorage.getItem(STATE_PREFIX + account.toLowerCase());
    if (!raw) return { shows: 0, lastShownAt: 0 };
    const parsed = JSON.parse(raw) as Partial<AvatarPromptState>;
    return { shows: Number(parsed.shows) || 0, lastShownAt: Number(parsed.lastShownAt) || 0 };
  } catch {
    return { shows: 0, lastShownAt: 0 };
  }
}

export function recordAvatarPromptShown(account: string, now = Date.now()): void {
  const prev = readAvatarPromptState(account);
  try {
    localStorage.setItem(STATE_PREFIX + account.toLowerCase(), JSON.stringify({ shows: prev.shows + 1, lastShownAt: now }));
  } catch { /* private mode */ }
}

/** Called by the sign-up welcome flow: that open already asked for a photo. */
export function markAvatarPromptSignupSession(): void {
  try { sessionStorage.setItem(SIGNUP_SESSION_KEY, '1'); } catch { /* private mode */ }
}

function isSignupSession(): boolean {
  try { return sessionStorage.getItem(SIGNUP_SESSION_KEY) === '1'; } catch { return false; }
}

export function isAvatarPromptDue(account: string, now = Date.now()): boolean {
  if (isSignupSession()) return false;
  const state = readAvatarPromptState(account);
  if (state.shows >= AVATAR_PROMPT_MAX_SHOWS) return false;
  if (state.lastShownAt && now - state.lastShownAt < AVATAR_PROMPT_GAP_MS) return false;
  return true;
}

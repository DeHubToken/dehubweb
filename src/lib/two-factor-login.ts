/**
 * Two-step sign-in, client half.
 *
 * Every login door ends in one of the session requests (wallet signature or
 * Supabase exchange). When the account has two-step sign-in on, the API
 * answers that request with TWO_FACTOR_REQUIRED and a challenge instead of a
 * session. requestSession hands the challenge here, the login sheet shows the
 * code step, and the code is traded for the session the login was waiting
 * for — so every caller of requestSession gets a normal session response and
 * none of them had to learn about 2FA.
 */
import { useSyncExternalStore } from 'react';

export const TWO_FACTOR_REQUIRED_CODE = 'TWO_FACTOR_REQUIRED';

export interface TwoFactorAccount {
  address?: string;
  username?: string | null;
  displayName?: string | null;
  avatarImageUrl?: string | null;
}

export interface TwoFactorPrompt {
  account: TwoFactorAccount;
  /** Resolves when the code was accepted; rejects with the server's message. */
  submit: (input: { code?: string; backupCode?: string; trustDevice: boolean }) => Promise<void>;
  cancel: () => void;
}

/**
 * Closing the code step. Carries the same code as a declined wallet prompt so
 * every login path already treats it as "the user backed out", not a failure.
 */
export class TwoFactorCancelledError extends Error {
  readonly code = 'ACTION_REJECTED';
  constructor() {
    super('Sign-in cancelled');
    this.name = 'TwoFactorCancelledError';
  }
}

let current: TwoFactorPrompt | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function set(next: TwoFactorPrompt | null) {
  current = next;
  emit();
}

export function getTwoFactorPrompt() {
  return current;
}

export function useTwoFactorPrompt(): TwoFactorPrompt | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}

// ── Trusted device tokens ("don't ask again for 30 days") ─────────────────

const TRUST_KEY = 'riftn.2fa.trust';

export function readTrustTokens(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRUST_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveTrustToken(token: string) {
  try {
    const next = [token, ...readTrustTokens().filter((t) => t !== token)].slice(0, 8);
    localStorage.setItem(TRUST_KEY, JSON.stringify(next));
  } catch {
    /* private mode: the code is simply asked again next time */
  }
}

/** Adds the device's trust tokens to a login body (JSON string), if any. */
export function withTrustTokens(body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (typeof body !== 'string') return body;
  const tokens = readTrustTokens();
  if (!tokens.length) return body;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return JSON.stringify({ ...parsed, twoFactorTrust: tokens });
    }
  } catch {
    /* not JSON: leave it alone */
  }
  return body;
}

/**
 * Show the code step and wait. Resolves with the verify response (a normal
 * session response), or rejects with TwoFactorCancelledError.
 */
export function awaitTwoFactorCode(
  challenge: { challenge: string; account?: TwoFactorAccount },
  verify: (body: string) => Promise<Response>,
): Promise<Response> {
  current?.cancel();
  return new Promise<Response>((resolve, reject) => {
    const prompt: TwoFactorPrompt = {
      account: challenge.account || {},
      submit: async ({ code, backupCode, trustDevice }) => {
        const response = await verify(JSON.stringify({ challenge: challenge.challenge, code, backupCode, trustDevice }));
        if (!response.ok) {
          const data = await response.json().catch(() => ({} as Record<string, unknown>));
          const message = (data.message as string) || (data.error_message as string) || 'That code didn’t work.';
          // An expired or used-up challenge can't be retried: end this login.
          if (response.status === 400 && /expired/i.test(message)) {
            if (current === prompt) set(null);
            reject(Object.assign(new Error(message), { code: 'TWO_FACTOR_EXPIRED' }));
          }
          throw new Error(message);
        }
        const data = await response.clone().json().catch(() => ({} as Record<string, unknown>));
        if (typeof data.twoFactorTrust === 'string') saveTrustToken(data.twoFactorTrust);
        if (current === prompt) set(null);
        resolve(response);
      },
      cancel: () => {
        if (current === prompt) set(null);
        reject(new TwoFactorCancelledError());
      },
    };
    set(prompt);
  });
}

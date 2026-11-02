/**
 * "Reserve now" on a free username: the name is held for this browser for one
 * minute while the visitor signs up. The browser is known only by a random
 * token kept here; the server stores nothing else.
 */
import { DEHUB_API_REQUEST_BASE } from '@/lib/api/dehub/core';

const TOKEN_KEY = 'dehub.usernameHold.token';
const HOLD_KEY = 'dehub.usernameHold';

export interface UsernameHold {
  username: string;
  expiresAt: number; // ms epoch
}

export type HoldResponse =
  | { held: true; username: string; expiresAt: string; holdMs: number }
  | { held: false; username: string; reason: 'invalid' | 'taken' | 'reserved' | 'held'; expiresAt?: string };

function makeToken(): string {
  try {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 40);
  }
}

export function holdToken(): string {
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
    const fresh = makeToken();
    localStorage.setItem(TOKEN_KEY, fresh);
    return fresh;
  } catch {
    return makeToken();
  }
}

/** The name this browser is holding right now, if the hold has not run out. */
export function currentHold(): UsernameHold | null {
  try {
    const raw = localStorage.getItem(HOLD_KEY);
    if (!raw) return null;
    const hold = JSON.parse(raw) as UsernameHold;
    if (!hold?.username || !(hold.expiresAt > Date.now())) return null;
    return hold;
  } catch {
    return null;
  }
}

function saveHold(hold: UsernameHold | null) {
  try {
    if (hold) localStorage.setItem(HOLD_KEY, JSON.stringify(hold));
    else localStorage.removeItem(HOLD_KEY);
  } catch {
    /* storage blocked: the hold still works for this page view */
  }
}

export async function reserveUsername(username: string): Promise<HoldResponse> {
  const res = await fetch(`${DEHUB_API_REQUEST_BASE}/api/username/hold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, holdToken: holdToken() }),
  });
  if (!res.ok) throw new Error(`hold ${res.status}`);
  const data = (await res.json()) as HoldResponse;
  if (data.held) saveHold({ username: data.username, expiresAt: Date.parse(data.expiresAt) });
  return data;
}

/** Let go of the held name. Uses keepalive so it still goes out while the page closes. */
export function releaseUsername(): void {
  const had = !!currentHold();
  saveHold(null);
  if (!had) return;
  try {
    void fetch(`${DEHUB_API_REQUEST_BASE}/api/username/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdToken: holdToken() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* the hold runs out on its own within a minute */
  }
}

/** Sent with the sign up save so the server lets this browser take its held name. */
export function holdFieldFor(username: string | undefined): string | null {
  const hold = currentHold();
  if (!hold || !username || hold.username !== username.trim().toLowerCase()) return null;
  return holdToken();
}

/** The name was saved: nothing left to hold. */
export function forgetHold(): void {
  saveHold(null);
}

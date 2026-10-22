/**
 * First-touch attribution
 * =======================
 * Where a visitor first came from: the UTM tags on the link, the external
 * site that sent them, and the page they landed on. Kept for 90 days, first
 * touch wins, exactly like the affiliate referral cookie (src/lib/affiliateRef.ts),
 * and written once to `signup_attribution` when that browser first signs in.
 *
 * Stored in both localStorage and a cookie: either can be cleared on its own,
 * and the cookie also survives a move between the www and apex hosts.
 */

import { referrerHost } from '@/lib/page-path';

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

export type FirstTouch = Partial<Record<UtmKey, string>> & {
  referrer_host?: string;
  landing_path: string;
  at: string;
};

const STORAGE_KEY = 'dehub_first_touch';
const COOKIE_NAME = 'dehub_ft';
const DAYS = 90;
const MAX_VALUE = 100;

const clean = (value: string | null | undefined): string | undefined => {
  const v = value?.trim().slice(0, MAX_VALUE);
  return v || undefined;
};

/** The UTM tags on a query string, trimmed and capped. Empty when there are none. */
export function readUtm(search: string): Partial<Record<UtmKey, string>> {
  const params = new URLSearchParams(search);
  const out: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const v = clean(params.get(key));
    if (v) out[key] = v;
  }
  return out;
}

const isFresh = (touch: FirstTouch | null): touch is FirstTouch =>
  !!touch && typeof touch.landing_path === 'string' && Date.now() - Date.parse(touch.at) < DAYS * 86400_000;

const parse = (raw: string | null | undefined): FirstTouch | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as FirstTouch; } catch { return null; }
};

const readCookie = (): FirstTouch | null => {
  try {
    const row = document.cookie.split('; ').find((r) => r.startsWith(`${COOKIE_NAME}=`));
    return row ? parse(decodeURIComponent(row.slice(COOKIE_NAME.length + 1))) : null;
  } catch { return null; }
};

export function getFirstTouch(): FirstTouch | null {
  let stored: FirstTouch | null = null;
  try { stored = parse(window.localStorage.getItem(STORAGE_KEY)); } catch { /* storage blocked */ }
  if (isFresh(stored)) return stored;
  const cookie = readCookie();
  return isFresh(cookie) ? cookie : null;
}

/**
 * Record this landing as the first touch, unless one is already stored.
 * Call on the first route of a page load, before any in-app navigation.
 */
export function captureFirstTouch(): void {
  if (typeof window === 'undefined') return;
  try {
    if (getFirstTouch()) return;
    const touch: FirstTouch = {
      ...readUtm(window.location.search),
      landing_path: window.location.pathname.slice(0, 200) || '/',
      at: new Date().toISOString(),
    };
    const host = referrerHost(document.referrer, window.location.host);
    if (host) touch.referrer_host = host;

    const value = JSON.stringify(touch);
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* cookie still holds it */ }
    const expires = new Date(Date.now() + DAYS * 86400_000).toUTCString();
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax${secure}`;
  } catch { /* attribution must never block a landing */ }
}

const SENT_KEY = 'dehub_signup_attribution_sent';

/**
 * Write this browser's first touch for `address` to `signup_attribution`,
 * once. The table keeps one row per wallet, so a second browser or a retry
 * after a lost response lands on the unique key and is treated as done.
 *
 * Supabase is imported dynamically for the same reason as in affiliateRef:
 * this runs from App.tsx and must not pull the client onto the boot path.
 */
export async function persistSignupAttribution(address: string, isNewAccount: boolean): Promise<void> {
  const addr = address.toLowerCase();
  try {
    if (window.localStorage.getItem(SENT_KEY)?.split(',').includes(addr)) return;
  } catch { /* fall through; the unique key still stops a duplicate */ }

  const [{ supabase }, { withWalletHeader }, { ensureWalletSession }, { getAffiliateRef }] = await Promise.all([
    import('@/integrations/supabase/client'),
    import('@/lib/supabase-wallet-client'),
    import('@/lib/wallet-session'),
    import('@/lib/affiliateRef'),
  ]);
  if (!await ensureWalletSession(addr)) return;

  const touch = getFirstTouch();
  const { error } = await withWalletHeader(
    supabase.from('signup_attribution' as never).insert({
      wallet_address: addr,
      utm_source: touch?.utm_source ?? null,
      utm_medium: touch?.utm_medium ?? null,
      utm_campaign: touch?.utm_campaign ?? null,
      utm_content: touch?.utm_content ?? null,
      utm_term: touch?.utm_term ?? null,
      referrer_host: touch?.referrer_host ?? null,
      landing_path: touch?.landing_path ?? null,
      ref_code: getAffiliateRef(),
      first_seen_at: touch?.at ?? null,
      is_new_account: isNewAccount,
    } as never),
    addr,
  ) as unknown as { error: { code?: string } | null };
  // 23505: this wallet already has its row.
  if (error && error.code !== '23505') return;

  try {
    const sent = window.localStorage.getItem(SENT_KEY)?.split(',') ?? [];
    window.localStorage.setItem(SENT_KEY, [...sent, addr].slice(-20).join(','));
  } catch { /* the unique key covers a resend */ }
}

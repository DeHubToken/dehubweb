/**
 * Signed wallet sessions for row-level security.
 * ==============================================
 * Wallet-scoped RLS reads get_request_wallet_address(), which used to trust the
 * x-wallet-address header on its own. The database now also accepts
 * x-wallet-session, a short-lived signature minted by the `wallet-session`
 * edge function for the wallet the DeHub token proves.
 *
 * Rather than touch every query that sets x-wallet-address (there are dozens,
 * plus walletScopedClient for storage), this patches fetch once: any REST or
 * storage request to our Supabase project that names a wallet gets that
 * wallet's session attached. Edge function calls are left alone — they verify
 * the DeHub token themselves.
 *
 * Until enforcement is switched on server-side, a request that goes out without
 * a session still works exactly as before, so a mint failure never breaks a
 * page. The first request for a wallet waits briefly for its session so that,
 * once enforcement is on, nothing races ahead unsigned.
 */
import { supabase } from '@/integrations/supabase/client';
import { ensureFreshToken } from '@/lib/api/dehub/core';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co';
const STORAGE_KEY = 'dehub_wallet_sessions';
/** Refresh this long before expiry, so a long page never sends a stale one. */
const REFRESH_MARGIN_MS = 60 * 60 * 1000;
/** After a failed mint (signed out, offline), wait before asking again. */
const RETRY_AFTER_MS = 60 * 1000;
/** How long the first request for a wallet waits for its session. */
const FIRST_WAIT_MS = 4000;

interface Session { token: string; expiresAt: number }

const sessions = new Map<string, Session>();
const inflight = new Map<string, Promise<Session | null>>();
const failedAt = new Map<string, number>();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    for (const [wallet, s] of Object.entries(JSON.parse(raw) as Record<string, Session>)) {
      if (s?.token && s.expiresAt > Date.now()) sessions.set(wallet, s);
    }
  } catch { /* storage unavailable: sessions stay in memory */ }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(sessions)));
  } catch { /* ignore */ }
}

function fresh(wallet: string): Session | null {
  const s = sessions.get(wallet);
  return s && s.expiresAt - REFRESH_MARGIN_MS > Date.now() ? s : null;
}

async function mint(wallet: string): Promise<Session | null> {
  const token = await ensureFreshToken();
  const { data, error } = await supabase.functions.invoke('wallet-session', {
    body: { client: 'web' },
    headers: { 'x-dehub-token': token, 'x-wallet-address': wallet },
  });
  if (error || !data?.token || String(data.wallet).toLowerCase() !== wallet) return null;
  const session = { token: String(data.token), expiresAt: new Date(data.expiresAt).getTime() };
  sessions.set(wallet, session);
  save();
  return session;
}

/** The wallet's current session, minting one if needed. Never throws. */
export function ensureWalletSession(wallet: string): Promise<Session | null> {
  const w = wallet.toLowerCase();
  const have = fresh(w);
  if (have) return Promise.resolve(have);
  const failed = failedAt.get(w);
  if (failed && Date.now() - failed < RETRY_AFTER_MS) return Promise.resolve(sessions.get(w) ?? null);
  let pending = inflight.get(w);
  if (!pending) {
    pending = mint(w)
      .catch(() => null)
      .then((s) => {
        if (!s) failedAt.set(w, Date.now());
        inflight.delete(w);
        return s ?? sessions.get(w) ?? null;
      });
    inflight.set(w, pending);
  }
  return pending;
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((r) => { timer = setTimeout(() => r(null), ms); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

function isRestOrStorage(url: string) {
  return url.startsWith(SUPABASE_URL) && (url.includes('/rest/v1/') || url.includes('/storage/v1/'));
}

let installed = false;

export function installWalletSessionFetch(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  load();
  const next = window.fetch;
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!isRestOrStorage(url)) return next.call(this, input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const wallet = headers.get('x-wallet-address')?.toLowerCase();
    if (!wallet || headers.has('x-wallet-session')) return next.call(this, input, init);
    // A still-valid session goes out now and is refreshed behind the request;
    // only a wallet with none at all waits for the first mint.
    const valid = sessions.get(wallet);
    const usable = valid && valid.expiresAt - 30_000 > Date.now() ? valid : null;
    if (usable && !fresh(wallet)) void ensureWalletSession(wallet);
    const session = usable ?? (await timeout(ensureWalletSession(wallet), FIRST_WAIT_MS));
    if (!session) return next.call(this, input, init);
    headers.set('x-wallet-session', session.token);
    if (input instanceof Request && !init) return next.call(this, new Request(input, { headers }));
    return next.call(this, input, { ...init, headers });
  };
}

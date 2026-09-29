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
import { defaultRelayBase, SUPABASE_RELAY_PREFIX } from '@/integrations/supabase/relayFetch';
import { ensureFreshToken } from '@/lib/api/dehub/core';
import { createLogger } from '@/lib/logger';

const log = createLogger('WalletSession');
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co';
const STORAGE_KEY = 'dehub_wallet_sessions';
/** Refresh this long before expiry, so a long page never sends a stale one. */
const REFRESH_MARGIN_MS = 60 * 60 * 1000;
/** After a failed mint (signed out, offline), wait before asking again. */
const RETRY_AFTER_MS = 60 * 1000;
/** How long the first request for a wallet waits for its session. */
const FIRST_WAIT_MS = 4000;

interface Session { token: string; expiresAt: number }

/**
 * Why a wallet-scoped request went out without a session. Enforcement can only
 * be switched on once almost nothing lands here, so the reasons have to be told
 * apart: no_token is a sign-in problem, mint_error a server refusal or wallet
 * mismatch, timeout a mint that was merely slow.
 */
type UnsignedReason = 'no_token' | 'mint_error' | 'timeout';
interface MintFailure { reason: UnsignedReason; detail: string }

class MintError extends Error {
  constructor(readonly reason: UnsignedReason, detail: string) { super(detail); }
}

const sessions = new Map<string, Session>();
const inflight = new Map<string, Promise<Session | null>>();
const failedAt = new Map<string, number>();
const lastFailure = new Map<string, MintFailure>();

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

/**
 * A failed invoke as a reason and "status message", e.g. "403 Token does not
 * belong…". A 401 is the DeHub token itself being dead, so it counts as no
 * token rather than a server fault.
 */
async function invokeFailure(error: unknown): Promise<MintError> {
  const res = (error as { context?: unknown })?.context;
  if (!(res instanceof Response)) {
    return new MintError('mint_error', error instanceof Error ? error.message : String(error));
  }
  // A body something else already read cannot be cloned; the status alone still says a lot.
  const body = await Promise.resolve().then(() => res.clone().json()).catch(() => null);
  const detail = `${res.status} ${body?.error ?? res.statusText}`.trim();
  return new MintError(res.status === 401 ? 'no_token' : 'mint_error', detail);
}

async function mint(wallet: string): Promise<Session | null> {
  let token: string;
  try {
    token = await ensureFreshToken();
  } catch (e) {
    throw new MintError('no_token', e instanceof Error ? e.message : String(e));
  }
  const { data, error } = await supabase.functions.invoke('wallet-session', {
    body: { client: 'web' },
    headers: { 'x-dehub-token': token, 'x-wallet-address': wallet },
  });
  if (error) throw await invokeFailure(error);
  if (!data?.token) throw new MintError('mint_error', 'response carried no session');
  if (String(data.wallet).toLowerCase() !== wallet) {
    throw new MintError('mint_error', 'session minted for a different wallet');
  }
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
      .catch((e: unknown) => {
        lastFailure.set(w, e instanceof MintError
          ? { reason: e.reason, detail: e.message }
          : { reason: 'mint_error', detail: e instanceof Error ? e.message : String(e) });
        return null;
      })
      .then((s) => {
        if (!s) failedAt.set(w, Date.now());
        inflight.delete(w);
        return s ?? sessions.get(w) ?? null;
      });
    inflight.set(w, pending);
  }
  return pending;
}

const TIMED_OUT = Symbol('timed out');

function timeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof TIMED_OUT>((r) => { timer = setTimeout(() => r(TIMED_OUT), ms); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

let reportedUnsigned = false;

/**
 * One row per page load, the first time a wallet-scoped request goes out
 * unsigned. Enough to count the wallets affected and see why, without a
 * signed-out tab writing a row for every query it makes.
 */
function reportUnsigned(wallet: string, url: string, why: MintFailure) {
  if (reportedUnsigned) return;
  reportedUnsigned = true;
  let path = url;
  try { path = new URL(url).pathname; } catch { /* keep the raw url */ }
  void log.warn(`Unsigned wallet request (${why.reason})`, {
    reason: why.reason,
    detail: why.detail.slice(0, 300),
    path,
    client: 'web',
    wallet,
  });
}

/**
 * A REST or storage call to our project, direct or through the same-origin
 * relay (/_sb) that supabaseRelayFetch switches to when the project host is
 * unreachable. The relay forwards headers untouched, so a relayed request
 * needs its session just as much, and missing it would pass silently.
 */
function isRestOrStorage(url: string) {
  const relay = defaultRelayBase();
  const path = url.startsWith(SUPABASE_URL)
    ? url.slice(SUPABASE_URL.length)
    : relay && url.startsWith(relay + SUPABASE_RELAY_PREFIX + '/')
      ? url.slice(relay.length + SUPABASE_RELAY_PREFIX.length)
      : null;
  return !!path && (path.startsWith('/rest/v1/') || path.startsWith('/storage/v1/'));
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
    if (!session || session === TIMED_OUT) {
      reportUnsigned(wallet, url, session === TIMED_OUT
        ? { reason: 'timeout', detail: `no session within ${FIRST_WAIT_MS}ms` }
        : lastFailure.get(wallet) ?? { reason: 'mint_error', detail: 'unknown' });
      return next.call(this, input, init);
    }
    headers.set('x-wallet-session', session.token);
    if (input instanceof Request && !init) return next.call(this, new Request(input, { headers }));
    return next.call(this, input, { ...init, headers });
  };
}

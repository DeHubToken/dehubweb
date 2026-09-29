/**
 * Same-origin fallback route to Supabase.
 *
 * The project host sits on Cloudflare address ranges that some networks block.
 * When the browser cannot reach it, the same request can travel through
 * https://dehub.io/_sb/<path>, which the site's own entry point relays to the
 * project host. Direct stays the first choice; the relay is a fallback.
 *
 * Rules, mirroring the API relay in src/lib/api/dehub/core.ts:
 * - Only a failed transport (fetch rejected) switches route. An HTTP error
 *   status is an answer from Supabase and is returned untouched.
 * - A request is replayed through the relay only when repeating it cannot do
 *   harm (see isReplaySafe). Anything else surfaces its original error.
 * - After any transport failure every later request goes straight to the
 *   relay for RELAY_STICKY_MS, then direct is probed again. That includes
 *   mutations: sending one first-time through the relay is not a replay.
 *
 * Realtime websockets do not go through fetch and are not covered here.
 */

/** The only host the relay forwards to. Any other origin passes through. */
export const SUPABASE_RELAY_TARGET = 'https://aigxuutjaqsywioxjefr.supabase.co';
export const SUPABASE_RELAY_PREFIX = '/_sb';
export const RELAY_STICKY_MS = 10 * 60 * 1000;
/**
 * Time-to-headers ceiling for a direct attempt that could still be replayed.
 * Blocked networks often black-hole the connection rather than refuse it, and
 * the browser's own connect timeout can run to minutes. Only applied where a
 * replay follows, so a slow upload or RPC is never cut off.
 */
export const DIRECT_ATTEMPT_TIMEOUT_MS = 20_000;
const STICKY_STORAGE_KEY = 'dehub.sbRelayUntil';

const RELAY_OWN_ORIGIN_HOSTS = new Set(['dehub.io', 'www.dehub.io', 'staging.dehub.io']);

/**
 * Where to send relayed requests, or null to disable the relay. Local and
 * dev builds have no dehub.io entry point in front of them, so they always
 * talk to Supabase directly.
 */
export function defaultRelayBase(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  const { protocol, hostname, origin } = window.location;
  if (protocol !== 'https:') return null;
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  ) return null;
  return RELAY_OWN_ORIGIN_HOSTS.has(hostname) ? origin : 'https://dehub.io';
}

type FetchInput = RequestInfo | URL;
type FetchFn = (input: FetchInput, init?: RequestInit) => Promise<Response>;

interface RelayFetchOptions {
  relayBase?: () => string | null;
  fetchImpl?: FetchFn;
  storage?: () => Storage | null;
}

function inputUrl(input: FetchInput): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isReusableBody(body: BodyInit | null | undefined): boolean {
  if (body == null || typeof body === 'string') return true;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return true;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return true;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return true;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return true;
  // ReadableStream and anything unknown: already consumed by the first try.
  return false;
}

/**
 * Whether the same request may be sent a second time after the first one
 * failed in transit (and so may already have reached Supabase).
 *
 * GET/HEAD are reads. POST /auth/v1/token is the one write allowed: for a
 * refresh_token grant, Supabase accepts the same refresh token again within
 * its reuse interval and answers with the session the first call created,
 * and supabase-js itself already retries a refresh that failed in transit
 * with that same token — so replaying here adds no risk it did not have.
 * Other grants on that endpoint are equally safe to repeat: a password grant
 * just issues another session, and an already-spent PKCE code fails cleanly
 * with a 4xx. Every other write (REST inserts, RPC, uploads, functions) is
 * never replayed.
 */
function isReplaySafe(method: string, url: URL, input: FetchInput, init?: RequestInit): boolean {
  const bodyOk = init?.body !== undefined
    ? isReusableBody(init.body)
    : !(input instanceof Request) || input.body === null;
  if (!bodyOk) return false;
  if (method === 'GET' || method === 'HEAD') return true;
  return method === 'POST' && url.pathname === '/auth/v1/token';
}

function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function createSupabaseRelayFetch(options: RelayFetchOptions = {}): FetchFn {
  const relayBase = options.relayBase ?? defaultRelayBase;
  // Resolved per call so polyfills and test spies installed later still apply.
  const baseFetch: FetchFn = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const storage = options.storage ?? sessionStore;

  let directDownUntil: number | null = null;

  const readSticky = (): number => {
    if (directDownUntil === null) {
      directDownUntil = 0;
      try {
        const stored = Number(storage()?.getItem(STICKY_STORAGE_KEY));
        if (Number.isFinite(stored)) directDownUntil = stored;
      } catch { /* storage blocked: memory only */ }
    }
    return directDownUntil;
  };
  const writeSticky = (until: number) => {
    directDownUntil = until;
    try {
      const store = storage();
      if (!store) return;
      if (until > 0) store.setItem(STICKY_STORAGE_KEY, String(until));
      else store.removeItem(STICKY_STORAGE_KEY);
    } catch { /* storage blocked: memory only */ }
  };

  const attempt = async (
    target: string,
    input: FetchInput,
    init: RequestInit | undefined,
    callerSignal: AbortSignal | undefined,
    timeoutMs: number | null,
  ): Promise<Response> => {
    const request = input instanceof Request ? new Request(target, input) : target;
    if (timeoutMs === null) return baseFetch(request, init);
    const controller = new AbortController();
    const onAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort(callerSignal.reason);
      else callerSignal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(new DOMException('Direct attempt timed out', 'TimeoutError')), timeoutMs);
    try {
      return await baseFetch(request, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onAbort);
    }
  };

  return async function supabaseRelayFetch(input: FetchInput, init?: RequestInit): Promise<Response> {
    let url: URL;
    try {
      url = new URL(inputUrl(input));
    } catch {
      return baseFetch(input, init);
    }
    if (url.origin !== SUPABASE_RELAY_TARGET) return baseFetch(input, init);
    const base = relayBase();
    if (!base) return baseFetch(input, init);

    const direct = url.href;
    const relay = `${base}${SUPABASE_RELAY_PREFIX}${url.pathname}${url.search}`;
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const safe = isReplaySafe(method, url, input, init);
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined) ?? undefined;
    const timeout = safe ? DIRECT_ATTEMPT_TIMEOUT_MS : null;

    if (Date.now() < readSticky()) {
      try {
        return await attempt(relay, input, init, signal, timeout);
      } catch (error) {
        if (!safe || signal?.aborted) throw error;
        // The relay failed too; a read can still try the direct route, and
        // if that answers, direct is back.
        const response = await attempt(direct, input, init, signal, null);
        writeSticky(0);
        return response;
      }
    }

    try {
      return await attempt(direct, input, init, signal, timeout);
    } catch (error) {
      // The caller cancelled: not a route failure.
      if (signal?.aborted) throw error;
      writeSticky(Date.now() + RELAY_STICKY_MS);
      if (!safe) throw error;
      return attempt(relay, input, init, signal, null);
    }
  };
}

/** The fetch handed to every Supabase client in the app. */
export const supabaseRelayFetch = createSupabaseRelayFetch();

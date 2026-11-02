/**
 * dehub-sdk — the DeHub mini app SDK as an npm module.
 *
 *   import { dehub } from 'dehub-sdk';
 *   dehub.ready();
 *   const { user } = await dehub.context;
 *
 * Same protocol as https://dehub.io/sdk/miniapp.js: it talks to the DeHub host
 * over postMessage (web) or the React Native WebView bridge (the DeHub app),
 * and never sees the person's session. Safe to import during server rendering:
 * nothing runs until a method is called in a browser.
 */
import type { AuthToken, ComposePostOptions, DehubContext, HapticStyle, PayOptions, PayResult } from './types';

export type * from './types';

const NS = 'dehub-miniapp';
const VERSION = 1;

export class DehubError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'DehubError';
    this.code = code;
  }
}

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> };
type NativeBridge = { postMessage(message: string): void };

let started = false;
let nextId = 1;
const pending = new Map<number, Pending>();
const listeners = new Map<string, Set<(data: unknown) => void>>();
let contextPromise: Promise<DehubContext> | null = null;
let tokenCache: AuthToken | null = null;

const browser = () => typeof window !== 'undefined';
const native = (): NativeBridge | undefined => (browser() ? (window as unknown as { ReactNativeWebView?: NativeBridge }).ReactNativeWebView : undefined);
const framed = () => browser() && window.parent && window.parent !== window;

/** True when the page is running inside DeHub (web or app). */
export function isInDehub(): boolean {
  return Boolean(native() || framed());
}

function receive(event: MessageEvent) {
  let data = event.data;
  // On the web only the parent frame is DeHub. In the app only native code can
  // deliver a message, and it arrives as a string.
  if (!native() && event.source !== window.parent) return;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return; }
  }
  if (!data || data.ns !== NS) return;
  if (data.event) {
    for (const fn of [...(listeners.get(data.event) ?? [])]) {
      try { fn(data.data); } catch (e) { console.error(e); }
    }
    return;
  }
  const slot = pending.get(data.id);
  if (!slot) return;
  pending.delete(data.id);
  clearTimeout(slot.timer);
  if (data.error) slot.reject(new DehubError(data.error.message || 'DeHub refused the request.', data.error.code));
  else slot.resolve(data.result);
}

function start() {
  if (started || !browser()) return;
  started = true;
  window.addEventListener('message', receive);
  if (native()) document.addEventListener('message', receive as unknown as EventListener);
}

function send(message: Record<string, unknown>) {
  const payload = { ...message, ns: NS, v: VERSION };
  const bridge = native();
  if (bridge) bridge.postMessage(JSON.stringify(payload));
  else if (framed()) window.parent.postMessage(payload, '*');
}

function request<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<T> {
  if (!isInDehub()) return Promise.reject(new DehubError('Not running inside DeHub.', 'not_in_dehub'));
  start();
  return new Promise<T>((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new DehubError(`DeHub did not answer ${method}.`, 'timeout'));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    send({ id, method, params });
  });
}

export const dehub = {
  version: VERSION,
  isInDehub,

  /** Hide the splash screen. Call it once your first screen has painted. */
  ready: () => request<void>('ready'),

  /** Close the mini app. */
  close: () => request<void>('close'),

  /** `{ user, location, client }`, asked once and then cached. */
  get context(): Promise<DehubContext> {
    contextPromise ??= request<DehubContext>('context');
    return contextPromise;
  },

  /** The methods this host supports, e.g. `['auth.getToken', 'actions.pay']`. */
  getCapabilities: () => request<string[]>('getCapabilities'),

  auth: {
    /**
     * A signed JWT proving who the person is, for YOUR server to verify
     * (`verifyDehubToken` in `dehub-sdk/server`). The first call asks the
     * person to share their identity with you. Cached until a minute before it
     * expires unless `force` is set.
     */
    async getToken(options: { force?: boolean } = {}): Promise<AuthToken> {
      if (!options.force && tokenCache && tokenCache.expiresAt - Date.now() > 60_000) return tokenCache;
      tokenCache = await request<AuthToken>('auth.getToken', {}, 120_000);
      return tokenCache;
    },
  },

  actions: {
    /** Open the DeHub composer with text, and optionally a link back into your app. */
    composePost: (options: ComposePostOptions = {}) => request<{ posted: boolean; postId?: number }>('actions.composePost', { ...options }, 600_000),
    /** Open a DeHub profile by handle. */
    viewProfile: (options: { handle: string }) => request<void>('actions.viewProfile', { ...options }),
    /** Open a DeHub post by id. */
    viewPost: (options: { postId: number | string }) => request<void>('actions.viewPost', { ...options }),
    /** Open an external https:// link outside the mini app. */
    openUrl: (url: string) => request<void>('actions.openUrl', { url }),
    /** Ask the person to add your app, so your server can notify them. */
    addApp: () => request<{ added: boolean }>('actions.addApp', {}, 600_000),
    /** Ask the person to pay you in DHB. Verify `receipt` on your server (`verifyDehubPayment`). */
    pay: (options: PayOptions) => request<PayResult>('actions.pay', { ...options }, 600_000),
  },

  haptics: {
    impact: (style: HapticStyle = 'medium') => request<void>('haptics.impact', { style }).catch(() => {}),
  },

  /** Listen for host events. Returns a function that stops listening. */
  on(name: string, fn: (data: unknown) => void): () => void {
    start();
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(fn);
    return () => listeners.get(name)?.delete(fn);
  },
};

export default dehub;

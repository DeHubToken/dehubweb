/**
 * The dehub side of the mini app SDK, on the web.
 * ================================================
 * Grown from lib/game-host-bridge, and it keeps that bridge's one rule: the
 * frame never receives the session. Every request is checked here and carried
 * out here; what goes back is an answer, never a credential for dehub.
 *
 * WHO IS ALLOWED TO ASK
 * ---------------------
 * Two gates, both required:
 *   - `event.source` must be the app frame's own window, and
 *   - `event.origin` must be the app's origin.
 * Mini apps are framed WITH `allow-same-origin` (they are third-party sites
 * on their own domains and need their own storage and API), so unlike the
 * arcade's opaque frames their origin is real and worth checking. Replies go
 * to that origin only, so a frame that navigates somewhere else stops hearing
 * anything.
 *
 * "Sign in with dehub" is the one request that reaches the backend: the host
 * asks miniapp-auth for a token whose audience is the domain THIS side loaded,
 * not a domain the frame names.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthToken } from '@/lib/api/dehub';
import {
  WEB_CAPABILITIES,
  cleanExternalUrl,
  cleanHandle,
  cleanPayment,
  cleanPostId,
  composeText,
  parseRequest,
  reply,
  replyError,
  type MiniAppContext,
} from './protocol';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co'}/functions/v1`;

/** Consent to share identity is remembered per domain, per browser. */
const CONSENT_KEY = (domain: string) => `dehub:miniapp:signin:${domain}`;

export function hasSignInConsent(domain: string): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY(domain)) === '1';
  } catch {
    return false;
  }
}

export function rememberSignInConsent(domain: string): void {
  try {
    localStorage.setItem(CONSENT_KEY(domain), '1');
  } catch {
    /* private mode: ask again next time */
  }
}

async function mintToken(domain: string): Promise<{ token: string; expiresAt: number }> {
  const session = getAuthToken();
  if (!session) throw Object.assign(new Error('Sign in to dehub first.'), { code: 'signin' });
  const res = await fetch(`${FUNCTIONS_URL}/miniapp-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-dehub-token': session },
    body: JSON.stringify({ domain }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body?.token !== 'string') {
    throw Object.assign(new Error(body?.error || 'Sign-in failed.'), { code: res.status === 401 ? 'signin' : 'failed' });
  }
  return { token: body.token, expiresAt: Number(body.expiresAt) };
}

export interface MiniAppHostOptions {
  /** The URL loaded into the frame. Its origin and host are the gates. */
  appUrl: URL | null;
  context: MiniAppContext;
  onReady: () => void;
  onClose: () => void;
  onCompose: (text: string) => void;
  /** Ask the user whether to share their identity with this domain. */
  requestSignIn: (domain: string) => Promise<boolean>;
  /**
   * Ask the person to add the app (and allow its notifications). Absent for a
   * developer preview, which is not a registered app.
   */
  addApp?: () => Promise<{ added: boolean }>;
  /** Show the payment sheet, send, and return the recorded payment. Absent for a preview. */
  pay?: (request: { amount: number; memo: string | null }) => Promise<PaymentResult>;
}

export interface PaymentResult {
  txHash: string;
  chainId: number;
  amount: number;
  /** Signed receipt for the app's server: iss dehub.io, aud = its domain, typ 'payment'. */
  receipt: string;
}

export function useMiniAppHost(frame: RefObject<HTMLIFrameElement>, options: MiniAppHostOptions): void {
  const navigate = useNavigate();
  // Read through a ref so a new context or callback never rebinds the listener.
  const opts = useRef(options);
  opts.current = options;
  const last = useRef<Record<string, number>>({});
  const signingIn = useRef(false);
  // One sheet at a time: a second pay while the first is in the wallet is
  // the classic double charge.
  const busy = useRef(false);

  const origin = options.appUrl?.origin ?? null;
  const host = options.appUrl?.hostname ?? null;

  useEffect(() => {
    if (!origin || !host) return;

    const tooSoon = (kind: string, ms = 1000) => {
      const now = Date.now();
      if (now - (last.current[kind] ?? 0) < ms) return true;
      last.current[kind] = now;
      return false;
    };

    const onMessage = async (event: MessageEvent) => {
      const win = frame.current?.contentWindow;
      if (!win || event.source !== win || event.origin !== origin) return;
      const req = parseRequest(event.data);
      if (!req) return;

      const send = (message: unknown) => win.postMessage(message, origin);
      const ok = (result: unknown = true) => send(reply(req.id, result));
      const fail = (code: string, message: string) => send(replyError(req.id, code, message));
      const o = opts.current;

      switch (req.method) {
        case 'ready':
          o.onReady();
          return ok();
        case 'close':
          ok();
          return o.onClose();
        case 'context':
          return ok(o.context);
        case 'getCapabilities':
          return ok([...WEB_CAPABILITIES]);
        case 'auth.getToken': {
          if (!o.context.user) return fail('signin', 'The user is not signed in to dehub.');
          if (signingIn.current) return fail('busy', 'A sign-in request is already open.');
          signingIn.current = true;
          try {
            if (!hasSignInConsent(host)) {
              const allowed = await o.requestSignIn(host);
              if (!allowed) return fail('rejected', 'The user declined to sign in.');
              rememberSignInConsent(host);
            }
            return ok(await mintToken(host));
          } catch (error) {
            const e = error as Error & { code?: string };
            return fail(e.code || 'failed', e.message);
          } finally {
            signingIn.current = false;
          }
        }
        case 'actions.composePost': {
          if (tooSoon('compose', 3000)) return fail('rate_limited', 'Slow down.');
          o.onCompose(composeText(req.params, host));
          return ok({ opened: true });
        }
        case 'actions.viewProfile': {
          const handle = cleanHandle(req.params.handle);
          if (!handle) return fail('invalid', 'A dehub handle is required.');
          ok();
          return navigate(`/${handle}`);
        }
        case 'actions.viewPost': {
          const id = cleanPostId(req.params.id);
          if (!id) return fail('invalid', 'A numeric post id is required.');
          ok();
          return navigate(`/app/post/${id}`);
        }
        case 'actions.openUrl': {
          const url = cleanExternalUrl(req.params.url);
          if (!url) return fail('invalid', 'Only https:// links can be opened.');
          if (tooSoon('openUrl')) return fail('rate_limited', 'Slow down.');
          window.open(url, '_blank', 'noopener,noreferrer');
          return ok();
        }
        case 'actions.addApp': {
          if (!o.addApp) return fail('unsupported', 'Only registered apps can be added.');
          if (!o.context.user) return fail('signin', 'The user is not signed in to DeHub.');
          if (busy.current) return fail('busy', 'Another request is already open.');
          busy.current = true;
          try {
            const result = await o.addApp();
            return result.added ? ok(result) : fail('rejected', 'The user declined.');
          } catch (error) {
            return fail('failed', (error as Error).message);
          } finally {
            busy.current = false;
          }
        }
        case 'actions.pay': {
          if (!o.pay) return fail('unsupported', 'Only registered apps can take payments.');
          if (!o.context.user) return fail('signin', 'The user is not signed in to DeHub.');
          const request = cleanPayment(req.params);
          if (!request) return fail('invalid', 'amount must be a positive number of DHB.');
          if (busy.current) return fail('busy', 'Another request is already open.');
          busy.current = true;
          try {
            return ok(await o.pay(request));
          } catch (error) {
            const e = error as Error & { code?: string };
            return fail(e.code || 'failed', e.message);
          } finally {
            busy.current = false;
          }
        }
        case 'haptics.impact':
          navigator.vibrate?.(10);
          return ok();
        default:
          return fail('unsupported', `${req.method} is not supported here.`);
      }
    };

    const listener = (event: MessageEvent) => void onMessage(event);
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [origin, host, frame, navigate]);
}

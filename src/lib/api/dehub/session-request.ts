import { DEHUB_API_BASE, RequestTimeoutError } from './core';
import { createLogger } from '@/lib/logger';
import { TWO_FACTOR_REQUIRED_CODE, awaitTwoFactorCode, withTrustTokens, type TwoFactorAccount } from '@/lib/two-factor-login';

const log = createLogger('SessionRequest');

type SessionEndpoint = '/api/web/auth' | '/api/web/auth/supabase' | '/api/auth/wallet-challenge' | '/api/auth/2fa/verify';

/**
 * Establish a session. A login that answers TWO_FACTOR_REQUIRED (the account
 * has two-step sign-in on) pauses here for the code step, and the caller gets
 * the session the code unlocked — see lib/two-factor-login.
 */
export async function requestSession(endpoint: SessionEndpoint, init: RequestInit): Promise<Response> {
  const isLogin = endpoint === '/api/web/auth' || endpoint === '/api/web/auth/supabase';
  const response = await sendSessionRequest(endpoint, isLogin ? { ...init, body: withTrustTokens(init.body) } : init);
  if (!isLogin || response.status !== 403) return response;

  const data = await response.clone().json().catch(() => null) as { code?: string; challenge?: unknown; account?: TwoFactorAccount } | null;
  if (data?.code !== TWO_FACTOR_REQUIRED_CODE || typeof data.challenge !== 'string') return response;

  log.trace?.('two-factor-required', { endpoint });
  return awaitTwoFactorCode(
    { challenge: data.challenge, account: data.account },
    (body) => sendSessionRequest('/api/auth/2fa/verify', {
      ...init,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers as Record<string, string> | undefined ?? {}) },
      body,
    }),
  );
}

/** Retry only session establishment with the same proof, never wallet writes. */
async function sendSessionRequest(endpoint: SessionEndpoint, init: RequestInit): Promise<Response> {
  // The apex relay accepts login POSTs and the staging origin's CORS headers.
  // The staging static host itself answers these POSTs with 405.
  const relay = 'https://riftn.com/_api';
  for (const [attempt, base] of [DEHUB_API_BASE, relay].entries()) {
    log.trace?.('session-request-start', { endpoint, route: attempt ? 'relay' : 'direct' });
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
    try {
      const response = await fetch(`${base}${endpoint}`, { ...init, signal: controller.signal });
      log.trace?.('session-request-result', { endpoint, route: attempt ? 'relay' : 'direct', status: response.status });
      return response;
    } catch (error) {
      const transportFailed = timedOut || (error instanceof TypeError && /network|fetch|load failed/i.test(error.message));
      log.trace?.('session-request-error', { endpoint, route: attempt ? 'relay' : 'direct', timed_out: timedOut });
      if (attempt === 0 && transportFailed) continue;
      log.error('login transport failed', { endpoint, route: attempt ? 'relay' : 'direct' }, error);
      if (timedOut) throw new RequestTimeoutError(`${base}${endpoint}`, 20_000);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Could not finish signing in. Please try again.');
}

import { DEHUB_API_BASE, RequestTimeoutError } from './core';
import { createLogger } from '@/lib/logger';

const log = createLogger('SessionRequest');

/** Retry only session establishment with the same proof, never wallet writes. */
export async function requestSession(endpoint: '/api/web/auth' | '/api/web/auth/supabase', init: RequestInit): Promise<Response> {
  // The apex relay accepts login POSTs and the staging origin's CORS headers.
  // The staging static host itself answers these POSTs with 405.
  const relay = 'https://dehub.io/_api';
  for (const [attempt, base] of [DEHUB_API_BASE, relay].entries()) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
    try {
      return await fetch(`${base}${endpoint}`, { ...init, signal: controller.signal });
    } catch (error) {
      const transportFailed = timedOut || (error instanceof TypeError && /network|fetch|load failed/i.test(error.message));
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

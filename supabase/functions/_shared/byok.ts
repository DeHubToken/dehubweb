/**
 * Creators' own provider keys ("bring your own key").
 * ==================================================
 * A creator can save a key for any provider listed here. When a tool runs on
 * that provider and the creator has a working key, the job runs on their
 * account and DeHub charges nothing for it.
 *
 * Rules every caller keeps:
 *  - The key is read with `userProviderKey` for one request and then dropped.
 *    It is never logged, returned to a client, or stored anywhere else.
 *  - Calls made with a creator's key must NOT go through
 *    `controlledProviderFetch` or any shared provider backoff: one bad key
 *    must never switch a provider off for everyone else.
 *  - A failing creator key never falls back to DeHub's account silently. The
 *    job stops with `byokErrorResponse`, and the client offers to pay with
 *    DeHub credits instead.
 */

import { jsonResponse, serviceClient } from './auth.ts';

export type ByokStatus = 'working' | 'invalid' | 'no_credit' | 'disabled';

export interface ByokProvider {
  id: string;
  label: string;
  /** Where creators get a key. */
  keysUrl: string;
  /** What DeHub tools this key powers, shown in settings. */
  powers: string;
  /**
   * A free request that proves the key is real. `okStatuses` are answers that
   * only an accepted key gets (for providers without a free "who am I" call
   * we send a deliberately wrong request: a bad key gets 401, a good key 400/404).
   */
  test: (key: string) => { url: string; init: RequestInit; okStatuses?: number[] };
}

const bearer = (key: string): HeadersInit => ({ Authorization: `Bearer ${key}` });

export const BYOK_PROVIDERS: Record<string, ByokProvider> = {
  openai: {
    id: 'openai', label: 'OpenAI', keysUrl: 'https://platform.openai.com/api-keys',
    powers: 'Builder (GPT models)',
    test: key => ({ url: 'https://api.openai.com/v1/models', init: { headers: bearer(key) } }),
  },
  fal: {
    id: 'fal', label: 'fal', keysUrl: 'https://fal.ai/dashboard/keys',
    powers: 'Images, video, 3D and photo tools',
    test: key => ({
      url: `https://queue.fal.run/fal-ai/fast-sdxl/requests/${crypto.randomUUID()}/status`,
      init: { headers: { Authorization: `Key ${key}` } }, okStatuses: [400, 404, 422],
    }),
  },
  kie: {
    id: 'kie', label: 'kie.ai', keysUrl: 'https://kie.ai/api-key',
    powers: 'Images and video',
    test: key => ({ url: 'https://api.kie.ai/api/v1/chat/credit', init: { headers: bearer(key) } }),
  },
  replicate: {
    id: 'replicate', label: 'Replicate', keysUrl: 'https://replicate.com/account/api-tokens',
    powers: 'Images and video',
    test: key => ({ url: 'https://api.replicate.com/v1/account', init: { headers: bearer(key) } }),
  },
  xai: {
    id: 'xai', label: 'xAI', keysUrl: 'https://console.x.ai',
    powers: 'Grok chat and images',
    test: key => ({ url: 'https://api.x.ai/v1/models', init: { headers: bearer(key) } }),
  },
  elevenlabs: {
    id: 'elevenlabs', label: 'ElevenLabs', keysUrl: 'https://elevenlabs.io/app/settings/api-keys',
    powers: 'Voice, dubbing, music and sound effects',
    test: key => ({ url: 'https://api.elevenlabs.io/v1/models', init: { headers: { 'xi-api-key': key } } }),
  },
  gemini: {
    id: 'gemini', label: 'Google Gemini', keysUrl: 'https://aistudio.google.com/apikey',
    powers: 'Translate, writing help and summaries',
    test: key => ({ url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', init: { headers: { 'x-goog-api-key': key } } }),
  },
  venice: {
    id: 'venice', label: 'Venice', keysUrl: 'https://venice.ai/settings/api',
    powers: 'Assistant chat',
    test: key => ({ url: 'https://api.venice.ai/api/v1/api_keys/rate_limits', init: { headers: bearer(key) } }),
  },
  perplexity: {
    id: 'perplexity', label: 'Perplexity', keysUrl: 'https://www.perplexity.ai/settings/api',
    powers: 'Assistant web search',
    test: key => ({
      url: 'https://api.perplexity.ai/chat/completions',
      init: { method: 'POST', headers: { ...bearer(key), 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'x', messages: [] }) },
      okStatuses: [400, 422],
    }),
  },
  deepgram: {
    id: 'deepgram', label: 'Deepgram', keysUrl: 'https://console.deepgram.com',
    powers: 'Transcripts and live captions',
    test: key => ({ url: 'https://api.deepgram.com/v1/projects', init: { headers: { Authorization: `Token ${key}` } } }),
  },
  openrouter: {
    id: 'openrouter', label: 'OpenRouter', keysUrl: 'https://openrouter.ai/settings/keys',
    powers: 'Hundreds of chat and text models with one key',
    test: key => ({ url: 'https://openrouter.ai/api/v1/key', init: { headers: bearer(key) } }),
  },
  groq: {
    id: 'groq', label: 'Groq', keysUrl: 'https://console.groq.com/keys',
    powers: 'Fast chat and text',
    test: key => ({ url: 'https://api.groq.com/openai/v1/models', init: { headers: bearer(key) } }),
  },
  mistral: {
    id: 'mistral', label: 'Mistral', keysUrl: 'https://console.mistral.ai/api-keys',
    powers: 'Chat and text',
    test: key => ({ url: 'https://api.mistral.ai/v1/models', init: { headers: bearer(key) } }),
  },
};

/** Printable, no spaces, sane length. The test call is what really decides. */
export function plausibleKey(key: unknown): key is string {
  return typeof key === 'string' && key.length >= 8 && key.length <= 4096 && /^[\x21-\x7e]+$/.test(key);
}

export function byokProvider(id: unknown): ByokProvider | null {
  return typeof id === 'string' && Object.hasOwn(BYOK_PROVIDERS, id) ? BYOK_PROVIDERS[id] : null;
}

/** What a provider's answer means for the key. `null` = can't tell (provider down). */
export function classifyKeyStatus(status: number, okStatuses: number[] = []): ByokStatus | null {
  if ((status >= 200 && status < 300) || okStatuses.includes(status) || status === 429) return 'working';
  if (status === 402) return 'no_credit';
  if (status === 401 || status === 403) return 'invalid';
  return null;
}

/** Remove anything key-like from provider text before it is logged or shown. */
export function scrubSecrets(text: string, key?: string): string {
  let out = key ? text.split(key).join('[key]') : text;
  out = out.replace(/\b(sk|sk-or|pplx|xai|gsk|r8|AIza)[-_A-Za-z0-9]{8,}/g, '[key]');
  return out.slice(0, 300);
}

/** Calls the provider once with the key. Never throws; never logs the key. */
export async function testProviderKey(provider: ByokProvider, key: string): Promise<ByokStatus | 'unreachable'> {
  const { url, init, okStatuses } = provider.test(key);
  try {
    const res = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    await res.body?.cancel();
    return classifyKeyStatus(res.status, okStatuses) ?? 'unreachable';
  } catch {
    return 'unreachable';
  }
}

/**
 * The creator's key for this provider, or null when they have none (then the
 * job runs on DeHub's account exactly as before).
 */
export async function userProviderKey(wallet: string, provider: string): Promise<string | null> {
  if (!byokProvider(provider)) return null;
  const { data, error } = await serviceClient().rpc('byok_get', { p_wallet: wallet.toLowerCase(), p_provider: provider });
  if (error) {
    console.error('byok_get failed', provider, error.code);
    return null;
  }
  return typeof data === 'string' && data ? data : null;
}

/** Record what the provider said about the key after a real job. */
export async function noteKeyResult(wallet: string, provider: string, httpStatus: number): Promise<ByokStatus | null> {
  const status = classifyKeyStatus(httpStatus);
  if (status !== 'invalid' && status !== 'no_credit') return status;
  const { error } = await serviceClient().from('user_provider_keys')
    .update({ status, checked_at: new Date().toISOString() })
    .eq('wallet_address', wallet.toLowerCase()).eq('provider', provider);
  if (error) console.error('byok status write failed', provider, error.code);
  return status;
}

const MESSAGES: Record<string, (label: string) => string> = {
  invalid: label => `Your ${label} key was rejected. Check it or replace it in Settings.`,
  no_credit: label => `Your ${label} account is out of credit. Top it up, then try again.`,
  rate_limited: label => `${label} is busy for your account. Try again in a minute.`,
  unavailable: label => `${label} is having problems right now. Try again soon.`,
};

/**
 * The response a tool sends when a job on the creator's own key fails.
 * `canUseCredits` tells the client to offer "Use DeHub credits instead".
 */
export function byokErrorResponse(provider: string, httpStatus: number): Response {
  const label = byokProvider(provider)?.label ?? provider;
  const code = httpStatus === 401 || httpStatus === 403 ? 'invalid'
    : httpStatus === 402 ? 'no_credit'
    : httpStatus === 429 ? 'rate_limited' : 'unavailable';
  return jsonResponse({
    error: MESSAGES[code](label), code: `OWN_KEY_${code.toUpperCase()}`, provider, ownKey: true, canUseCredits: true,
  }, code === 'rate_limited' ? 429 : 402);
}

// @vitest-environment node
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { createGoogleSpeechAuth } from '../../supabase/functions/_shared/google-speech-auth';

let secret: string;
let publicKey: CryptoKey;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  publicKey = pair.publicKey;
  const pem = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  secret = JSON.stringify({ type: 'service_account', project_id: 'speech-fixture', client_email: 'speech@speech-fixture.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${pem}\n-----END PRIVATE KEY-----`, token_uri: 'https://untrusted.invalid/token' });
});

afterEach(() => vi.restoreAllMocks());

it('signs Google assertions and shares short-lived tokens across simultaneous requests', async () => {
  let now = 1_800_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const http = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(String(init?.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const assertion = form.get('assertion')!;
    const [head, payload, signature] = assertion.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    expect(claims).toEqual({ iss: 'speech@speech-fixture.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/cloud-platform', aud: String(url), iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600 });
    expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${head}.${payload}`))).toBe(true);
    return Response.json({ access_token: `token-${now}`, expires_in: 3600 });
  });
  const auth = createGoogleSpeechAuth(() => secret, http);
  const headers = await Promise.all([auth.headers(), auth.headers(), auth.headers()]);
  expect(http).toHaveBeenCalledTimes(1);
  expect(headers.every((header) => header.Authorization === `Bearer token-${now}`)).toBe(true);
  expect(headers[0]['X-Goog-User-Project']).toBe('speech-fixture');
  expect(JSON.stringify(headers)).not.toContain('PRIVATE KEY');
  now += 3_500_000;
  await auth.headers();
  expect(http).toHaveBeenCalledTimes(1);
  now += 100_000;
  await auth.headers();
  expect(http).toHaveBeenCalledTimes(2);
});

it('does not cache failures or expose provider response bodies', async () => {
  const http = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('private provider details', { status: 403 }))
    .mockResolvedValueOnce(Response.json({ access_token: 'valid-token', expires_in: 3600 }));
  const auth = createGoogleSpeechAuth(() => secret, http);
  await expect(auth.headers()).rejects.toThrow('Google speech authentication unavailable (403)');
  await Promise.resolve();
  await expect(auth.headers()).resolves.toMatchObject({ Authorization: 'Bearer valid-token' });
  expect(http).toHaveBeenCalledTimes(2);
});

it('invalidates tokens when the configured account changes', async () => {
  let raw = secret;
  const http = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ access_token: 'valid-token', expires_in: 3600 }));
  const auth = createGoogleSpeechAuth(() => raw, http);
  await auth.headers();
  raw = '{invalid';
  await expect(auth.headers()).rejects.toThrow('Google speech credentials are invalid');
  expect(http).toHaveBeenCalledTimes(1);
});

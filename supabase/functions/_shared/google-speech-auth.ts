const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

type Credentials = { type: string; project_id: string; client_email: string; private_key: string };
type Token = { value: string; expires: number; project: string };

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function credentials(raw: string): Credentials {
  try {
    const value = JSON.parse(raw);
    if (value.type !== 'service_account' || typeof value.project_id !== 'string'
      || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(value.project_id)
      || typeof value.client_email !== 'string' || !value.client_email.endsWith('.iam.gserviceaccount.com')
      || typeof value.private_key !== 'string' || !value.private_key.includes('-----BEGIN PRIVATE KEY-----')) throw new Error();
    return value;
  } catch {
    throw new Error('Google speech credentials are invalid');
  }
}

/** Tokens stay in the function process; no private key or token reaches a client. */
export function createGoogleSpeechAuth(readSecret: () => string | undefined, http: typeof fetch = fetch) {
  let currentSecret: string | undefined;
  let cached: Token | null = null;
  let pending: Promise<Token> | null = null;

  async function exchange(raw: string): Promise<Token> {
    const account = credentials(raw);
    const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    const response = await http(TOKEN_URL, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64url(new Uint8Array(signature))}` }),
    });
    if (!response.ok) throw new Error(`Google speech authentication unavailable (${response.status})`);
    const body = await response.json();
    const lifetime = Number(body.expires_in);
    if (typeof body.access_token !== 'string' || !body.access_token || !Number.isFinite(lifetime) || lifetime <= 60) {
      throw new Error('Google speech authentication returned no usable token');
    }
    return { value: body.access_token, expires: Date.now() + (Math.min(lifetime, 3600) - 60) * 1000, project: account.project_id };
  }

  return {
    configured: () => !!readSecret(),
    async headers(): Promise<Record<string, string>> {
      const raw = readSecret();
      if (!raw) throw new Error('Google speech credentials are missing');
      if (raw !== currentSecret) {
        currentSecret = raw;
        cached = null;
        pending = null;
      }
      let token = cached;
      if (!token || token.expires <= Date.now()) {
        if (!pending) {
          const request = exchange(raw);
          pending = request;
          void request.then((next) => { if (currentSecret === raw) cached = next; })
            .catch(() => {}).finally(() => { if (pending === request) pending = null; });
        }
        token = await pending;
      }
      return { 'Content-Type': 'application/json', Authorization: `Bearer ${token.value}`, 'X-Goog-User-Project': token.project };
    },
  };
}

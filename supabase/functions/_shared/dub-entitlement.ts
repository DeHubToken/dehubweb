// A minute of paid dubbing, as a signed value rather than a database row.
//
// The awkward shape of this feature is that the person who PAYS is not the
// person who CALLS. A listener buys a minute of Turkish; the speakers' clients
// are the ones that then have to generate Turkish audio. So `dub-line` needs
// to answer "has somebody paid for Turkish in this room right now?" on a
// request that does not come from the payer.
//
// A table would answer it, at the cost of a migration that has to be pasted
// into the SQL editor by hand — and a stage feature shipping ahead of its DDL
// is exactly how this codebase has lost half-days before. A signed token
// answers the same question with no schema at all: `dub-session` mints one
// when it takes the money, the listener publishes it over presence, and the
// speaker hands it back with each line.
//
// What the token deliberately does NOT bind is the wallet. It attests that
// *this language, in this room, for this minute, at this voice tier* has been
// paid for — which is precisely what authorises the spend. Binding a wallet
// would imply per-listener entitlement, and the audio is broadcast to the
// whole room anyway, so it would be a guarantee we could not keep.

const encoder = new TextEncoder();

export interface DubEntitlement {
  /** Stage id. */
  s: string;
  /** Language code. */
  l: string;
  /** Priced model id — 'dub-cloned' or 'dub-neutral'. */
  m: string;
  /** Expiry, epoch ms. */
  e: number;
}

/**
 * The HMAC key.
 *
 * Defaults to the service-role key rather than requiring a new secret: a
 * missing signing secret would make every token unverifiable and the feature
 * would fail silently at the only step that costs money. Set
 * DUB_SIGNING_SECRET to rotate independently of the service key.
 */
function signingSecret(): string {
  return Deno.env.get('DUB_SIGNING_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmac(payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

export async function signEntitlement(claims: DubEntitlement): Promise<string> {
  const payload = b64url(encoder.encode(JSON.stringify(claims)));
  return `${payload}.${b64url(await hmac(payload))}`;
}

/**
 * Verify a token and return its claims, or null.
 *
 * Fails closed on every path — bad shape, bad signature, expired, unparseable.
 * A null here means we do not spend, which is the safe direction.
 */
export async function verifyEntitlement(token: string): Promise<DubEntitlement | null> {
  try {
    if (!signingSecret()) return null;
    const [payload, signature] = String(token).split('.');
    if (!payload || !signature) return null;

    const expected = b64url(await hmac(payload));
    // Constant-time-ish: compare full strings of equal length rather than
    // bailing at the first differing byte.
    if (expected.length !== signature.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    if (diff !== 0) return null;

    const claims = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as DubEntitlement;
    if (!claims?.s || !claims?.l || !claims?.m || !Number.isFinite(claims.e)) return null;
    if (Date.now() > claims.e) return null;
    return claims;
  } catch {
    return null;
  }
}

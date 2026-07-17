/**
 * POVR ads — shared constants & helpers for the ad edge functions.
 * ================================================================
 * Tier names/thresholds MIRROR src/lib/staking-badges.ts (the canonical badge
 * system used across the app — including the "Crocodite"/"Meglodon" spellings).
 * CPMs are the published linear POVR rates from /docs/advertising.
 */

export interface PovrTier {
  name: string;
  min: number; // min DHB holdings (inclusive)
  cpmUsd: number;
}

/**
 * Ascending by threshold. Viewers below 10k DHB are tier "none".
 * Crypto-native pricing: CPMs scale with verified holdings (~holdings^0.65),
 * anchored at Crab $100 and Meglodon $25,000. Whale tiers are effectively
 * pay-per-verified-eyeball — a single Meglodon impression is $25 of proven
 * on-chain capital seeing the ad, not a web2 spray CPM.
 */
export const POVR_TIERS: PovrTier[] = [
  { name: 'Crab', min: 10_000, cpmUsd: 100 },
  { name: 'Lobster', min: 25_000, cpmUsd: 180 },
  { name: 'Piranha', min: 50_000, cpmUsd: 285 },
  { name: 'Tortoise', min: 100_000, cpmUsd: 450 },
  { name: 'Cobra', min: 250_000, cpmUsd: 800 },
  { name: 'Octopus', min: 500_000, cpmUsd: 1_250 },
  { name: 'Crocodite', min: 1_000_000, cpmUsd: 2_000 },
  { name: 'Dolphin', min: 2_000_000, cpmUsd: 3_000 },
  { name: 'Tiger Shark', min: 3_000_000, cpmUsd: 4_000 },
  { name: 'Killer Whale', min: 5_000_000, cpmUsd: 5_500 },
  { name: 'Great White Shark', min: 10_000_000, cpmUsd: 8_750 },
  { name: 'Blue Whale', min: 25_000_000, cpmUsd: 16_000 },
  { name: 'Meglodon', min: 50_000_000, cpmUsd: 25_000 },
];

/** CPM for viewers holding <10k DHB (or unknown/logged-out viewers). */
export const NO_BADGE_CPM_USD = 10;

/** Resolve tier name from a DHB balance. "none" when below the badge floor. */
export function tierForBalance(balance: number | null | undefined): string {
  if (!Number.isFinite(balance as number) || (balance as number) < 10_000) return 'none';
  let current = 'none';
  for (const t of POVR_TIERS) {
    if ((balance as number) >= t.min) current = t.name;
    else break;
  }
  return current;
}

/** USD price of ONE impression for a given tier. */
export function impressionPriceUsd(tier: string): number {
  const t = POVR_TIERS.find((x) => x.name === tier);
  const cpm = t ? t.cpmUsd : NO_BADGE_CPM_USD;
  return cpm / 1000;
}

// ---------------------------------------------------------------------------
// HMAC-signed serve tokens.
// ads-serve issues one token per served ad; ads-track only accepts events
// carrying a valid, unexpired token. Prevents forged impressions (which would
// otherwise let anyone drain a competitor's budget) without any serve-time
// DB write. Dedupe is enforced in the DB via UNIQUE (serve_id, event_type).
// ---------------------------------------------------------------------------

export interface ServeTokenPayload {
  sid: string; // serve id (uuid)
  cam: string; // campaign id
  cre: string; // creative id
  vk: string;  // viewer key (wallet or anon id)
  vw: string;  // viewer wallet ('' when anonymous)
  tier: string;
  sur: string; // surface
  p: number;   // impression price usd
  sh: number;  // viewer share usd
  exp: number; // unix seconds expiry
}

function signingSecret(): string {
  return Deno.env.get('ADS_SIGNING_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'dev-secret';
}

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signServeToken(payload: ServeTokenPayload): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyServeToken(token: string): Promise<ServeTokenPayload | null> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const key = await hmacKey();
    const ok = await crypto.subtle.verify(
      'HMAC', key, b64urlDecode(sig), new TextEncoder().encode(body),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as ServeTokenPayload;
    if (!payload?.sid || !payload?.cam || !payload?.cre) return null;
    if (!Number.isFinite(payload.exp) || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Standard CORS block for the ad functions. */
export const adsCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...adsCorsHeaders, 'Content-Type': 'application/json' },
  });
}

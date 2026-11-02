/**
 * dehub-sdk/server — check what DeHub sends your server.
 *
 *   import { verifyDehubToken } from 'dehub-sdk/server';
 *   const { wallet } = await verifyDehubToken(token, { domain: 'myapp.com' });
 *
 * Every DeHub token is an ES256 JWT (iss https://dehub.io) signed with the
 * keys served at DEHUB_JWKS_URL. Needs `jose` (npm i jose).
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export const DEHUB_ISSUER = 'https://dehub.io';
export const DEHUB_JWKS_URL = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/miniapp-auth';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
const keys = () => (jwks ??= createRemoteJWKSet(new URL(DEHUB_JWKS_URL)));

export interface VerifyOptions {
  /** Your app's domain, exactly as registered (the token's `aud`). */
  domain: string;
}

/** `typ` null means a sign-in token, which carries no typ claim; receipts and events always do. */
async function verify(token: string, options: VerifyOptions, typ: 'payment' | 'event' | null): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, keys(), { issuer: DEHUB_ISSUER, audience: options.domain, algorithms: ['ES256'] });
  if ((payload.typ ?? null) !== typ) throw new Error(`Expected a ${typ ?? 'sign-in'} token, got ${String(payload.typ ?? 'sign-in')}.`);
  if (typeof payload.sub !== 'string') throw new Error('Token has no subject.');
  return payload;
}

/** A sign-in token from `dehub.auth.getToken()`. Resolves to the person's wallet. */
export async function verifyDehubToken(token: string, options: VerifyOptions): Promise<{ wallet: string; payload: JWTPayload }> {
  const payload = await verify(token, options, null);
  return { wallet: payload.sub as string, payload };
}

export interface DehubPayment {
  wallet: string;
  amount: number;
  token: string;
  chainId: number;
  txHash: string;
  memo: string | null;
  /** Test mode receipt (the developer paying their own app). Nothing moved on chain: never deliver paid goods for it in production. */
  test: boolean;
}

/** A payment receipt from `dehub.actions.pay()`. Store `txHash` so a receipt is only honoured once. */
export async function verifyDehubPayment(receipt: string, options: VerifyOptions): Promise<DehubPayment> {
  const p = await verify(receipt, options, 'payment');
  return {
    wallet: p.sub as string,
    amount: Number(p.amount),
    token: String(p.token ?? 'DHB'),
    chainId: Number(p.chainId),
    txHash: String(p.txHash),
    memo: (p.memo as string | null) ?? null,
    test: p.test === true,
  };
}

export type DehubEventName = 'app_added' | 'app_removed' | 'payment' | 'tip' | 'follow' | 'mention' | 'ping';

export interface DehubEvent {
  event: DehubEventName;
  /** The person the event is about (for tip/follow/mention: your app's owner wallet). */
  wallet: string;
  /** Extra claims: actor, amount, currency, postId, txHash, chainId, memo. */
  data: JWTPayload;
}

/** The JSON body DeHub posts to your webhookUrl: `{ event, token }`. Throws when it does not verify. */
export async function verifyDehubWebhook(body: unknown, options: VerifyOptions): Promise<DehubEvent> {
  const b = (typeof body === 'string' ? JSON.parse(body) : body) as { event?: string; token?: string } | null;
  if (!b || typeof b.token !== 'string') throw new Error('Not a DeHub webhook body.');
  const p = await verify(b.token, options, 'event');
  if (p.event !== b.event) throw new Error('Event name does not match its token.');
  return { event: p.event as DehubEventName, wallet: p.sub as string, data: p };
}

export interface NotifyOptions {
  /** Your notification key from dehub.io/apps/dev (dhmk_...). Keep it on the server. */
  key: string;
  notificationId: string;
  title: string;
  body?: string;
  targetUrl?: string;
  /** Leave out to notify everyone who added your app. */
  wallets?: string[];
}

export const DEHUB_NOTIFY_URL = 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/miniapp-notify';

/** Send a notification to people who added your app. */
export async function sendDehubNotification(options: NotifyOptions): Promise<{ sent: number; sentTo: string[]; skipped: Record<string, string[]> }> {
  const { key, ...body } = options;
  const res = await fetch(DEHUB_NOTIFY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `DeHub notify failed (${res.status}).`);
  return json;
}

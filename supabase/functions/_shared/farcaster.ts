// Farcaster posting through Neynar-managed signers (https://docs.neynar.com).
//
// A signer is created per dehub wallet, the key request is signed by dehub's own
// Farcaster account (FARCASTER_APP_FID + FARCASTER_APP_MNEMONIC), and the user
// approves it in the Farcaster app via the returned approval URL.

import { Wallet } from 'https://esm.sh/ethers@6.13.4';

const NEYNAR = 'https://api.neynar.com/v2/farcaster';

const KEY_REQUEST_DOMAIN = {
  name: 'Farcaster SignedKeyRequestValidator',
  version: '1',
  chainId: 10,
  verifyingContract: '0x00000000FC700472606ED4fA22623Acf62c60553',
};
const KEY_REQUEST_TYPES = {
  SignedKeyRequest: [
    { name: 'requestFid', type: 'uint256' },
    { name: 'key', type: 'bytes' },
    { name: 'deadline', type: 'uint256' },
  ],
};

async function neynar(path: string, init: RequestInit = {}): Promise<{ status: number; data: any }> {
  const key = Deno.env.get('NEYNAR_API_KEY');
  if (!key) throw new Error('Farcaster is not configured yet.');
  const res = await fetch(`${NEYNAR}${path}`, {
    ...init,
    headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}

export function farcasterConfigured(): boolean {
  return !!(Deno.env.get('NEYNAR_API_KEY') && Deno.env.get('FARCASTER_APP_FID') && Deno.env.get('FARCASTER_APP_MNEMONIC'));
}

/** Create a signer and a signed key request. Returns what the user must approve. */
export async function createSigner(): Promise<{ signerUuid: string; publicKey: string; approvalUrl: string }> {
  const appFid = Number(Deno.env.get('FARCASTER_APP_FID'));
  const mnemonic = Deno.env.get('FARCASTER_APP_MNEMONIC');
  if (!appFid || !mnemonic) throw new Error('Farcaster is not configured yet.');

  const created = await neynar('/signer', { method: 'POST' });
  const signerUuid = created.data?.signer_uuid;
  const publicKey = created.data?.public_key;
  if (!signerUuid || !publicKey) throw new Error(created.data?.message || 'Could not start the Farcaster connection.');

  const deadline = Math.floor(Date.now() / 1000) + 86400;
  const signature = await Wallet.fromPhrase(mnemonic).signTypedData(KEY_REQUEST_DOMAIN, KEY_REQUEST_TYPES, {
    requestFid: BigInt(appFid),
    key: publicKey,
    deadline: BigInt(deadline),
  });

  const signed = await neynar('/signer/signed_key', {
    method: 'POST',
    body: JSON.stringify({
      signer_uuid: signerUuid,
      app_fid: appFid,
      deadline,
      signature,
      sponsor: { sponsored_by_neynar: true },
    }),
  });
  const approvalUrl = signed.data?.signer_approval_url;
  if (!approvalUrl) throw new Error(signed.data?.message || 'Could not start the Farcaster connection.');
  return { signerUuid, publicKey, approvalUrl };
}

export async function getSigner(signerUuid: string): Promise<{ status: string; fid: number | null }> {
  const res = await neynar(`/signer?signer_uuid=${encodeURIComponent(signerUuid)}`);
  return { status: String(res.data?.status ?? 'unknown'), fid: res.data?.fid ? Number(res.data.fid) : null };
}

export async function getUsername(fid: number): Promise<string> {
  const res = await neynar(`/user/bulk?fids=${fid}`);
  return String(res.data?.users?.[0]?.username ?? '');
}

/** Farcaster's standard cast limit is 320 bytes; links travel as embeds instead. */
export function clipCastText(text: string, maxBytes = 320): string {
  const enc = new TextEncoder();
  if (enc.encode(text).length <= maxBytes) return text;
  let out = text;
  while (enc.encode(out + '…').length > maxBytes) out = out.slice(0, -1);
  return out.trimEnd() + '…';
}

export async function publishCast(
  signerUuid: string,
  text: string,
  embeds: string[],
): Promise<{ ok: boolean; hash?: string; error?: string }> {
  const res = await neynar('/cast', {
    method: 'POST',
    body: JSON.stringify({
      signer_uuid: signerUuid,
      text: clipCastText(text),
      embeds: embeds.slice(0, 2).map((url) => ({ url })),
      idem: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
    }),
  });
  if (res.status >= 300 || !res.data?.cast?.hash) return { ok: false, error: res.data?.message || 'Farcaster rejected the cast.' };
  return { ok: true, hash: res.data.cast.hash };
}

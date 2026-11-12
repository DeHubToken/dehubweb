/**
 * Signs follows so they belong to the wallet, not our database (backend
 * src/follow-graph). Each device keeps a small "follow key"; the wallet OKs it
 * once, then every follow/unfollow is signed by the key with no popup.
 *
 * - Built-in wallet: the OK is signed silently when the wallet is unlocked; a
 *   locked wallet just waits for next time, it never raises the unlock prompt.
 * - Own wallet (MetaMask, etc.): asked once, on a follow. "No" is remembered
 *   for 30 days.
 *
 * Nothing here can break a follow: every failure is swallowed.
 */
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { apiCall } from '@/lib/api/dehub/core';
import { readConnectionSource } from '@/lib/connection-source';

type Action = 'follow' | 'unfollow';
interface Pending { action: Action; target: string; at: number }

const KEY = (wallet: string) => `riftn.followKey.${wallet}`;
const OUTBOX = (wallet: string) => `riftn.followOutbox.${wallet}`;
const DECLINED = (wallet: string) => `riftn.followKeyDeclined.${wallet}`;
const BACKFILLED = (wallet: string) => `riftn.followBackfilled.${wallet}`;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const DECLINE_MS = 30 * 24 * 60 * 60_000;

/** Must match backend keyMessage() byte for byte. */
export function keyMessage(wallet: string, key: string, issuedAt: Date): string {
  return [
    'Riftn follow key',
    '',
    'Let this key sign my follows and unfollows:',
    key,
    '',
    `Wallet: ${wallet}`,
    `Issued: ${issuedAt.toISOString()}`,
    '',
    'This cannot move funds. Cancel it any time in Riftn settings.',
  ].join('\n');
}

/** Must match backend proofMessage(). */
export function proofMessage(action: Action, follower: string, target: string, at: number): string {
  return `riftn-follow:v1:${action}:${follower}:${target}:${at}`;
}

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

function currentWallet(): string | null {
  try {
    const raw = (localStorage.getItem('dehub_wallet') || '').toLowerCase();
    return ADDRESS.test(raw) ? raw : null;
  } catch { return null; }
}

/** The approved key for this wallet on this device, approving one if we may. */
async function followKey(wallet: string, mayAsk: boolean) {
  const saved = read<{ pk: `0x${string}`; ok: boolean } | null>(KEY(wallet), null);
  if (saved?.ok) return privateKeyToAccount(saved.pk);
  const source = readConnectionSource();
  // Turned off in Settings (a date in the future): never on its own.
  if (read<number>(DECLINED(wallet), 0) > Date.now()) return null;
  if (source === 'wagmi') {
    if (!mayAsk || Date.now() - read<number>(DECLINED(wallet), 0) < DECLINE_MS) return null;
  } else {
    // Built-in wallet: only when already unlocked, never prompt for it.
    const { getEoaProvider } = await import('@/lib/smart-wallet');
    if (!getEoaProvider()) return null;
  }
  const pk = saved?.pk ?? generatePrivateKey();
  write(KEY(wallet), { pk, ok: false });
  const account = privateKeyToAccount(pk);
  const issuedAt = new Date();
  const message = keyMessage(wallet, account.address.toLowerCase(), issuedAt);
  let signature: string;
  try {
    signature = source === 'wagmi' ? await externalSign(message, wallet) : await smartAccountSign(message, wallet);
  } catch {
    if (source === 'wagmi') write(DECLINED(wallet), Date.now());
    return null;
  }
  const r = await apiCall<{ status: boolean }>('/api/follow_graph/keys', {
    method: 'POST', body: { key: account.address, issuedAt: issuedAt.toISOString(), signature }, requiresAuth: true,
  }).catch(() => null);
  if (!r?.status) return null;
  write(KEY(wallet), { pk, ok: true });
  return account;
}

async function externalSign(message: string, wallet: string): Promise<string> {
  const { signEncryptionMessage } = await import('@/lib/dm-e2ee/signer');
  return signEncryptionMessage(message, wallet, 'wagmi');
}

/**
 * Built-in wallet: the account is a Safe owned by the in-app key, so the OK is
 * signed by the Safe (ERC-1271/6492, checked on Base by the backend), the same
 * way sign-in is. Falls back to the owner key when the account is the key itself.
 */
async function smartAccountSign(message: string, wallet: string): Promise<string> {
  const hex = `0x${Array.from(new TextEncoder().encode(message), b => b.toString(16).padStart(2, '0')).join('')}`;
  const { getActiveProvider } = await import('@/lib/contracts/aa-utils');
  const { provider } = await getActiveProvider(8453);
  const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
  const from = accounts?.[0]?.toLowerCase();
  if (from !== wallet) {
    const { signEncryptionMessage } = await import('@/lib/dm-e2ee/signer');
    return signEncryptionMessage(message, wallet, 'web3auth');
  }
  try {
    return (await provider.request({ method: 'personal_sign', params: [hex, from] })) as string;
  } catch (e) {
    const error = e as { code?: number; message?: string };
    if (error?.code !== -32602 && !/invalid params|invalid parameters/i.test(error?.message ?? '')) throw e;
    return (await provider.request({ method: 'personal_sign', params: [from, hex] })) as string;
  }
}

async function upload(wallet: string, account: ReturnType<typeof privateKeyToAccount>, items: Pending[]) {
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500);
    const proofs = await Promise.all(chunk.map(async (p) => ({
      ...p, signature: await account.signMessage({ message: proofMessage(p.action, wallet, p.target, p.at) }),
    })));
    await apiCall('/api/follow_graph/proofs', { method: 'POST', body: { proofs }, requiresAuth: true });
  }
}

let flushing: Promise<void> | null = null;

async function flush(mayAsk: boolean) {
  const wallet = currentWallet();
  if (!wallet) return;
  const account = await followKey(wallet, mayAsk);
  if (!account) return;
  const outbox = read<Pending[]>(OUTBOX(wallet), []);
  if (outbox.length) {
    await upload(wallet, account, outbox);
    const left = read<Pending[]>(OUTBOX(wallet), []).filter((p) => !outbox.some((q) => q.target === p.target && q.at === p.at));
    write(OUTBOX(wallet), left);
  }
  // Follows made before this existed (or on another device) get signed once, in bulk.
  if (Date.now() - read<number>(BACKFILLED(wallet), 0) > 24 * 60 * 60_000) {
    const res = await apiCall<{ result: string[] }>('/api/follow_graph/me/unsigned', { requiresAuth: true }).catch(() => null);
    const at = Math.floor(Date.now() / 1000);
    const targets = (res?.result ?? []).filter((t) => ADDRESS.test(t));
    if (targets.length) await upload(wallet, account, targets.map((target) => ({ action: 'follow' as const, target, at })));
    write(BACKFILLED(wallet), Date.now());
  }
}

function run(mayAsk: boolean) {
  if (flushing) return flushing;
  flushing = flush(mayAsk).catch(() => undefined).finally(() => { flushing = null; });
  return flushing;
}

/** Call after a follow/unfollow succeeded. Never throws, never blocks. */
export function signFollow(action: Action, target: string) {
  const wallet = currentWallet();
  const to = target?.toLowerCase();
  if (!wallet || !ADDRESS.test(to ?? '') || to === wallet) return;
  const outbox = read<Pending[]>(OUTBOX(wallet), []).filter((p) => p.target !== to);
  outbox.push({ action, target: to, at: Math.floor(Date.now() / 1000) });
  write(OUTBOX(wallet), outbox.slice(-2000));
  void run(true);
}

/** Quiet catch-up (app start): never asks an external wallet. */
export function syncFollowSignatures() {
  void run(false);
}

/** Settings: is this device signing follows for the signed-in wallet? */
export function followSigningOn(): boolean {
  const wallet = currentWallet();
  return !!wallet && !!read<{ ok: boolean } | null>(KEY(wallet), null)?.ok;
}

/** Settings "Turn on": asks the wallet now, even if it said no before. */
export async function turnOnFollowSigning(): Promise<boolean> {
  const wallet = currentWallet();
  if (!wallet) return false;
  try { localStorage.removeItem(DECLINED(wallet)); localStorage.removeItem(BACKFILLED(wallet)); } catch { /* ignore */ }
  if (readConnectionSource() !== 'wagmi') {
    // Built-in wallet: this one may raise the unlock prompt, it's a tap.
    const { getEoaProvider, restoreWalletSession } = await import('@/lib/smart-wallet');
    if (!getEoaProvider()) await restoreWalletSession().catch(() => null);
  }
  await run(true);
  return followSigningOn();
}

/** Settings "Turn off": cancels this device's key and stops asking. */
export async function turnOffFollowSigning(): Promise<void> {
  const wallet = currentWallet();
  if (!wallet) return;
  const saved = read<{ pk: `0x${string}` } | null>(KEY(wallet), null);
  if (saved?.pk) {
    await apiCall('/api/follow_graph/keys/revoke', { method: 'POST', body: { key: privateKeyToAccount(saved.pk).address }, requiresAuth: true }).catch(() => null);
  }
  try { localStorage.removeItem(KEY(wallet)); localStorage.removeItem(OUTBOX(wallet)); } catch { /* ignore */ }
  write(DECLINED(wallet), Date.now() + 100 * 365 * 24 * 60 * 60_000);
}

/**
 * Identity + session key management for encrypted DMs (web).
 *
 * The identity keypair is derived from one wallet signature and kept in
 * localStorage under the signed-in address, so a returning session decrypts
 * without prompting the wallet again. The public half is published to the
 * API; peers fetch it to derive the shared conversation key.
 *
 * Every function here degrades to "not available" rather than throwing at a
 * call site that just wants to render a message: a peer without a published
 * key, an identity that has not been set up yet, or a message we cannot open
 * all come back as null and the caller falls back to plaintext or a
 * placeholder.
 */
import { apiCall } from '@/lib/api/dehub/core';
import {
  decryptText,
  deriveIdentityFromSignature,
  deriveSessionKey,
  encryptText,
  fromBase64,
  isEncryptedContent,
  isValidPublicKey,
  toBase64,
  type IdentityKeyPair,
} from './crypto';
import type { MediaDescriptor } from './media';
import { openMediaPlaintext } from './media-message';

const STORAGE_PREFIX = 'dehub-dm-e2ee:';
const PEER_KEY_TTL_MS = 5 * 60_000;
const PEER_KEY_MISS_TTL_MS = 30_000;

interface StoredIdentity {
  v: 1;
  priv: string;
  pub: string;
  previous?: Array<{ priv: string; pub: string }>;
}

let current: { address: string; keys: IdentityKeyPair } | null = null;
// Keep prior session keys for history; the current peer key is still refreshed.
const sessionKeys = new Map<string, Uint8Array>();
let previousIdentities: IdentityKeyPair[] = [];
const historicalPublicKeys = new Map<string, Set<string>>();
let historyWrite: Promise<void> = Promise.resolve();
const refreshAttempts = new Map<string, number>();
const refreshes = new Map<string, Promise<Uint8Array | null>>();
const peerFetches = new Map<string, Promise<string | null>>();
const peerKeys = new Map<string, { key: string | null; at: number }>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => {
    try { l(); } catch { /* listener errors must not break the caller */ }
  });
}

/** Subscribe to identity changes (set up / cleared). Returns unsubscribe. */
export function onIdentityChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function norm(address: string): string {
  return (address || '').toLowerCase();
}

function readStored(address: string): StoredIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + norm(address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredIdentity;
    if (parsed?.v !== 1 || !parsed.priv || !parsed.pub) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeStored(address: string, keys: IdentityKeyPair): Promise<void> {
  // Read failures or invalid records must never turn into an overwrite.
  const raw = localStorage.getItem(STORAGE_PREFIX + norm(address));
  const old = raw ? JSON.parse(raw) as StoredIdentity : null;
  if (old && (!isValidPublicKey(old.pub) || typeof old.priv !== 'string' || fromBase64(old.priv).length !== 32)) {
    throw new Error('Existing message identity could not be preserved');
  }
  const pub = toBase64(keys.publicKey);
  if (old?.previous !== undefined && (!Array.isArray(old.previous) || !old.previous.every(item =>
    isValidPublicKey(item?.pub) && typeof item?.priv === 'string' && fromBase64(item.priv).length === 32))) {
    throw new Error('Existing message identity could not be preserved');
  }
  const previous = [...(old?.previous ?? [])];
  if (old && old.pub !== pub && !previous.some(item => item.pub === old.pub)) {
    previous.push({ priv: old.priv, pub: old.pub });
  }
  const rec: StoredIdentity = { v: 1, priv: toBase64(keys.privateKey), pub, previous };
  localStorage.setItem(STORAGE_PREFIX + norm(address), JSON.stringify(rec));
  previousIdentities = previous.map(item => ({ privateKey: fromBase64(item.priv), publicKey: fromBase64(item.pub) }));
}

/** The identity currently loaded in memory, if any. */
export function getIdentity(): { address: string; publicKey: string } | null {
  return current ? { address: current.address, publicKey: toBase64(current.keys.publicKey) } : null;
}

export function hasIdentityFor(address: string): boolean {
  return !!current && current.address === norm(address);
}

/** Load a previously derived identity for this address from localStorage. */
export function loadIdentity(address: string): boolean {
  const addr = norm(address);
  if (!addr) return false;
  if (current?.address === addr) return true;
  const stored = readStored(addr);
  if (!stored) return false;
  try {
    const keys = { privateKey: fromBase64(stored.priv), publicKey: fromBase64(stored.pub) };
    const previous = (stored.previous ?? []).map(item => ({ privateKey: fromBase64(item.priv), publicKey: fromBase64(item.pub) }));
    if (keys.privateKey.length !== 32 || keys.publicKey.length !== 32 || previous.some(item => item.privateKey.length !== 32 || item.publicKey.length !== 32)) return false;
    current = { address: addr, keys };
    previousIdentities = previous;
    historicalPublicKeys.clear();
    refreshAttempts.clear();
    peerKeys.clear();
    sessionKeys.clear();
    notify();
    return true;
  } catch {
    return false;
  }
}

/** Forget the in-memory identity (sign-out). The stored copy stays for the next sign-in. */
export function unloadIdentity() {
  current = null;
  previousIdentities = [];
  historicalPublicKeys.clear();
  refreshAttempts.clear();
  refreshes.clear();
  peerFetches.clear();
  sessionKeys.clear();
  peerKeys.clear();
  // Only loaded once an attachment has been opened, so nothing to clear before.
  void import('./media-cache').then(m => m.clearDecryptedMedia()).catch(() => {});
  notify();
}

/**
 * Derive the identity from a wallet signature, persist it, and publish the
 * public key. `sign` is expected to produce a signature over exactly the text
 * from `encryptionSignMessage(address)`.
 */
export async function setupIdentity(
  address: string,
  sign: (message: string) => Promise<string>,
): Promise<{ publicKey: string }> {
  const addr = norm(address);
  const { encryptionSignMessage } = await import('./crypto');
  const signature = await sign(encryptionSignMessage(addr));
  const keys = deriveIdentityFromSignature(signature);
  await writeStored(addr, keys);
  current = { address: addr, keys };
  sessionKeys.clear();
  const publicKey = toBase64(keys.publicKey);
  await publishPublicKey(publicKey);
  peerKeys.set(addr, { key: publicKey, at: Date.now() });
  notify();
  return { publicKey };
}

/** Push our public key to the API so peers can encrypt to us. */
export async function publishPublicKey(publicKey: string): Promise<void> {
  await apiCall('/api/dm/e2ee-key', {
    method: 'POST',
    body: { publicKey },
    requiresAuth: true,
  });
}

/**
 * Make sure the key the server holds for us is the one we have locally. A
 * mismatch means another signer (or an older build) published a different
 * key; ours wins because it is the one this device can decrypt with.
 */
export async function syncPublishedKey(): Promise<void> {
  if (!current) return;
  const mine = toBase64(current.keys.publicKey);
  const remote = await fetchPeerPublicKey(current.address, { force: true });
  if (remote !== mine) await publishPublicKey(mine);
  peerKeys.set(current.address, { key: mine, at: Date.now() });
}

/** Fetch (and cache) a user's published public key. Null when they have none. */
export async function fetchPeerPublicKey(
  address: string,
  opts: { force?: boolean } = {},
): Promise<string | null> {
  const addr = norm(address);
  if (!addr) return null;
  const cached = peerKeys.get(addr);
  const ttl = cached?.key ? PEER_KEY_TTL_MS : PEER_KEY_MISS_TTL_MS;
  if (!opts.force && cached && Date.now() - cached.at < ttl) return cached.key;
  try {
    const res = await apiCall<{ address?: string; publicKey?: string | null }>(`/api/dm/e2ee-key/${addr}`, { requiresAuth: true });
    // The response names the address it answered for, and it has to be the one
    // we asked about. A key for anyone else is not a key we can use: encrypting
    // to it produces a message only its holder can open, and the recipient sees
    // an envelope they cannot touch. The server did exactly that for three days
    // (its auth guard overwrote the address in the path with the caller's own),
    // and no client could tell, because a wrong key is still a valid key.
    const answered = String(res?.address || '').toLowerCase();
    const key = answered === addr && isValidPublicKey(res?.publicKey) ? res.publicKey : null;
    peerKeys.set(addr, { key, at: Date.now() });
    return key;
  } catch {
    // Keep whatever we had rather than flapping between encrypted and plain.
    return cached?.key ?? null;
  }
}

export function getCachedPeerPublicKey(address: string): string | null | undefined {
  return peerKeys.get(norm(address))?.key;
}

/** Persist public keys already seen by this account so reloads retain history. */
async function rememberPeerKey(address: string, peer: string, publicKey: string | null): Promise<void> {
  const operation = historyWrite.then(async () => {
    const storageKey = `dehub-dm-peers:${address}:${peer}`;
    const existing = current?.address === address ? historicalPublicKeys.get(peer) : undefined;
    if (existing && (!publicKey || existing.has(publicKey))) return;
    const raw = localStorage.getItem(storageKey);
    const stored: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(stored) || !stored.every(isValidPublicKey)) return;
    if (current?.address !== address) return;
    const keys = historicalPublicKeys.get(peer) ?? new Set<string>();
    stored.forEach(value => keys.add(value));
    const changed = !!publicKey && !stored.includes(publicKey);
    if (publicKey) keys.add(publicKey);
    historicalPublicKeys.set(peer, keys);
    if (changed) { localStorage.setItem(storageKey, JSON.stringify([...keys])); }
  });
  // Storage failure cannot delete old records or prevent reading with a key
  // already in memory. Identity replacement, separately, fails closed.
  historyWrite = operation.catch(() => {});
  await historyWrite;
}

function sessionId(peer: string, publicKey: string): string {
  return `${peer}:${publicKey}`;
}

async function getSessionKey(peerAddress: string, force = false): Promise<Uint8Array | null> {
  const identity = current;
  if (!identity) return null;
  const peer = norm(peerAddress);
  if (!peer) return null;
  // Resolve the peer before consulting the derived cache so its TTL is honored.
  const fetchId = `${identity.address}:${peer}:${force}`;
  let pending = peerFetches.get(fetchId);
  if (!pending) {
    pending = fetchPeerPublicKey(peer, { force });
    peerFetches.set(fetchId, pending);
  }
  let pub: string | null;
  try { pub = await pending; }
  finally { if (peerFetches.get(fetchId) === pending) peerFetches.delete(fetchId); }
  if (current !== identity) return null;
  await rememberPeerKey(identity.address, peer, pub);
  if (!pub || current !== identity) return null;
  const id = sessionId(peer, pub);
  const hit = sessionKeys.get(id);
  if (hit) return hit;
  const key = deriveSessionKey(identity.keys.privateKey, fromBase64(pub), identity.address, peer);
  sessionKeys.set(id, key);
  return key;
}

/** Try retained identities and session keys without changing any message. */
function openHistory(peerAddress: string, envelope: string): string | null {
  if (!current) return null;
  const peer = norm(peerAddress);
  const publicKeys = new Set(historicalPublicKeys.get(peer));
  const latest = peerKeys.get(peer)?.key;
  if (latest) publicKeys.add(latest);
  for (const [id, key] of sessionKeys) {
    if (!id.startsWith(`${peer}:`)) continue;
    publicKeys.add(id.slice(peer.length + 1));
    try { return decryptText(envelope, key); } catch { /* try another retained key */ }
  }
  for (const identity of [current.keys, ...previousIdentities]) {
    for (const pub of [...publicKeys, toBase64(identity.publicKey)]) {
      try {
        return decryptText(envelope, deriveSessionKey(identity.privateKey, fromBase64(pub), current.address, peer));
      } catch { /* wrong historical key or unauthenticated envelope */ }
    }
  }
  return null;
}

/** True once a session key for this peer is derived (sync decrypt possible). */
export function canEncryptTo(peerAddress: string): boolean {
  return !!current && !!peerKeys.get(norm(peerAddress))?.key && sessionKeys.has(sessionId(norm(peerAddress), peerKeys.get(norm(peerAddress))!.key!));
}

/**
 * Async counterpart of canEncryptTo: derives the session key if it can. Lets a
 * sender decide up front whether an attachment will travel encrypted, before
 * spending time shrinking and sealing it.
 */
export async function canEncryptToPeer(peerAddress: string | null | undefined): Promise<boolean> {
  if (!peerAddress) return false;
  return !!(await getSessionKey(peerAddress));
}

/**
 * Encrypt outgoing text for a peer. Returns null when encryption is not
 * possible (no identity yet, peer has no key) so the caller can send plain.
 */
export async function encryptForPeer(peerAddress: string, plaintext: string): Promise<string | null> {
  if (!plaintext) return null;
  const key = await getSessionKey(peerAddress);
  if (!key) return null;
  try {
    return encryptText(plaintext, key);
  } catch {
    return null;
  }
}

/**
 * What goes on the wire for an outgoing text: the ciphertext when both sides
 * have keys, otherwise the plaintext unchanged (peer on an older build, peer
 * without keys, the assistant bot, or our own identity not set up yet).
 */
export async function prepareOutgoing(
  peerAddress: string | null | undefined,
  plaintext: string,
): Promise<{ content: string; encrypted: boolean }> {
  if (!plaintext || !peerAddress) return { content: plaintext, encrypted: false };
  const ct = await encryptForPeer(peerAddress, plaintext);
  return ct ? { content: ct, encrypted: true } : { content: plaintext, encrypted: false };
}

/** Decrypt an envelope from/for a peer. Null when it cannot be opened. */
export async function decryptFromPeer(peerAddress: string, envelope: string): Promise<string | null> {
  if (!isEncryptedContent(envelope)) return envelope;
  const identity = current;
  if (!identity) return null;
  const key = await getSessionKey(peerAddress);
  if (current !== identity) return null;
  if (key) {
    try { return decryptText(envelope, key); } catch { /* refresh a stale peer key */ }
  }
  const historical = openHistory(peerAddress, envelope);
  if (historical !== null) return historical;
  const peer = norm(peerAddress);
  const last = refreshAttempts.get(peer);
  let refresh = refreshes.get(peer);
  // One refresh per peer per 30 seconds, shared by a whole history batch.
  if (!refresh && (last === undefined || Date.now() - last >= PEER_KEY_MISS_TTL_MS)) {
    refreshAttempts.set(peer, Date.now());
    refresh = getSessionKey(peer, true);
    refreshes.set(peer, refresh);
  }
  if (refresh) {
    try { await refresh; }
    finally { if (refreshes.get(peer) === refresh) refreshes.delete(peer); }
  }
  return current === identity ? openHistory(peer, envelope) : null;
}


/** Sync variant for hot paths; only works once the session key is cached. */
export function decryptFromPeerSync(peerAddress: string, envelope: string): string | null {
  if (!isEncryptedContent(envelope)) return envelope;
  return openHistory(peerAddress, envelope);
}

/**
 * Shape shared by every message-like record we decrypt in place. `encrypted`
 * is set on the result so the UI can show a lock; `content` becomes the
 * plaintext, or '' with `undecryptable` when the envelope cannot be opened
 * (so nothing downstream ever renders raw ciphertext).
 */
export interface DecryptableMessage {
  content: string;
  encrypted?: boolean;
  undecryptable?: boolean;
  /** Set when the plaintext was an encrypted attachment's descriptor; `content` is then its caption. */
  encMedia?: MediaDescriptor;
  replyTo?: { content: string; encMedia?: MediaDescriptor } | null;
}

export async function decryptMessageInPlace<T extends DecryptableMessage>(
  msg: T,
  peerAddress: string | null | undefined,
): Promise<T> {
  let out = msg;
  if (isEncryptedContent(msg.content)) {
    const plain = peerAddress ? await decryptFromPeer(peerAddress, msg.content) : null;
    out = plain !== null
      ? { ...out, encrypted: true, undecryptable: false, ...openMediaPlaintext(plain) }
      : { ...out, content: '', encrypted: true, undecryptable: true };
  }
  if (msg.replyTo && isEncryptedContent(msg.replyTo.content)) {
    const plain = peerAddress ? await decryptFromPeer(peerAddress, msg.replyTo.content) : null;
    const opened = openMediaPlaintext(plain ?? '');
    out = {
      ...out,
      replyTo: { ...msg.replyTo, content: opened.content, ...(opened.encMedia ? { encMedia: opened.encMedia } : {}) },
    };
  }
  return out;
}

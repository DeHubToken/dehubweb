/**
 * Profiles on this device.
 * ========================
 * One browser can hold several DeHub accounts. The list lives in localStorage
 * (`dehub_profiles_v1`); each entry keeps the account's public identity plus a
 * snapshot of the session keys it had the last time it was active, so switching
 * back is silent instead of a fresh login.
 *
 * The snapshot has to be taken while a session is still the LIVE one — both
 * token systems rotate their refresh tokens on use, so a stash written at
 * login time holds a refresh token that the next background refresh will
 * invalidate. Hence the listeners in initProfileTracking: every successful
 * token refresh (DeHub's `dehub:token-refreshed`, Supabase's TOKEN_REFRESHED)
 * and every pagehide re-snapshot the current account, which keeps its stored
 * copy perpetually fresh and means the value left behind when the account goes
 * inactive was never handed to a rotation since.
 *
 * Restoring writes those keys back and lets AuthProvider re-seat the Supabase
 * session before a reload, so boot hydrates exactly as if that account had
 * just logged in — same recovery chains, same vault prompts per profile.
 */

import { supabase } from '@/integrations/supabase/client';
import { lockWallet } from '@/lib/smart-wallet';
import type { ConnectionSource } from '@/lib/connection-source';

export const PROFILES_CHANGED_EVENT = 'dehub:profiles-changed';
export const PROFILES_STORAGE_KEY = 'dehub_profiles_v2';

/** v1 auto-registered every session that touched the browser — on a shared
 * computer that turned the list into a directory of family accounts. Dropped
 * on init; explicit adoption (the Add profile flow) is the only way in now. */
const LEGACY_PROFILES_KEY = 'dehub_profiles_v1';

const SUPA_LOGIN_PENDING_KEY = 'dehub_supa_login_pending';
const SUPA_LOGIN_PENDING_AT_KEY = 'dehub_supa_login_pending_at';

/** Everything a session owns in localStorage. Stashed and restored as a set. */
const SESSION_KEYS = [
  'dehub_token',
  'dehub_refresh_token',
  'dehub_token_expires_at',
  'dehub_token_timestamp',
  'dehub_wallet',
  'dehub_user',
  'dehub_supabase_uid',
  'dehub_connection_source',
  'dehub_wallet_enc',
] as const;

/** Same prefixes wagmi.ts clears on disconnect — kept in step with it. */
const WAGMI_PREFIXES = ['wagmi', '@appkit', '@w3m', 'wc@', 'WCM@', 'W3M'];

const MAX_PROFILES = 8;

export interface StoredProfileSession {
  /** The live values of SESSION_KEYS at snapshot time (missing keys omitted). */
  tokens: Record<string, string>;
  /** wagmi/appkit storage for external-wallet profiles; empty otherwise. */
  wagmiKeys: Record<string, string>;
  /** Supabase session at snapshot time, when one exists. */
  supabase?: { access_token: string; refresh_token: string };
}

export interface StoredProfile {
  /** Supabase uid when known, else `addr:<address>` for wallet-only accounts. */
  id: string;
  uid: string | null;
  address: string;
  name: string | null;
  username: string | null;
  avatarPath: string | null;
  source: ConnectionSource | null;
  addedAt: number;
  lastActiveAt: number;
  /** Null once the session is gone — switching to it asks for sign-in again. */
  session: StoredProfileSession | null;
}

function readStore(): StoredProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredProfile[]) : [];
  } catch {
    return [];
  }
}

function writeStore(profiles: StoredProfile[]): void {
  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  } catch { /* private mode — the list just doesn't persist */ }
  try {
    window.dispatchEvent(new Event(PROFILES_CHANGED_EVENT));
  } catch { /* ignore */ }
}

interface CachedUser {
  displayName?: string;
  display_name?: string;
  username?: string;
  avatarImageUrl?: string;
  avatarUrl?: string;
  avatar_url?: string;
}

/** Who the live localStorage keys belong to right now, or null signed-out. */
function currentIdentity(): { id: string; uid: string | null; address: string } | null {
  let address: string | null = null;
  let uid: string | null = null;
  try {
    address = localStorage.getItem('dehub_wallet');
    uid = localStorage.getItem('dehub_supabase_uid');
  } catch { /* ignore */ }
  if (!address) return null;
  return { id: uid ?? `addr:${address.toLowerCase()}`, uid, address };
}

export function currentProfileId(): string | null {
  return currentIdentity()?.id ?? null;
}

export function listProfiles(): StoredProfile[] {
  return readStore().sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

export function getProfile(id: string): StoredProfile | null {
  return readStore().find((p) => p.id === id) ?? null;
}

export function removeProfile(id: string): void {
  writeStore(readStore().filter((p) => p.id !== id));
}

/**
 * Merge refreshed session tokens into a profile's stored stash without
 * touching the live keys. Written for the moment a background refresh for one
 * account lands after another account took over the live keys (second tab,
 * add-profile staging): the rotated pair is still valid, and filing it here is
 * what keeps that profile's chain alive — a snapshot left holding a refresh
 * token the server already rotated gets its whole family revoked on reuse.
 */
export function mergeTokensIntoStoredProfile(
  owner: { wallet: string; uid: string | null },
  tokens: Record<string, string>,
): void {
  const id = owner.uid ?? `addr:${owner.wallet.toLowerCase()}`;
  const profiles = readStore();
  const entry = profiles.find((p) => p.id === id);
  if (!entry?.session) return;
  Object.assign(entry.session.tokens, tokens);
  writeStore(profiles);
}

function readWagmiKeys(): Record<string, string> {
  const keys: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !WAGMI_PREFIXES.some((p) => key.startsWith(p))) continue;
      const value = localStorage.getItem(key);
      if (value !== null) keys[key] = value;
    }
  } catch { /* ignore */ }
  return keys;
}

function wipeWagmiKeys(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && WAGMI_PREFIXES.some((p) => key.startsWith(p))) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch { /* ignore */ }
}

/** The Supabase client persists every session under one of these. */
function wipeSupabaseStorageKeys(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.+-auth-token$/.test(key)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch { /* ignore */ }
}

/**
 * The Supabase session from the client's own storage entry. Read directly
 * rather than via getSession() so pagehide can snapshot synchronously.
 */
function readSupabaseSession(): StoredProfileSession['supabase'] {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const parsed = JSON.parse(localStorage.getItem(key) ?? '');
      if (parsed?.access_token && parsed?.refresh_token) {
        return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

/** True mid-switch so tracking never snapshots half-written keys. */
let switchGuarded = false;

/**
 * Snapshot whatever account the live localStorage keys belong to.
 *
 * `adopt` false (tracking): refreshes an EXISTING registry entry only —
 * background listeners call this, so a family member's one-off login on a
 * shared browser never joins the list uninvited. `adopt` true: creates the
 * entry if missing — reserved for the Add profile flow, where the user has
 * explicitly said they want this account saved here.
 *
 * No-op signed out, or while a profile switch has keys in flight.
 */
function snapshotSession(adopt: boolean): void {
  if (switchGuarded) return;
  const identity = currentIdentity();
  // A half-established flow (cleared wallet, no token yet) is not a profile.
  let hasToken = false;
  try { hasToken = !!localStorage.getItem('dehub_token'); } catch { /* ignore */ }
  if (!identity || !hasToken) return;

  const profiles = readStore();
  const existingIndex = profiles.findIndex((p) => p.id === identity.id);
  if (!adopt && existingIndex < 0) return;

  let user: CachedUser | null = null;
  let source: ConnectionSource | null = null;
  const tokens: Record<string, string> = {};
  try {
    const rawUser = localStorage.getItem('dehub_user');
    if (rawUser) user = JSON.parse(rawUser) as CachedUser;
    const rawSource = localStorage.getItem('dehub_connection_source');
    if (rawSource === 'web3auth' || rawSource === 'wagmi') source = rawSource;
    for (const key of SESSION_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) tokens[key] = value;
    }
  } catch { /* ignore */ }

  const now = Date.now();
  const existing = existingIndex >= 0 ? profiles[existingIndex] : null;

  const entry: StoredProfile = {
    id: identity.id,
    uid: identity.uid,
    address: identity.address,
    name: user?.displayName || user?.display_name || user?.username || null,
    username: user?.username ?? null,
    avatarPath: user?.avatarImageUrl || user?.avatarUrl || user?.avatar_url || null,
    source,
    addedAt: existing?.addedAt ?? now,
    lastActiveAt: now,
    session: {
      tokens,
      wagmiKeys: readWagmiKeys(),
      supabase: readSupabaseSession(),
    },
  };

  if (existingIndex >= 0) profiles[existingIndex] = entry;
  else profiles.push(entry);

  // Bound the list, never dropping whoever is live right now.
  while (profiles.length > MAX_PROFILES) {
    const oldest = [...profiles]
      .sort((a, b) => a.lastActiveAt - b.lastActiveAt)
      .find((p) => p.id !== identity.id);
    if (!oldest) break;
    profiles.splice(profiles.indexOf(oldest), 1);
  }

  writeStore(profiles);
}

/** Refresh the live account's registry copy, creating nothing. */
export function snapshotCurrentSession(): void {
  snapshotSession(false);
}

/** Record the live account as an explicitly added profile. */
export function adoptCurrentProfile(): void {
  snapshotSession(true);
}

/**
 * A new login is about to overwrite the session keys with the incoming
 * account's identity. Give the outgoing account one final snapshot, then
 * clear every key it owned so the two identities can never blend — the vault
 * is single-slot, and a stale `dehub_supabase_uid` makes the next refresh
 * treat the new account as linked to the old one.
 *
 * `keepWagmiKeys` for flows whose own connect call just wrote the incoming
 * wallet's wagmi storage; wiping those would sever the in-progress connection.
 */
export function stageIncomingIdentity(options?: { keepWagmiKeys?: boolean }): void {
  snapshotCurrentSession();
  lockWallet();
  for (const key of SESSION_KEYS) localStorage.removeItem(key);
  if (!options?.keepWagmiKeys) wipeWagmiKeys();
  // Without this, the Supabase client's next boot hydrates the OUTGOING
  // user's session while every DeHub key belongs to the new one.
  wipeSupabaseStorageKeys();
  localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
  localStorage.removeItem(SUPA_LOGIN_PENDING_AT_KEY);
}

let trackingStarted = false;

/**
 * Keep the live account's registry copy fresh. Idempotent; called from
 * AuthProvider's mount effect.
 */
export function initProfileTracking(): void {
  if (trackingStarted) return;
  trackingStarted = true;

  try { localStorage.removeItem(LEGACY_PROFILES_KEY); } catch { /* ignore */ }

  window.addEventListener('dehub:token-refreshed', () => snapshotCurrentSession());
  window.addEventListener('pagehide', () => snapshotCurrentSession());
  void supabase.auth.onAuthStateChange((event) => {
    if (event === 'TOKEN_REFRESHED') snapshotCurrentSession();
  });
}

export interface ProfileSwitchPlan {
  id: string;
  uid: string | null;
  address: string;
  supabase: { access_token: string; refresh_token: string } | null;
}

/**
 * Write a session stash into place: everything the outgoing account owned is
 * wiped first — key material never crosses identities, and a half-swap must
 * never be what an authed request reads off disk.
 */
function applyStash(session: StoredProfileSession | null): void {
  lockWallet();
  for (const key of SESSION_KEYS) localStorage.removeItem(key);
  wipeWagmiKeys();
  wipeSupabaseStorageKeys();
  if (session) {
    for (const [key, value] of Object.entries(session.tokens)) {
      localStorage.setItem(key, value);
    }
    for (const [key, value] of Object.entries(session.wagmiKeys)) {
      localStorage.setItem(key, value);
    }
  }
  // The pending flag and its freshness twin belong to whichever flow was
  // interrupted, never to a restored identity.
  localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
  localStorage.removeItem(SUPA_LOGIN_PENDING_AT_KEY);
}

/**
 * Put an explicitly added profile's last snapshot back on disk — used when an
 * add-profile attempt is abandoned after it already displaced the live
 * session. Returns the Supabase tokens to re-seat, or null when the profile
 * has nothing stored (in which case disk is simply clean).
 */
export function applyProfileSnapshot(id: string): { supabase: StoredProfileSession['supabase'] } | null {
  const entry = getProfile(id);
  applyStash(entry?.session ?? null);
  return { supabase: entry?.session?.supabase ?? null };
}

/**
 * Stage a switch to another saved profile: snapshot the outgoing account one
 * last time, lock its wallet key away, then write the target's session keys
 * into place. Returns what AuthProvider needs to finish (re-seat Supabase,
 * rewrite the last-session record, reload); null when the target has no usable
 * stored session, in which case nothing on disk was touched.
 *
 * If the write itself throws midway, the outgoing account's just-refreshed
 * snapshot is written back before returning null — disk always ends up
 * describing exactly one whole identity.
 */
export function beginProfileSwitch(id: string): ProfileSwitchPlan | null {
  const entry = getProfile(id);
  if (!entry?.session) return null;

  snapshotCurrentSession();
  const outgoing = currentIdentity();
  switchGuarded = true;
  try {
    applyStash(entry.session);
  } catch {
    try {
      applyStash(outgoing ? getProfile(outgoing.id)?.session ?? null : null);
    } catch { /* nothing more to do — next boot re-syncs from Supabase */ }
    switchGuarded = false;
    return null;
  }

  return {
    id: entry.id,
    uid: entry.uid,
    address: entry.address,
    supabase: entry.session.supabase ?? null,
  };
}

/**
 * Back out of a staged switch whose restore failed (dead refresh token,
 * network error mid-setSession). Puts the account that was live before
 * `beginProfileSwitch` back on disk; when there was none (switching from a
 * signed-out state), every staged key is wiped instead — a signed-out UI must
 * not have anyone's tokens under it. No-op when nothing was staged.
 */
export function abortProfileSwitch(prevId: string | null): void {
  if (!switchGuarded) return;
  try {
    const prev = prevId ? getProfile(prevId) : null;
    applyStash(prev?.session ?? null);
  } finally {
    switchGuarded = false;
  }
}

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
export const PROFILES_STORAGE_KEY = 'dehub_profiles_v1';

const SUPA_LOGIN_PENDING_KEY = 'dehub_supa_login_pending';

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
 * Snapshot whatever account the live localStorage keys belong to into the
 * registry. No-op signed out, or while a profile switch has keys in flight.
 */
export function snapshotCurrentSession(): void {
  if (switchGuarded) return;
  const identity = currentIdentity();
  // A half-established flow (cleared wallet, no token yet) is not a profile.
  let hasToken = false;
  try { hasToken = !!localStorage.getItem('dehub_token'); } catch { /* ignore */ }
  if (!identity || !hasToken) return;

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

  const profiles = readStore();
  const now = Date.now();
  const existingIndex = profiles.findIndex((p) => p.id === identity.id);
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

let trackingStarted = false;

/**
 * Keep the live account's registry copy fresh. Idempotent; called from
 * AuthProvider's mount effect.
 */
export function initProfileTracking(): void {
  if (trackingStarted) return;
  trackingStarted = true;

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
 * Stage a switch to another saved profile: snapshot the outgoing account one
 * last time, lock its wallet key away, then write the target's session keys
 * into place. Returns what AuthProvider needs to finish (re-seat Supabase,
 * rewrite the last-session record, reload); null when the target has no usable
 * stored session, in which case nothing on disk was touched.
 */
export function beginProfileSwitch(id: string): ProfileSwitchPlan | null {
  const entry = getProfile(id);
  if (!entry?.session) return null;

  snapshotCurrentSession();
  switchGuarded = true;
  try {
    // Key material never crosses identities: the vault and unlock timestamp
    // are single-slot, so they go now rather than leaking into the target.
    lockWallet();
    for (const key of SESSION_KEYS) localStorage.removeItem(key);
    wipeWagmiKeys();
    for (const [key, value] of Object.entries(entry.session.tokens)) {
      localStorage.setItem(key, value);
    }
    for (const [key, value] of Object.entries(entry.session.wagmiKeys)) {
      localStorage.setItem(key, value);
    }
    localStorage.removeItem(SUPA_LOGIN_PENDING_KEY);
  } catch {
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

/** Un-stick the guard when a staged switch fails before the reload. */
export function cancelProfileSwitch(): void {
  switchGuarded = false;
}

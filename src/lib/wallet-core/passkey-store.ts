// Supabase persistence for biometric (WebAuthn PRF) wallet wraps.
//
// Each row is the SAME wallet seed as user_wallets.encrypted_seed, wrapped
// under a key derived from one passkey's PRF output instead of the wallet
// password (see passkey.ts and crypto.ts's `hkdf` KDF). One row per enrolled
// credential, so removing a device revokes only that device.
//
// Rows hold ciphertext plus the non-secret PRF salt — never key material. RLS
// scopes every row to its owner. The rows are additionally cached in
// localStorage so the biometric unlock still works on a flaky connection,
// mirroring how store.ts caches the password wrap.
import { supabase } from "@/integrations/supabase/client";
import type { EncryptedPayload } from "./crypto";
import type { PasskeyRef } from "./passkey";

export interface PasskeyWrap extends PasskeyRef {
  payload: EncryptedPayload;
  label: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
}

const CACHE_KEY = "dehub_wallet_passkeys";

// user_wallet_passkeys is not in the generated Database types yet — cast
// through the untyped client, same as store.ts does for user_wallets.
function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToWrap(row: any): PasskeyWrap {
  return {
    credentialId: row.credential_id,
    prfSalt: row.prf_salt,
    payload: {
      ciphertext: row.encrypted_seed,
      salt: row.salt,
      iv: row.iv,
      iterations: row.kdf_iterations ?? 0,
    },
    label: row.label ?? null,
    createdAt: row.created_at ?? null,
    lastUsedAt: row.last_used_at ?? null,
  };
}

function isUsable(wrap: PasskeyWrap): boolean {
  return !!wrap.credentialId && !!wrap.prfSalt && !!wrap.payload?.ciphertext;
}

export function getCachedPasskeyWraps(): PasskeyWrap[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PasskeyWrap[];
    return Array.isArray(parsed) ? parsed.filter(isUsable) : [];
  } catch {
    return [];
  }
}

function cachePasskeyWraps(wraps: PasskeyWrap[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(wraps));
  } catch { /* quota/private mode — cache is best-effort */ }
}

export function clearPasskeyCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

/** Fetch the caller's biometric wraps (RLS-scoped), newest first. */
export async function fetchPasskeyWraps(userId: string): Promise<PasskeyWrap[]> {
  const { data, error } = await db()
    .from("user_wallet_passkeys")
    .select("credential_id, prf_salt, encrypted_seed, salt, iv, kdf_iterations, label, created_at, last_used_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Failed to load biometric unlock");
  const wraps = (data ?? []).map(rowToWrap).filter(isUsable);
  cachePasskeyWraps(wraps);
  return wraps;
}

/**
 * Wraps for the unlock screen: the server's list when reachable, otherwise the
 * local cache. A stale cache can only ever produce a failed unlock (the row it
 * points at is gone server-side), never a wrong one, so preferring it over an
 * error is safe — and it's what keeps biometric unlock working offline.
 */
export async function loadPasskeyWraps(userId: string): Promise<PasskeyWrap[]> {
  try {
    return await fetchPasskeyWraps(userId);
  } catch {
    return getCachedPasskeyWraps();
  }
}

export async function savePasskeyWrap(
  userId: string,
  wrap: { credentialId: string; prfSalt: string; payload: EncryptedPayload; label?: string | null },
): Promise<void> {
  const { error } = await db().from("user_wallet_passkeys").upsert(
    {
      user_id: userId,
      credential_id: wrap.credentialId,
      prf_salt: wrap.prfSalt,
      encrypted_seed: wrap.payload.ciphertext,
      salt: wrap.payload.salt,
      iv: wrap.payload.iv,
      kdf_iterations: wrap.payload.iterations,
      label: wrap.label ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "user_id,credential_id" },
  );
  if (error) throw new Error(error.message || "Failed to save biometric unlock");
  clearPasskeyCache();
}

export async function deletePasskeyWrap(userId: string, credentialId: string): Promise<void> {
  const { error } = await db()
    .from("user_wallet_passkeys")
    .delete()
    .eq("user_id", userId)
    .eq("credential_id", credentialId);
  if (error) throw new Error(error.message || "Failed to remove biometric unlock");
  clearPasskeyCache();
}

/**
 * Drop every biometric wrap for this account. Used when the active wallet is
 * replaced (switchActiveWallet): the wraps hold the old seed, so keeping them
 * would mean a passkey that unlocks a wallet the user no longer uses.
 */
export async function deleteAllPasskeyWraps(userId: string): Promise<void> {
  const { error } = await db().from("user_wallet_passkeys").delete().eq("user_id", userId);
  if (error) throw new Error(error.message || "Failed to reset biometric unlock");
  clearPasskeyCache();
}

/**
 * Label for the OS passkey sheet — the user's email when the session exposes
 * one, so the credential is recognisable in their password manager later.
 */
export async function getPasskeyAccountLabel(): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.email || undefined;
  } catch {
    return undefined;
  }
}

/** Best-effort "last used" bookkeeping for the Settings list. Never throws. */
export async function touchPasskeyWrap(userId: string, credentialId: string): Promise<void> {
  try {
    await db()
      .from("user_wallet_passkeys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("credential_id", credentialId);
  } catch { /* cosmetic only */ }
}

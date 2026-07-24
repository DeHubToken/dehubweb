// Supabase persistence for the DeHub self-custody wallet.
//
// The seed is encrypted CLIENT-SIDE (AES-256-GCM + Argon2id, see crypto.ts)
// before it ever leaves the device. Rows are protected by RLS — a user can
// only read/write their own wallet. The encrypted payload is additionally
// cached in localStorage so returning users can unlock without a network
// round-trip (the cache holds only ciphertext, never key material).
import { supabase } from "@/integrations/supabase/client";
import type { EncryptedPayload } from "./crypto";

export interface StoredWallet {
  ethAddress: string;
  payload: EncryptedPayload;
}

const CACHE_KEY = "dehub_wallet_enc";

// user_wallets / user_wallet_recovery are not in the generated Database types
// yet — cast through the untyped client.
function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

export function getCachedWallet(): StoredWallet | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredWallet & { userId?: string };
    if (!parsed?.ethAddress || !parsed?.payload?.ciphertext) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cacheWallet(wallet: StoredWallet): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(wallet));
  } catch { /* quota/private mode — cache is best-effort */ }
}

export function clearWalletCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

/** Fetch the caller's wallet row (RLS-scoped). Returns null if none exists. */
export async function fetchWallet(userId: string): Promise<StoredWallet | null> {
  const { data, error } = await db()
    .from("user_wallets")
    .select("eth_address, encrypted_seed, salt, iv, kdf_iterations")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Failed to load wallet");
  if (!data) return null;
  const wallet: StoredWallet = {
    ethAddress: data.eth_address,
    payload: {
      ciphertext: data.encrypted_seed,
      salt: data.salt,
      iv: data.iv,
      iterations: data.kdf_iterations,
    },
  };
  cacheWallet(wallet);
  return wallet;
}

/**
 * Persist a freshly created/imported wallet. The recovery row is saved FIRST
 * and treated as fatal on failure — a wallet must never exist without a
 * working password-reset path (Pixcellor invariant).
 */
export async function saveWallet(
  userId: string,
  ethAddress: string,
  payload: EncryptedPayload,
  recoveryPayload: EncryptedPayload,
): Promise<void> {
  const { error: recErr } = await db().from("user_wallet_recovery").upsert({
    user_id: userId,
    encrypted_seed: recoveryPayload.ciphertext,
    salt: recoveryPayload.salt,
    iv: recoveryPayload.iv,
    kdf_iterations: recoveryPayload.iterations,
  });
  if (recErr) {
    throw new Error("Couldn't set up wallet recovery — nothing was saved. Please try again.");
  }

  const { error: insertErr } = await db().from("user_wallets").upsert({
    user_id: userId,
    eth_address: ethAddress,
    encrypted_seed: payload.ciphertext,
    salt: payload.salt,
    iv: payload.iv,
    kdf_iterations: payload.iterations,
  });
  if (insertErr) throw new Error(insertErr.message || "Failed to save wallet");

  cacheWallet({ ethAddress, payload });
}

/** Fetch the recovery-encrypted seed (for the "forgot password" reset flow). */
export async function fetchRecoveryPayload(userId: string): Promise<EncryptedPayload | null> {
  const { data, error } = await db()
    .from("user_wallet_recovery")
    .select("encrypted_seed, salt, iv, kdf_iterations")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Failed to load recovery data");
  if (!data) return null;
  return {
    ciphertext: data.encrypted_seed,
    salt: data.salt,
    iv: data.iv,
    iterations: data.kdf_iterations,
  };
}

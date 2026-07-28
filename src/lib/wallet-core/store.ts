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
  /**
   * The password-encrypted seed, or null for a wallet that was created with
   * biometrics and has no password backup yet. Callers that need a password
   * must handle null rather than assuming a wrap exists.
   */
  payload: EncryptedPayload | null;
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
    if (!parsed?.ethAddress) return null;
    // A cached entry with no usable password wrap is still worth returning —
    // the address alone is what the biometric unlock path needs.
    return { ...parsed, payload: parsed.payload?.ciphertext ? parsed.payload : null };
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
    payload: data.encrypted_seed
      ? {
          ciphertext: data.encrypted_seed,
          salt: data.salt,
          iv: data.iv,
          iterations: data.kdf_iterations,
        }
      : null,
  };
  cacheWallet(wallet);
  return wallet;
}

/**
 * Persist a freshly created/imported wallet. recoveryPayload is optional —
 * new wallets no longer generate a recovery code (export-private-key from
 * Settings is the supported backup path); pre-existing recovery rows for
 * wallets created before this change keep working via fetchRecoveryPayload.
 *
 * `payload` may be null for a wallet protected only by biometrics: the row is
 * then written WITHOUT the seed columns, which both leaves encrypted_seed NULL
 * on insert and — because PostgREST's upsert only assigns the columns it was
 * given — preserves an existing password wrap on update. Adding a password
 * backup later simply calls this again with a real payload.
 */
export async function saveWallet(
  userId: string,
  ethAddress: string,
  payload: EncryptedPayload | null,
  recoveryPayload?: EncryptedPayload,
): Promise<void> {
  if (recoveryPayload) {
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
  }

  const { error: insertErr } = await db().from("user_wallets").upsert({
    user_id: userId,
    eth_address: ethAddress,
    ...(payload
      ? {
          encrypted_seed: payload.ciphertext,
          salt: payload.salt,
          iv: payload.iv,
          kdf_iterations: payload.iterations,
        }
      : {}),
  });
  if (insertErr) throw new Error(insertErr.message || "Failed to save wallet");

  // Mirror the server-side semantics in the cache: a null payload must not
  // erase a password wrap this browser already knows about for this address.
  const previous = getCachedWallet();
  const keptPayload = payload
    ?? (previous?.ethAddress?.toLowerCase() === ethAddress.toLowerCase() ? previous.payload : null);
  cacheWallet({ ethAddress, payload: keptPayload });
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

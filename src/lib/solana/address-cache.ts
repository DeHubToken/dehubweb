/**
 * Where this browser remembers the wallet's derived Solana address.
 *
 * Split from derive.ts on purpose: reading the address is a render-path
 * operation (the copy sheet, the wallet header) and must not drag @noble's
 * ed25519 into those chunks. Only the write side needs the crypto.
 *
 * The value is a public address and nothing else — no key material has ever
 * been in Web Storage and none is here either.
 */

const CACHE_KEY = 'dehub_solana_address';
/** wallet-core's ciphertext cache; its address is what binds an entry. */
const WALLET_CACHE_KEY = 'dehub_wallet_enc';

/**
 * Fired once the address has been derived. The unlock's own lock-change event
 * is too early: the derivation is dynamically imported, so it lands a tick or
 * two later and a UI listening only to the unlock would render "no Solana
 * wallet" and stay there.
 */
export const SOLANA_ADDRESS_CHANGED_EVENT = 'dehub:solana-address-changed';

interface CachedSolanaAddress {
  /** The EVM address that produced it, lowercased. */
  owner: string;
  address: string;
}

/**
 * The EVM address this browser's cached wallet belongs to.
 *
 * `dehub_wallet_enc` is wiped whenever the identity changes (it is one of
 * profiles.ts's SESSION_KEYS), which is what stops a stale Solana address
 * outliving the account it belongs to.
 */
function cachedWalletAddress(): string | null {
  try {
    const raw = localStorage.getItem(WALLET_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ethAddress?: string };
    return parsed?.ethAddress?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/**
 * Last parse, keyed on the raw strings it came from.
 *
 * useSyncExternalStore calls the snapshot on every render, so without this a
 * wallet menu would JSON.parse two localStorage entries per keystroke it
 * happens to re-render on. Both keys change rarely; the raw strings are the
 * cheap identity check.
 */
let memo: { raw: string; owner: string | null; value: string | null } | null = null;

/**
 * This wallet's Solana address, or null if it has not been derived on this
 * browser yet.
 *
 * Synchronous and free of any crypto work, so render paths can call it.
 */
export function getCachedSolanaAddress(): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const ownerNow = cachedWalletAddress();
    if (memo && memo.raw === raw && memo.owner === ownerNow) return memo.value;
    const entry = JSON.parse(raw) as CachedSolanaAddress;
    if (!entry?.address || !entry?.owner) return null;

    // Belt and braces on top of the SESSION_KEYS wipe: if the wallet cache says
    // this browser now holds a different wallet, the Solana entry is stale and
    // showing it would hand out someone else's deposit address.
    if (ownerNow && ownerNow !== entry.owner) {
      clearCachedSolanaAddress();
      return null;
    }
    memo = { raw, owner: ownerNow, value: entry.address };
    return entry.address;
  } catch {
    return null;
  }
}

export function writeCachedSolanaAddress(owner: string, address: string): void {
  const entry: CachedSolanaAddress = { owner: owner.toLowerCase(), address };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Quota or private mode. Costs the Solana row until the next unlock, and
    // nothing else — the address is always re-derivable.
    return;
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SOLANA_ADDRESS_CHANGED_EVENT));
  }
}

export function clearCachedSolanaAddress(): void {
  memo = null;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

/**
 * The addresses this account can be paid at, per address space.
 *
 * SOL and SPL tokens sent to an `0x…` address are gone — Solana and the EVM
 * chains do not share an address space — so anywhere the app offers to copy
 * "your address" it has to be able to say which one it means.
 *
 * Two ways an account has a Solana address:
 *
 * - **Derived.** Every DeHub smart wallet has one, computed from the same
 *   private key (see lib/solana/derive.ts) and cached at unlock so reading it
 *   costs nothing. This is the wallet DeHub itself signs with on Solana.
 * - **Linked.** A Phantom user's own Solana wallet, connected in
 *   Settings → Assets and stored on the account. Phantom sessions sign in with
 *   an external wallet and so have no DeHub key to derive from — in practice
 *   the two are mutually exclusive rather than competing.
 *
 * Neither exists for an external EVM wallet (MetaMask, Rabby) that has not
 * linked Phantom, which is why `solana` is nullable and every caller has to
 * handle its absence rather than assume a second row.
 */
import { useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { WALLET_LOCK_CHANGED_EVENT } from '@/lib/smart-wallet';
import {
  getCachedSolanaAddress,
  SOLANA_ADDRESS_CHANGED_EVENT,
} from '@/lib/solana/address-cache';

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SOLANA_ADDRESS_CHANGED_EVENT, onChange);
  // An unlock derives the address, a lock/profile switch can invalidate it.
  window.addEventListener(WALLET_LOCK_CHANGED_EVENT, onChange);
  // Another tab unlocking the same wallet writes the same cache.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(SOLANA_ADDRESS_CHANGED_EVENT, onChange);
    window.removeEventListener(WALLET_LOCK_CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// Snapshot is a string (or null), so React's identity check compares by value
// and a re-read that finds the same address does not re-render.
const serverSnapshot = () => null;

export interface WalletAddresses {
  /** The `0x…` address, good on Base, BNB and Ethereum. */
  evm: string | null;
  /** The base58 Solana address, or null when this account has none. */
  solana: string | null;
  /** True when the Solana address is a linked Phantom wallet, not DeHub's own. */
  solanaIsExternal: boolean;
  /** True when there is a real choice to offer. */
  hasChoice: boolean;
}

export function useWalletAddresses(): WalletAddresses {
  const { user, walletAddress } = useAuth();
  const derived = useSyncExternalStore(subscribe, getCachedSolanaAddress, serverSnapshot);

  const linked = user?.solanaAddress ?? null;
  const solana = derived ?? linked;

  return {
    evm: walletAddress ?? null,
    solana,
    solanaIsExternal: !derived && !!linked,
    hasChoice: !!walletAddress && !!solana,
  };
}

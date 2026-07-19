/**
 * Phantom / Solana wallet helpers for Solana minting & SPL token-gating.
 */

// Type-only: keeps the ~350 kB @solana/web3.js runtime out of every chunk
// that imports these helpers (the post composer path). Address validation
// below uses a dependency-free base58 decode instead of `new PublicKey()`.
import type { PublicKey } from '@solana/web3.js';

export interface SolanaWalletProvider {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: PublicKey | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signTransaction: (transaction: import('@solana/web3.js').Transaction) => Promise<import('@solana/web3.js').Transaction>;
}

declare global {
  interface Window {
    phantom?: { solana?: SolanaWalletProvider };
    solana?: SolanaWalletProvider;
  }
}

export function getSolanaProvider(): SolanaWalletProvider | null {
  if (typeof window === 'undefined') return null;
  const provider = window.phantom?.solana ?? window.solana ?? null;
  if (!provider?.isPhantom && !provider?.publicKey && !provider?.connect) return null;
  return provider;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * A Solana address is base58 text that decodes to exactly 32 bytes — the same
 * check `new PublicKey()` performs, minus the web3.js dependency.
 */
export function isValidSolanaAddress(address: string): boolean {
  const trimmed = address.trim();
  if (trimmed.length < 32 || trimmed.length > 44) return false;

  const bytes: number[] = [];
  for (const char of trimmed) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value === -1) return false;
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading '1' characters encode leading zero bytes
  let leadingZeros = 0;
  for (const char of trimmed) {
    if (char !== '1') break;
    leadingZeros++;
  }
  return leadingZeros + bytes.length === 32;
}

export async function connectSolanaWallet(): Promise<string> {
  const provider = getSolanaProvider();
  if (!provider) {
    throw new Error('Phantom wallet not found. Install Phantom or open this page in the Phantom browser.');
  }

  try {
    const resp = await provider.connect();
    const pubkey = resp.publicKey?.toBase58() ?? provider.publicKey?.toBase58();
    if (!pubkey) throw new Error('Could not read Solana wallet address');
    return pubkey;
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4001) throw new Error('Solana wallet connection was rejected');
    throw err instanceof Error ? err : new Error('Failed to connect Solana wallet');
  }
}

export async function getConnectedSolanaAddress(): Promise<string | null> {
  const provider = getSolanaProvider();
  if (!provider) return null;
  try {
    if (provider.publicKey) return provider.publicKey.toBase58();
    const resp = await provider.connect({ onlyIfTrusted: true });
    return resp.publicKey?.toBase58() ?? null;
  } catch {
    return null;
  }
}

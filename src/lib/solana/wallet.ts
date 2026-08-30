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
  /** Phantom's arbitrary-message signing. Returns a raw 64-byte Ed25519 signature. */
  signMessage?: (
    message: Uint8Array,
    display?: 'utf8' | 'hex',
  ) => Promise<{ signature: Uint8Array; publicKey?: PublicKey }>;
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

/**
 * base58, the encoding side — the mirror of the decode above and written the
 * same way for the same reason: this runs on the login path, and pulling in
 * @solana/web3.js there would put 350 kB in front of the sign-in sheet to
 * encode 64 bytes.
 */
function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  // Every leading zero byte encodes as a literal '1' and is invisible to the
  // arithmetic above, so it has to be counted separately.
  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros++;

  let out = '1'.repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]];
  return out;
}

export interface SolanaLoginProof {
  address: string;
  signature: string;
}

/**
 * Ask Phantom to countersign the DeHub login message with its Solana key.
 *
 * Why the login carries this at all: Phantom signs in through its Ethereum
 * provider, and that EVM address is a by-product most Phantom users have never
 * touched — no balance, no nonce, nothing on any chain. The backend's anti-bot
 * signup gate judged people by it and turned every one of them away. Signing
 * the SAME message with the Solana key lets the gate look at the half of the
 * wallet that has actually been used, and hands the account a verified Solana
 * address in the process — which is what makes the creator payable on Solana.
 *
 * Returns null rather than throwing on every failure path. This is additive:
 * a user who dismisses the second prompt, or whose Phantom build predates
 * `signMessage`, must still complete a perfectly ordinary EVM login.
 */
export async function signSolanaLoginProof(message: string): Promise<SolanaLoginProof | null> {
  const provider = getSolanaProvider();
  if (!provider?.signMessage) return null;

  try {
    const address = await connectSolanaWallet();
    const encoded = new TextEncoder().encode(message);
    const { signature } = await provider.signMessage(encoded, 'utf8');
    if (!signature || signature.length !== 64) return null;
    return { address, signature: base58Encode(signature) };
  } catch (err) {
    // Includes the user declining (4001). Not an error worth a toast — the
    // EVM signature they already gave is what actually logs them in.
    console.warn('[Solana] login proof unavailable:', err);
    return null;
  }
}

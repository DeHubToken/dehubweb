/**
 * The DeHub wallet's own Solana address.
 * =====================================
 * Every DeHub smart wallet has a Solana wallet, derived from the same private
 * key rather than generated. Same key in, same address out, on every device and
 * in both apps — so it inherits the EVM wallet's recovery story instead of
 * needing one of its own: the key is restored from the encrypted seed in
 * `user_wallets`, and this falls straight out of it.
 *
 * This is a port of dehub-mobile's `libs/solana-seed.ts` + `libs/solana-derive.ts`
 * and MUST agree with it byte for byte — the same person opening the web app and
 * the phone has to be shown one address. `__tests__/derive.test.ts` pins that
 * with vectors generated from the mobile implementation.
 *
 * It is deliberately not the BIP44 `m/44'/501'/0'/0'` path Phantom uses: the
 * mnemonic is not held in memory, only the derived EVM private key is, so the
 * recovery phrase alone will not reproduce this address inside Phantom. The
 * wallet is reachable through DeHub sign-in, the same way the EVM wallet is.
 *
 * @noble rather than @solana/web3.js on purpose. `Keypair.fromSeed` is standard
 * ed25519 — `ed25519.getPublicKey(seed)` returns the identical 32 bytes — and
 * this module hangs off the wallet unlock path, where web3.js would put ~350 kB
 * behind every sign-in.
 */
import { hkdf } from '@noble/hashes/hkdf';
import { sha512 } from '@noble/hashes/sha2';
import { ed25519 } from '@noble/curves/ed25519';
import { base58Encode } from './base58';
import { writeCachedSolanaAddress } from './address-cache';

// Changing either constant changes every user's Solana address, stranding
// whatever is at the old one. They must not move, and they must stay identical
// to dehub-mobile's copy.
const SOLANA_HKDF_INFO = 'DeHub Solana ed25519 v1';
const SOLANA_HKDF_SALT = 'DeHub Solana derivation salt v1';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * 32-byte ed25519 seed for the Solana wallet belonging to an EVM private key.
 *
 * HKDF-SHA512 with a fixed info string domain-separates this from every other
 * use of the same key, and its 32-byte output is exactly the seed ed25519
 * expects.
 */
export function deriveSolanaSeed(evmPrivateKey: string): Uint8Array {
  const clean = evmPrivateKey.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error('Cannot derive Solana wallet: malformed EVM private key');
  }
  return hkdf(
    sha512,
    hexToBytes(clean),
    utf8(SOLANA_HKDF_SALT),
    utf8(SOLANA_HKDF_INFO),
    32,
  );
}

/** Base58 Solana address for a wallet, derived from its EVM private key. */
export function deriveSolanaAddress(evmPrivateKey: string): string {
  return base58Encode(ed25519.getPublicKey(deriveSolanaSeed(evmPrivateKey)));
}

/**
 * Derive and remember this wallet's Solana address.
 *
 * Called from the two places a plaintext key exists — unlock and vault restore
 * — so that afterwards merely SHOWING the address costs nothing. Deriving on
 * demand would mean a locked wallet has to ask for a password before it can
 * display a public value, which is not a trade worth making for a "copy my
 * address" button.
 */
export function cacheSolanaAddress(evmPrivateKey: string, evmAddress: string): string | null {
  try {
    const address = deriveSolanaAddress(evmPrivateKey);
    writeCachedSolanaAddress(evmAddress, address);
    return address;
  } catch {
    return null;
  }
}

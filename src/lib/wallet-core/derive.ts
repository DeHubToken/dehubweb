// Derives the ETH keypair from a BIP-39 mnemonic (or a raw private key).
//
// Ported from the Pixcellor wallet system, EVM-only: DeHub runs on
// Base/BNB/ETH so Solana derivation was dropped. Uses ethers v6's built-in
// HD wallet (no bip39/Buffer polyfill needed in the Vite bundle).
import { HDNodeWallet, Mnemonic, Wallet, randomBytes } from "ethers";

export const ETH_PATH = "m/44'/60'/0'/0/0";

export interface DerivedWallet {
  /** The secret the wallet was derived from: a mnemonic phrase or 0x private key. */
  secret: string;
  ethAddress: string;
  ethPrivateKey: string; // 0x-prefixed hex
}

export function generateMnemonic12(): string {
  // 128 bits of entropy → 12 words
  return Mnemonic.fromEntropy(randomBytes(16)).phrase;
}

export function isValidMnemonic(phrase: string): boolean {
  return Mnemonic.isValidMnemonic(phrase.trim().toLowerCase());
}

/** Raw 32-byte hex private key, with or without 0x prefix. */
export function isRawPrivateKey(secret: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(secret.trim());
}

/**
 * Derive the ETH account from a stored wallet secret. Accepts either a
 * BIP-39 mnemonic (normal path) or a raw hex private key (migration path for
 * keys exported from the old Web3Auth wallets).
 */
export function deriveFromSecret(rawSecret: string): DerivedWallet {
  const trimmed = rawSecret.trim();

  if (isRawPrivateKey(trimmed)) {
    const pk = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
    const wallet = new Wallet(pk);
    return { secret: pk, ethAddress: wallet.address, ethPrivateKey: wallet.privateKey };
  }

  const mnemonic = trimmed.toLowerCase();
  if (!Mnemonic.isValidMnemonic(mnemonic)) {
    throw new Error("Invalid recovery phrase");
  }
  const hd = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), ETH_PATH);
  return { secret: mnemonic, ethAddress: hd.address, ethPrivateKey: hd.privateKey };
}

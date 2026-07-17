/**
 * Phantom / Solana wallet helpers for Solana minting & SPL token-gating.
 */

import { PublicKey } from '@solana/web3.js';

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

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address.trim());
    return true;
  } catch {
    return false;
  }
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

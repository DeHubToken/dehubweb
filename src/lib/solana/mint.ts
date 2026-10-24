/**
 * Solana SPL mint broadcast — signs partially-signed tx from backend as fee payer.
 */

// Type-only: the @solana/web3.js runtime (~350 kB raw) loads dynamically
// inside broadcastSolanaMint so it never rides in eager chunks — minting a
// Solana post is a rare user action.
import type { Transaction } from '@solana/web3.js';
import { connectSolanaWallet, getSolanaProvider } from './wallet';
import { confirmSolanaMint } from '@/lib/api/dehub/solana';
import { SOLANA_MAINNET_CHAIN_ID } from '@/lib/chains/constants';
import { translateCopy as _translateCopy } from '@/i18n/copy';

// Public mainnet-beta RPC forbids browser sendTransaction (403). Use a
// broadcast-friendly RPC; override via VITE_SOLANA_MAINNET_RPC (e.g. Alchemy/Helius).
const SOLANA_RPC =
  (import.meta.env.VITE_SOLANA_MAINNET_RPC as string) || 'https://solana-rpc.publicnode.com';

export interface SolanaMintParams {
  transactionBase64: string;
  mintAddress: string;
  tokenId: number | string;
  chainId?: number;
  /** Pre-connected wallet; if omitted, connects Phantom */
  walletAddress?: string;
}

export interface SolanaMintResult {
  signature: string;
  mintAddress: string;
  /** Set when on-chain tx succeeded but POST /solana/confirm-mint failed */
  confirmWarning?: string;
}

/**
 * Sign (fee payer) and broadcast a partially-signed Solana mint transaction,
 * then notify the backend via POST /solana/confirm-mint.
 */
export async function broadcastSolanaMint(params: SolanaMintParams): Promise<SolanaMintResult> {
  const provider = getSolanaProvider();
  if (!provider) {
    throw new Error(_translateCopy('copy.edf7a2e01496', { defaultValue: 'Phantom wallet required for Solana posts. Please install Phantom.' }));
  }

  const { Connection, Transaction } = await import('@solana/web3.js');

  const walletAddress = params.walletAddress ?? await connectSolanaWallet();
  const chainId = params.chainId ?? SOLANA_MAINNET_CHAIN_ID;
  // Devnet fallback for testing
  const rpc = chainId === 103 ? 'https://api.devnet.solana.com' : SOLANA_RPC;
  const connection = new Connection(rpc, 'confirmed');

  let tx: Transaction;
  try {
    const raw = Uint8Array.from(atob(params.transactionBase64), (c) => c.charCodeAt(0));
    tx = Transaction.from(raw);
  } catch {
    throw new Error(_translateCopy('copy.1666243e94f1', { defaultValue: 'Invalid mint transaction from server. Please try again.' }));
  }

  let signed: Transaction;
  try {
    signed = await provider.signTransaction(tx);
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4001) throw new Error(_translateCopy('copy.3f035aa59f46', { defaultValue: 'Transaction signing was rejected' }));
    throw new Error(err instanceof Error ? err.message : _translateCopy('copy.b397b6d54c82', { defaultValue: 'Failed to sign Solana transaction' }));
  }

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    if (lower.includes('insufficient')) {
      throw new Error(_translateCopy('copy.83ff243820f8', { defaultValue: 'Insufficient SOL for transaction fees. Add SOL to your Phantom wallet.' }));
    }
    if (lower.includes('blockhash') || lower.includes('expired') || lower.includes('timeout')) {
      throw new Error(_translateCopy('copy.10f35f8e47ce', { defaultValue: 'Solana transaction expired. Please try posting again.' }));
    }
    throw new Error(_translateCopy('copy.51386f3a6a6a', { defaultValue: 'Solana broadcast failed: {{value1}}', value1: msg }));
  }

  try {
    await connection.confirmTransaction(signature, 'confirmed');
  } catch (err) {
    console.warn('[Solana] Confirmation polling failed, tx may still land:', err);
  }

  try {
    await confirmSolanaMint({
      tokenId: Number(params.tokenId),
      mintAddress: params.mintAddress,
      txSignature: signature,
    });
  } catch (err) {
    console.error('[Solana] confirm-mint API failed:', err);
    return {
      signature,
      mintAddress: params.mintAddress,
      confirmWarning:
        _translateCopy('copy.218e3819eee0', { defaultValue: 'Posted on-chain but server sync is delayed. Your post may take a few minutes to appear in the feed.' }),
    };
  }

  return { signature, mintAddress: params.mintAddress };
}

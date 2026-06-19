/**
 * Solana SPL mint broadcast — signs partially-signed tx from backend as fee payer.
 */

import { Connection, Transaction } from '@solana/web3.js';
import { connectSolanaWallet, getSolanaProvider } from './wallet';
import { confirmSolanaMint } from '@/lib/api/dehub/solana';
import { SOLANA_MAINNET_CHAIN_ID } from '@/lib/chains/constants';

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

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

function getConnection(chainId: number): Connection {
  // Devnet fallback for testing
  const rpc = chainId === 103 ? 'https://api.devnet.solana.com' : SOLANA_RPC;
  return new Connection(rpc, 'confirmed');
}

/**
 * Sign (fee payer) and broadcast a partially-signed Solana mint transaction,
 * then notify the backend via POST /solana/confirm-mint.
 */
export async function broadcastSolanaMint(params: SolanaMintParams): Promise<SolanaMintResult> {
  const provider = getSolanaProvider();
  if (!provider) {
    throw new Error('Phantom wallet required for Solana posts. Please install Phantom.');
  }

  const walletAddress = params.walletAddress ?? await connectSolanaWallet();
  const chainId = params.chainId ?? SOLANA_MAINNET_CHAIN_ID;
  const connection = getConnection(chainId);

  let tx: Transaction;
  try {
    const raw = Uint8Array.from(atob(params.transactionBase64), (c) => c.charCodeAt(0));
    tx = Transaction.from(raw);
  } catch {
    throw new Error('Invalid mint transaction from server. Please try again.');
  }

  let signed: Transaction;
  try {
    signed = await provider.signTransaction(tx);
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4001) throw new Error('Transaction signing was rejected');
    throw new Error(err instanceof Error ? err.message : 'Failed to sign Solana transaction');
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
      throw new Error('Insufficient SOL for transaction fees. Add SOL to your Phantom wallet.');
    }
    if (lower.includes('blockhash') || lower.includes('expired') || lower.includes('timeout')) {
      throw new Error('Solana transaction expired. Please try posting again.');
    }
    throw new Error(`Solana broadcast failed: ${msg}`);
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
        'Posted on-chain but server sync is delayed. Your post may take a few minutes to appear in the feed.',
    };
  }

  return { signature, mintAddress: params.mintAddress };
}

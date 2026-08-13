/**
 * Solana payments — PPV unlocks and tips paid in SOL / SPL tokens.
 *
 * Mirrors the mint flow in ./mint.ts and the mobile client's
 * services/solana-payment.service.ts: the backend builds an unsigned transfer,
 * Phantom signs it as payer, the client broadcasts, then the backend verifies
 * the transfer on-chain and records the unlock or tip.
 *
 * Without this, a Solana post's PPV could not be paid on web at all —
 * use-ppv-payment's EVM path calls getChainConfig(101), which throws
 * "Unsupported chain ID".
 */

// Type-only: the @solana/web3.js runtime (~350 kB raw) loads dynamically
// inside sendSolanaPayment so it stays out of eager chunks — the PPV drawer is
// rendered by every feed card.
import type { Transaction } from '@solana/web3.js';
import { connectSolanaWallet, getSolanaProvider } from './wallet';
import { buildSolanaPayment, confirmSolanaPayment, type SolanaPaymentKind } from '@/lib/api/dehub/solana';
import { SOLANA_MAINNET_CHAIN_ID, SOLANA_DEVNET_CHAIN_ID } from '@/lib/chains/constants';

// Public mainnet-beta RPC forbids browser sendTransaction (403). Same
// broadcast-friendly default and override as ./mint.ts.
const SOLANA_RPC =
  (import.meta.env.VITE_SOLANA_MAINNET_RPC as string) || 'https://solana-rpc.publicnode.com';

export interface SolanaPaymentParams {
  tokenId: number | string;
  kind: SolanaPaymentKind;
  /** Tips only — PPV amounts are resolved by the backend from the post. */
  amount?: number;
  /** SPL mint address; omitted means native SOL. */
  mint?: string;
  recipient?: string;
  chainId?: number;
}

export interface SolanaPaymentResult {
  signature: string;
  recipient: string;
  mintAddress: string;
  amount: number;
}

export async function sendSolanaPayment(
  params: SolanaPaymentParams,
): Promise<SolanaPaymentResult> {
  const provider = getSolanaProvider();
  if (!provider) {
    throw new Error(
      'Phantom wallet required to pay on Solana. Install Phantom or open this page in the Phantom browser.',
    );
  }

  const chainId = params.chainId ?? SOLANA_MAINNET_CHAIN_ID;
  const payerWallet = await connectSolanaWallet();

  // 1. Backend builds the unsigned transfer.
  const build = await buildSolanaPayment({
    tokenId: Number(params.tokenId),
    kind: params.kind,
    payerWallet,
    amount: params.amount,
    mint: params.mint,
    recipient: params.recipient,
    chainId,
  });

  if (!build?.transaction) {
    throw new Error('Could not prepare the Solana payment. Please try again.');
  }

  const { Connection, Transaction: SolTransaction } = await import('@solana/web3.js');
  const rpc = chainId === SOLANA_DEVNET_CHAIN_ID ? 'https://api.devnet.solana.com' : SOLANA_RPC;
  const connection = new Connection(rpc, 'confirmed');

  let tx: Transaction;
  try {
    const raw = Uint8Array.from(atob(build.transaction), (c) => c.charCodeAt(0));
    tx = SolTransaction.from(raw);
  } catch {
    throw new Error('Invalid payment transaction from server. Please try again.');
  }

  // 2. Sign as payer + broadcast.
  let signed: Transaction;
  try {
    signed = await provider.signTransaction(tx);
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4001) throw new Error('Payment was rejected');
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
    // 0x1 is the SPL transfer program's insufficient-funds custom error.
    if (lower.includes('insufficient') || lower.includes('0x1')) {
      throw new Error('Insufficient balance — check the token amount and your SOL for fees.');
    }
    if (lower.includes('blockhash') || lower.includes('expired') || lower.includes('timeout')) {
      throw new Error('Solana transaction expired. Please try again.');
    }
    throw new Error(`Solana payment failed: ${msg}`);
  }

  try {
    await connection.confirmTransaction(signature, 'confirmed');
  } catch (err) {
    console.warn('[Solana] payment confirmation polling failed, tx may still land:', err);
  }

  // 3. Backend verifies + records. The money has already moved by this point,
  // so a failure here is a sync delay, not a failed payment.
  try {
    await confirmSolanaPayment({
      tokenId: Number(params.tokenId),
      kind: params.kind,
      txSignature: signature,
      payerWallet,
      recipient: build.recipient,
      mintAddress: build.mintAddress,
      amount: build.amount,
      decimals: build.decimals,
      chainId,
    });
  } catch (err) {
    console.warn('[Solana] confirm-payment failed (tx already sent):', err);
  }

  return {
    signature,
    recipient: build.recipient,
    mintAddress: build.mintAddress,
    amount: build.amount,
  };
}

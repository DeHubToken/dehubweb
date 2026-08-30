import { DEHUB_API_BASE, apiCall, getAuthToken } from './core';

export interface SolanaMintStatus {
  chainsConfigured: number[];
  mintingEnabled: boolean;
  message: string;
  /** The sponsor wallet that pays mint and account rent. Public key, not a secret. */
  signerAddress?: string | null;
  /**
   * What that wallet actually holds. `mintingEnabled` used to be true whenever
   * a signer key was merely configured, so a sponsor with no SOL reported
   * "minting is active" while every mint died at broadcast.
   */
  signerBalanceSol?: number | null;
}

export async function getSolanaStatus(): Promise<SolanaMintStatus> {
  return apiCall<SolanaMintStatus>('/api/solana/status');
}

/**
 * Attach a Solana account to the signed-in DeHub account.
 *
 * `signature` must be the DeHub login message for this account's EVM address,
 * signed by the Solana key — proving control, and binding the link to this
 * account rather than any other. The server re-derives the message from
 * `timestamp`, so all three have to describe the same moment.
 */
export async function linkSolanaWallet(params: {
  solanaAddress: string;
  signature: string;
  timestamp: number;
}): Promise<{ success: boolean; solanaAddress: string }> {
  return apiCall('/api/solana/link', { method: 'POST', body: params });
}

/** Drop the Solana address. No proof needed — it only ever costs the person doing it. */
export async function unlinkSolanaWallet(): Promise<{ success: boolean }> {
  return apiCall('/api/solana/unlink', { method: 'POST', body: {} });
}

export async function confirmSolanaMint(params: {
  tokenId: number;
  mintAddress: string;
  txSignature: string;
}): Promise<{ success: boolean; tokenId: number; mintAddress: string }> {
  return apiCall('/api/solana/confirm-mint', {
    method: 'POST',
    body: params,
  });
}

export type SolanaPaymentKind = 'ppv' | 'tip';

export interface SolanaPaymentBuild {
  /** Base64 unsigned transfer transaction for the payer to sign. */
  transaction: string;
  recipient: string;
  mintAddress: string;
  amount: number;
  decimals: number;
  chainId: number;
}

/**
 * POST /api/solana/build-payment — the backend resolves amount and mint (from
 * the post, for `ppv`) and returns an unsigned transfer transaction.
 */
export async function buildSolanaPayment(params: {
  tokenId: number;
  kind: SolanaPaymentKind;
  payerWallet: string;
  amount?: number;
  mint?: string;
  recipient?: string;
  chainId: number;
}): Promise<SolanaPaymentBuild> {
  return apiCall('/api/solana/build-payment', {
    method: 'POST',
    body: params,
  });
}

/** POST /api/solana/confirm-payment — backend verifies the transfer and records it. */
export async function confirmSolanaPayment(params: {
  tokenId: number;
  kind: SolanaPaymentKind;
  txSignature: string;
  payerWallet: string;
  recipient: string;
  mintAddress: string;
  amount: number;
  decimals: number;
  chainId: number;
}): Promise<{ success: boolean }> {
  return apiCall('/api/solana/confirm-payment', {
    method: 'POST',
    body: params,
  });
}

export async function confirmEvmMint(params: {
  tokenId: number | string;
  txHash: string;
  chainId: number;
}): Promise<{ result: boolean }> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetch(`${DEHUB_API_BASE}/api/confirm-mint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tokenId: Number(params.tokenId),
      txHash: params.txHash,
      chainId: params.chainId,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || data.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

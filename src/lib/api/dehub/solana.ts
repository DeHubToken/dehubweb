import { DEHUB_API_BASE, apiCall, getAuthToken } from './core';

export interface SolanaMintStatus {
  chainsConfigured: number[];
  mintingEnabled: boolean;
  message: string;
}

export async function getSolanaStatus(): Promise<SolanaMintStatus> {
  return apiCall<SolanaMintStatus>('/api/solana/status');
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

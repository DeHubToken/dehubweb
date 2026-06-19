import { DEHUB_API_BASE, apiCall, getAuthToken } from './core';

export interface SolanaMintStatus {
  chainsConfigured: number[];
  mintingEnabled: boolean;
  message: string;
}

export async function getSolanaStatus(): Promise<SolanaMintStatus> {
  return apiCall<SolanaMintStatus>('/solana/status');
}

export async function confirmSolanaMint(params: {
  tokenId: number;
  mintAddress: string;
  txSignature: string;
}): Promise<{ success: boolean; tokenId: number; mintAddress: string }> {
  return apiCall('/solana/confirm-mint', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function confirmEvmMint(params: {
  tokenId: number | string;
  txHash: string;
  chainId: number;
}): Promise<{ result: boolean }> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const res = await fetch(`${DEHUB_API_BASE}/nft/confirm-mint`, {
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

import { apiCall, authedUpload } from './core';
import type { DeHubNFT } from './types';

export interface StreamInfo {
  isLockContent?: boolean;
  lockContentContractAddress?: string;
  lockContentTokenSymbol?: string;
  lockContentAmount?: number;
  lockContentChainIds?: number[];
  isPayPerView?: boolean;
  payPerViewContractAddress?: string;
  payPerViewTokenSymbol?: string;
  payPerViewAmount?: number;
  payPerViewChainIds?: number[];
  isAddBounty?: boolean;
  addBountyTokenSymbol?: string;
  addBountyFirstXViewers?: number;
  addBountyFirstXComments?: number;
  addBountyAmount?: number;
  addBountyChainId?: number;
}

export interface MintPostParams {
  name: string;
  description: string;
  postType: 'video' | 'feed-images' | 'feed-simple' | 'live' | 'audio';
  chainId: number;
  category: string[];
  streamInfo?: StreamInfo;
  plans?: string[];
  files?: File[];
  thumbnail?: Blob;
  minterAddress: string;
}

export interface MintResponse {
  createdTokenId: string;
  chainId?: number;
  /** EVM mint signature fields */
  r?: string;
  s?: string;
  v?: number;
  timestamp?: number;
  /** Solana mint fields */
  isSolana?: boolean;
  transaction?: string;
  mintAddress?: string;
  scheduled?: boolean;
  scheduledAt?: string;
}

export async function mintPost(
  params: MintPostParams,
  onProgress?: (percent: number) => void
): Promise<MintResponse> {
  // No token snapshot and no early bail here: authedUpload() below refreshes a
  // stale token before sending and replays once on a 401. Reading the token at
  // this point instead meant a session that expired while the user was
  // composing produced "Mint failed (HTTP 401)" with no way to recover short
  // of signing out and back in.
  const formData = new FormData();
  formData.append('name', params.name);
  formData.append('description', params.description);
  formData.append('postType', params.postType);
  formData.append('chainId', String(params.chainId));
  formData.append('category', JSON.stringify(params.category));

  formData.append('minter', params.minterAddress);
  console.log('[MintPost] Including minter address:', params.minterAddress);

  const streamInfo: StreamInfo = params.streamInfo || {
    isLockContent: false,
    isPayPerView: false,
    isAddBounty: false,
  };
  formData.append('streamInfo', JSON.stringify(streamInfo));

  if (params.plans && params.plans.length > 0) {
    formData.append('plans', JSON.stringify(params.plans));
  }

  if (params.files && params.files.length > 0) {
    params.files.forEach((file) => {
      formData.append('file', file);
    });
  }

  if (params.thumbnail) {
    formData.append('file', params.thumbnail, 'thumbnail.jpg');
  }

  return authedUpload<MintResponse>('/api/user_mint', formData, {
    onProgress,
    // 8-minute timeout for large video files on slow mobile connections
    timeoutMs: 8 * 60 * 1000,
    unwrapResult: true,
  });
}

// Simple mintNFT wrapper
export async function mintNFT(data: {
  title: string;
  description?: string;
  media_url: string;
  thumbnail_url?: string;
  media_type: "video" | "image" | "audio";
  category?: string;
  tags?: string[];
  is_ppv?: boolean;
  ppv_price?: number;
}): Promise<DeHubNFT> {
  return apiCall<DeHubNFT>("/api/user_mint", {
    method: "POST",
    body: data,
    requiresAuth: true,
  });
}

// Edit & Delete

export interface EditPostParams {
  name?: string;
  description?: string;
  category?: string[];
}

export interface EditPostResponse {
  result: boolean;
  data?: {
    tokenId: number;
    name?: string;
    description?: string;
    category?: string[];
  };
}

export async function editPost(
  tokenId: number | string,
  params: EditPostParams
): Promise<EditPostResponse> {
  return apiCall<EditPostResponse>(`/api/nft/${tokenId}`, {
    method: "PATCH",
    body: params as Record<string, unknown>,
    requiresAuth: true,
  });
}

export async function deletePost(tokenId: number | string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/nft/${tokenId}`, {
    method: "DELETE",
    requiresAuth: true,
  });
}

// Token visibility

export type TokenVisibility = 'public' | 'private' | 'unlisted';

export interface TokenVisibilityResponse {
  status: boolean;
  message?: string;
  result?: {
    tokenId: number;
    visibility: TokenVisibility;
  };
}

export async function updateTokenVisibility(
  tokenId: number | string,
  visibility: TokenVisibility
): Promise<TokenVisibilityResponse> {
  const visibilityToStatus: Record<TokenVisibility, number> = {
    'public': 0,
    'private': 1,
    'unlisted': 2,
  };

  // Routed through apiCall (was a hand-rolled fetch with a snapshotted token)
  // so an expired session refreshes and retries instead of surfacing a raw
  // "Failed to update visibility: 401".
  return apiCall<TokenVisibilityResponse>('/api/token_visibility', {
    method: 'POST',
    requiresAuth: true,
    body: {
      tokenId: Number(tokenId),
      status: visibilityToStatus[visibility],
    },
  });
}

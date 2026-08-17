import { apiCall, authedUpload } from './core';

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
  postType: 'video' | 'feed-images' | 'feed-simple' | 'live' | 'feed-audio';
  chainId: number;
  category: string[];
  streamInfo?: StreamInfo;
  plans?: string[];
  files?: File[];
  thumbnail?: Blob;
  minterAddress: string;
  /**
   * Publish without minting on-chain. The post lands in feeds as soon as this
   * call returns and the client skips the contract step entirely.
   */
  mintOptOut?: boolean;
  /**
   * ISO date. A future date parks the token at status 'scheduled' — the server
   * answers `scheduled: true` and the cron publishes it later; the client must
   * then skip the chain step. A past date is ignored and the post goes out now.
   */
  scheduledAt?: string;
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

  if (params.mintOptOut) {
    formData.append('mintOptOut', 'true');
  }

  if (params.scheduledAt) {
    formData.append('scheduledAt', params.scheduledAt);
  }

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

export interface MintFeeQuoteResponse {
  chainId: number;
  amount: number;
  symbol: string;
  tokenAddress: string;
  recipient?: string;
  chargeable: boolean;
  decimals: number;
  isNative: boolean;
  ttlSeconds: number;
}

/**
 * What minting one post costs on `chainId`, in the token it is paid in.
 *
 * Quoted server-side and never computed here: the fee tracks live gas, and a
 * second cost table in the client would be wrong within the hour. Returns null
 * rather than throwing when the chain is not priced or the quote fails, since
 * a missing quote must degrade to "mint without charging", not to a blocked
 * post.
 */
export async function getMintFee(chainId: number): Promise<MintFeeQuoteResponse | null> {
  try {
    const res = await apiCall<any>('/api/mint_fee', { params: { chainId } });
    return res && typeof res.amount === 'number' ? (res as MintFeeQuoteResponse) : null;
  } catch (err) {
    console.warn('[MintFee] Could not price a mint:', err);
    return null;
  }
}

/**
 * Ask for a fresh mint signature for a post that was published off-chain.
 *
 * The post already has its token ID, so this returns the same shape as
 * mintPost's signature fields and feeds straight into mintOnChain.
 */
export async function mintExistingPost(tokenId: number | string): Promise<MintResponse> {
  return apiCall<MintResponse>('/api/mint_existing', {
    method: 'POST',
    body: { tokenId: Number(tokenId) },
    requiresAuth: true,
  });
}

// Edit & Delete

export interface EditPostParams {
  name?: string;
  description?: string;
  category?: string[];
  /** true turns replies off. Existing comments are kept and stay readable —
   *  only new ones are refused — so re-enabling restores the thread intact. */
  commentsDisabled?: boolean;
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
  // The server's whole model is one boolean: the handler reads `{ id,
  // isHidden }` and 400s anything else — the old `{ tokenId, status: 0|1|2 }`
  // body never succeeded once. 'unlisted' has no server-side meaning either;
  // it hides the post.
  //
  // Routed through apiCall (was a hand-rolled fetch with a snapshotted token)
  // so an expired session refreshes and retries instead of surfacing a raw
  // "Failed to update visibility: 401".
  return apiCall<TokenVisibilityResponse>('/api/token_visibility', {
    method: 'POST',
    requiresAuth: true,
    body: {
      id: Number(tokenId),
      isHidden: visibility !== 'public',
    },
  });
}

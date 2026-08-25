import { apiCall, authedUpload } from './core';
import type { ContentRating } from './types';

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
  /**
   * Makes this call safe to repeat. Send the same key for every attempt at ONE
   * post and a different one per post: re-sending a key that already published
   * returns that post (`duplicate: true`) instead of publishing a second copy.
   * Without it the server has no way to tell a retry from a new post.
   */
  idempotencyKey?: string;
  /**
   * 'mature' marks the post adult or graphic. It then reaches the creator's
   * followers, their profile and anyone with the link, but stays off the
   * public home, shorts, search and suggestion feeds — unless a viewer has
   * turned mature content on in their own settings. Omitted means safe.
   */
  contentRating?: ContentRating;
}

export interface MintResponse {
  createdTokenId: string;
  chainId?: number;
  /** EVM mint signature fields */
  r?: string;
  s?: string;
  v?: number;
  timestamp?: number;
  /**
   * The URI suffix to mint, carrying the post's text and its keccak hash as
   * query params so the words themselves are recorded on chain. Falls back
   * to the plain `{tokenId}.json` client-side when absent.
   */
  uri?: string;
  /** Solana mint fields */
  isSolana?: boolean;
  transaction?: string;
  mintAddress?: string;
  scheduled?: boolean;
  scheduledAt?: string;
  /**
   * This upload had already been published by an earlier send of the same
   * `idempotencyKey`; `createdTokenId` is that existing post, not a new one.
   */
  duplicate?: boolean;
  /**
   * Set alongside `duplicate` when the existing post is on-chain already.
   * There is no signature in the response — it cannot be minted twice — so
   * the chain step has to be skipped.
   */
  alreadyMinted?: boolean;
  /**
   * This post went past the daily free allowance and has been billed.
   *
   * Present only when there is something to pay. The post is already
   * published either way — this is the bill for it, and it stays open until
   * the DHB transfer is settled.
   */
  quota?: {
    chargeId: string;
    amountDhb: number;
    kind: "text" | "media";
    tier: string | null;
    recipient?: string | null;
  };
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

  if (params.idempotencyKey) {
    formData.append('idempotencyKey', params.idempotencyKey);
  }

  if (params.scheduledAt) {
    formData.append('scheduledAt', params.scheduledAt);
  }

  // Only sent when it is 'mature': the server treats an absent rating as safe
  // and deliberately stores nothing for it.
  if (params.contentRating === 'mature') {
    formData.append('contentRating', 'mature');
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

export interface NewPostResolution {
  tokenId: number;
  newPostId: number;
  /** True once the post minted — land on /app/post/<tokenId> instead. */
  minted: boolean;
}

/**
 * Resolve an off-chain post slug (dehub.io/newpost/<n>) to its post.
 *
 * The mapping survives minting, so links shared while the post was off-chain
 * keep working forever. Null on unknown slugs and on transport failure alike —
 * the caller shows not-found either way.
 */
export async function resolveNewPost(n: number | string): Promise<NewPostResolution | null> {
  try {
    const res = await apiCall<any>(`/api/newpost/${encodeURIComponent(String(n))}`);
    return res && typeof res.tokenId === 'number' ? (res as NewPostResolution) : null;
  } catch {
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
  /** Re-rate a published post. Refused with 403 once a moderator has rated it. */
  contentRating?: ContentRating;
}

export interface EditPostResponse {
  result: boolean;
  data?: {
    tokenId: number;
    name?: string;
    description?: string;
    category?: string[];
    contentRating?: ContentRating;
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

export interface ReplaceVideoResponse {
  result: boolean;
  data?: { tokenId: number; status: string; message?: string };
}

/**
 * Swap the file behind a post, keeping the post.
 *
 * The server writes the replacement to the same storage key, so the URL, the
 * views, the comments and every link already shared survive — which is the
 * whole point, and also why the old file can sit in a viewer's own browser
 * cache afterwards.
 *
 * Multipart, so it goes through authedUpload rather than apiCall: a video is
 * far too big to JSON-encode, and this is the path that reports progress and
 * survives a token expiring mid-upload.
 */
export async function replaceVideoFile(
  tokenId: number | string,
  video: File,
  options: { thumbnail?: File | null; onProgress?: (percent: number) => void } = {},
): Promise<ReplaceVideoResponse> {
  const formData = new FormData();
  // Field order is the contract: the server reads files[0] as the video and
  // files[1] as the optional poster frame, exactly as the mint path does.
  formData.append("video", video);
  if (options.thumbnail) formData.append("thumbnail", options.thumbnail);

  return authedUpload<ReplaceVideoResponse>(`/api/nft/${tokenId}/video`, formData, {
    onProgress: options.onProgress,
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

/**
 * Daily posting allowance
 * =======================
 * Everyone gets ten text posts and a gigabyte of media a day; a staking badge
 * buys more of both and a discount on whatever runs over. All of it is quoted
 * by the server — the ladder is a table on the backend and a second copy here
 * would be wrong the first time it moved.
 */
export interface PostQuotaStatus {
  /** UTC day the allowance resets on, `YYYY-MM-DD`. */
  day: string;
  /** Badge tier name, or null below the badge floor. */
  tier: string | null;
  badgeBalance: number;
  textPostsUsed: number;
  textPostsPerDay: number;
  mediaBytesUsed: number;
  mediaBytesPerDay: number;
  dhbPerTextPost: number;
  dhbPerGb: number;
  discountRate: number;
  /** DHB owed from posts already published. */
  outstandingDhb: number;
  /** True once that debt is old enough to block the next paid post. */
  blocked: boolean;
  recipient?: string;
  /** False when no treasury is configured — posting is free regardless of usage. */
  chargingEnabled: boolean;
  dhbTokens: { chainId: number; tokenAddress: string }[];
  dhbUsdPeg: number;
}

export interface PostQuotaCost {
  chargeable: boolean;
  kind: 'text' | 'media';
  amountDhb: number;
  chargedUnits: number;
  /** Text posts, or bytes, still free today. */
  remainingFree: number;
}

/** Today's allowance and what is left of it. Null on any failure — see below. */
export async function getPostQuota(): Promise<PostQuotaStatus | null> {
  try {
    const res = await apiCall<any>('/api/post_quota', { requiresAuth: true });
    return res && typeof res.textPostsPerDay === 'number' ? (res as PostQuotaStatus) : null;
  } catch (err) {
    console.warn('[PostQuota] Could not read the allowance:', err);
    return null;
  }
}

/**
 * What this specific post would cost, given what has been posted today.
 *
 * Null rather than throwing on failure, and every caller treats null as "post
 * it": the server checks the same thing again before storing anything, so a
 * quote that could not be fetched must not be what blocks a post.
 */
export async function quotePostCharge(
  postType: string,
  bytes: number,
): Promise<PostQuotaCost | null> {
  try {
    const res = await apiCall<any>('/api/post_quota/quote', {
      method: 'POST',
      requiresAuth: true,
      body: { postType, bytes },
    });
    return res && typeof res.amountDhb === 'number' ? (res as PostQuotaCost) : null;
  } catch (err) {
    console.warn('[PostQuota] Could not price this post:', err);
    return null;
  }
}

export interface PostQuotaSettlement {
  settled: boolean;
  /** The transfer has not been mined yet — call again in a moment. */
  pending?: boolean;
  appliedDhb: number;
  outstandingDhb: number;
}

/**
 * Hand the backend the DHB transfer that pays for an over-allowance post.
 *
 * Throws, unlike its neighbours: by the time this is called the creator's DHB
 * has already left their wallet, so a failure here is something they need to
 * be told about rather than something to swallow. Safe to repeat — the hash
 * is claimed once server-side.
 */
export async function settlePostCharge(
  txHash: string,
  chainId: number,
): Promise<PostQuotaSettlement> {
  return apiCall<PostQuotaSettlement>('/api/post_quota/settle', {
    method: 'POST',
    requiresAuth: true,
    body: { txHash, chainId },
  });
}

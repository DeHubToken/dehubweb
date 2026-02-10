// DeHub CDN base URL for media assets
export const DEHUB_CDN_BASE = "https://dehubcdn.ams3.cdn.digitaloceanspaces.com/";

// DeHub API base URL
const DEHUB_API_BASE = "https://api.dehub.io";

/**
 * Convert relative media paths to absolute CDN URLs
 * The DeHub API returns relative paths like "images/xxx.jpg"
 */
export function getMediaUrl(relativePath?: string): string | undefined {
  if (!relativePath) return undefined;
  // Already an absolute URL
  if (relativePath.startsWith("http://") || relativePath.startsWith("https://")) {
    return relativePath;
  }
  // Prepend CDN base URL
  return `${DEHUB_CDN_BASE}${relativePath}`;
}

// Types based on DeHub API response (supports both API field naming conventions)
export interface DeHubUser {
  // ID fields (API uses _id, normalized to id)
  _id?: string;
  id?: string;

  // Wallet (API uses address)
  address?: string;
  wallet_address?: string;

  // Profile fields (API uses camelCase)
  username?: string | null;
  displayName?: string | null;
  display_name?: string;
  bio?: string;
  aboutMe?: string | null;

  // Avatar/Cover (API uses *ImageUrl suffix)
  avatarImageUrl?: string | null;
  avatarUrl?: string;
  avatar_url?: string;
  coverImageUrl?: string | null;
  coverUrl?: string;
  cover_url?: string;

  // Verification
  isVerified?: boolean;
  is_verified?: boolean;

  // Stats (API can return arrays or numbers)
  followers?: number | string[];
  follower_count?: number;
  followings?: string[];
  followingsList?: string[];
  followersList?: string[];
  following_count?: number;
  likes?: number | number[];
  uploads?: number;
  post_count?: number;
  sentTips?: number;
  receivedTips?: number;
  unlocked?: number[];

  // Follow relationship (returned when address param is provided)
  isFollowing?: boolean;   // Viewer follows this user
  followsYou?: boolean;    // This user follows viewer
  isPending?: boolean;     // Follow request is pending (for private accounts)

  // Private account
  isPrivate?: boolean;     // Whether account is private (requires follow approval)

  // Balance data
  balanceData?: Array<{
    chainId: number;
    tokenAddress: string;
    walletBalance: number;
    staked: number;
  }>;

  // DM settings
  dmSettings?: {
    disables?: string[];
    minTipDhb?: number;
  };

  // Custom data
  customs?: Record<string, unknown>;
  seenModal?: boolean;
  online?: boolean;

  // Staking (can be returned directly or inside balanceData)
  staked?: number;

  // Timestamps
  createdAt?: string;
  created_at?: string;
  lastLoginTimestamp?: number;
}

// Auth response from DeHub API
export interface AuthResponse {
  status: boolean;
  token: string;
  user: DeHubUser;
  result: {
    address: string;
    isMobile: boolean;
    lastLoginTimestamp: number;
    tokenExpiry: string;
  };
  message: string;
}

// DeHub NFT interface matching actual API response
export interface DeHubNFT {
  // Core identifiers
  tokenId: number;
  id?: string;
  token_id?: string;

  // Content fields
  name: string;
  title?: string;
  description?: string;

  // Media URLs (relative paths from API)
  imageUrl: string;
  imageUrls?: string[];
  videoUrl?: string;
  media_url?: string;
  thumbnail_url?: string;

  // Content type
  postType: "video" | "image" | "audio";
  media_type?: "video" | "image" | "audio";

  // Creator info (API uses different field names)
  minter: string;
  mintername?: string;      // Older API format
  minterUsername?: string;  // Newer API format (preferred)
  minterDisplayName?: string;
  minterAvatarUrl?: string;
  creator?: DeHubUser;
  owner?: DeHubUser;

  // Stats
  views?: number;
  view_count?: number;
  commentCount?: number;
  comment_count?: number;
  totalVotes?: { for?: number; against?: number };
  likes?: number;       // Flat likes count (new API format)
  dislikes?: number;    // Flat dislikes count (new API format)
  like_count?: number;
  dislike_count?: number;

  // Video specific
  videoDuration?: number;
  duration?: number;

  // Metadata
  createdAt: string;
  created_at?: string;
  category?: string | string[];
  tags?: string[];

  // PPV/Live/Content Access
  is_live?: boolean;
  is_ppv?: boolean;
  ppv_price?: number;
  ppv_currency?: string;
  is_w2e?: boolean;
  is_locked?: boolean;
  locked_price?: number;
  locked_currency?: string;

  // Bounty/W2E data (from streamInfo)
  streamInfo?: {
    isLockContent?: boolean;
    lockContentAmount?: number;
    lockContentTokenSymbol?: string;
    isPayPerView?: boolean;
    payPerViewAmount?: number;
    isAddBounty?: boolean;
    addBountyFirstXViewers?: number | string;
    addBountyFirstXComments?: number | string;
    addBountyAmount?: number;
    addBountyTokenSymbol?: string;
    addBountyChainId?: number;
  };

  // User interaction state (returned via JWT Bearer token)
  isLiked?: boolean;
  isDisliked?: boolean;
  isSaved?: boolean;
  isOwner?: boolean;
  isUnlocked?: boolean;

  // Creator profile (new API format - full profile object)
  minterUser?: DeHubUser;
  minterFollowers?: number;
  minterFollowings?: number;

  // Live stream metadata
  stream?: {
    streamId?: string;
    status?: string;
    viewerCount?: number;
    title?: string;
    category?: string;
  };

  // Blockchain data
  chainId?: number; // 8453 for Base, 56 for BSC/BNB
  mintTxHash?: string; // Transaction hash of the mint
  status?: string; // "minted", "signed", "pending", etc.
}

export interface DeHubComment {
  id: string;
  content: string;
  user: DeHubUser;
  created_at: string;
  like_count?: number;
  reply_count?: number;
  parent_id?: string;
}

export interface DeHubCategory {
  id: string;
  name: string;
  slug: string;
  icon_url?: string;
  nft_count?: number;
}

export interface SearchNFTsParams {
  page?: number;
  unit?: number;
  category?: string;
  sortMode?: "new" | "popular" | "trending";
  creator_id?: string;
  /** Post type filter - use "feed-images" for images feed, undefined for home/videos */
  postType?: string;
  search?: string;
  /** @deprecated Viewer context is now extracted from JWT Bearer token */
  address?: string;
  /** Content status filter */
  status?: "minted" | "signed" | "all" | "pending" | "failed";
}

/**
 * Universal search params for /api/search endpoint
 */
export interface UniversalSearchParams {
  /** Search query */
  q: string;
  /** Page number (0-indexed) */
  page?: number;
  /** Items per page */
  unit?: number;
  /** Type filter: "accounts", "videos", "livestreams", or undefined for all */
  type?: "accounts" | "videos" | "livestreams";
  /** Post type filter for videos: "video", "feed-all", "feed", "feed-simple", "feed-images" */
  postType?: string;
  /** @deprecated Viewer context is now extracted from JWT Bearer token */
  address?: string;
}

/**
 * Account from search results
 */
export interface SearchAccount {
  id: string;
  address: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  avatarImageUrl?: string;  // API returns this field
  verified?: boolean;
  followerCount?: number;
  followingCount?: number;
}

/**
 * Livestream from search results
 */
export interface SearchLivestream {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  viewerCount?: number;
  streamer?: {
    address: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
  };
}

/**
 * Universal search response
 */
export interface UniversalSearchResponse {
  accounts?: SearchAccount[];
  videos?: DeHubNFT[];
  livestreams?: SearchLivestream[];
  total?: number;
  has_more?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

/**
 * Custom error class for authentication failures.
 * Thrown when API calls fail due to expired tokens, 401/403 responses, etc.
 */
export class AuthenticationError extends Error {
  constructor(message: string = 'Session expired. Please sign in again.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

// Token expiry duration in milliseconds (24 hours)
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

export const setAuthToken = (token: string | null) => {
  if (token) {
    localStorage.setItem("dehub_token", token);
    localStorage.setItem("dehub_token_timestamp", String(Date.now()));
  } else {
    localStorage.removeItem("dehub_token");
    localStorage.removeItem("dehub_token_timestamp");
  }
};

/**
 * Get the current auth token from localStorage.
 * Always reads fresh from localStorage to avoid stale token issues.
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem("dehub_token");
};

export const isTokenExpired = (): boolean => {
  const timestamp = localStorage.getItem("dehub_token_timestamp");
  if (!timestamp) return true;
  
  const tokenAge = Date.now() - parseInt(timestamp, 10);
  return tokenAge >= TOKEN_EXPIRY_MS;
};

export const clearAuthSession = () => {
  localStorage.removeItem("dehub_token");
  localStorage.removeItem("dehub_token_timestamp");
  localStorage.removeItem("dehub_wallet");
};

// Base API call function - calls DeHub API directly
async function apiCall<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    body?: Record<string, unknown>;
    params?: Record<string, string | number | undefined>;
    requiresAuth?: boolean;
  } = {},
): Promise<T> {
  const { method = "GET", body, params = {}, requiresAuth = false } = options;

  // Build URL with query params
  const url = new URL(endpoint, DEHUB_API_BASE);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });

  const token = getAuthToken();

  if (requiresAuth && !token) {
    throw new Error("Authentication required");
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    
    // Detect auth failures (401 Unauthorized, or 403 with auth-related messages)
    const errorMessage = (errorData.message || errorData.error || '').toLowerCase();
    const isAuthError = 
      response.status === 401 || 
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('invalid token') ||
      errorMessage.includes('token expired') ||
      errorMessage.includes('jwt');

    // A 403 is only an auth error if the message is auth-related
    if (response.status === 403 && isAuthError) {
      clearAuthSession();
      throw new AuthenticationError('Session expired. Please sign in again.');
    }

    if (response.status === 401) {
      clearAuthSession();
      throw new AuthenticationError('Session expired. Please sign in again.');
    }
    
    throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

// Username availability check
export interface UsernameCheckResponse {
  status: boolean;
  code: number;
  available: boolean;
  username: string;
  message?: string;
  error?: boolean;
}

export async function checkUsernameAvailability(username: string): Promise<UsernameCheckResponse> {
  return apiCall<UsernameCheckResponse>("/api/username/check", {
    params: { username },
    requiresAuth: false,
  });
}

// Auth functions - calls DeHub API directly
export async function authenticateWallet(
  address: string,
  signature: string,
  timestamp: number,
  chainId: number = 8453,
): Promise<AuthResponse> {
  const response = await fetch(`${DEHUB_API_BASE}/api/web/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      address: address.toLowerCase(),
      sig: signature,
      timestamp,
      chainId,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || "Authentication failed");
  }

  const data: AuthResponse = await response.json();

  if (data.token) {
    setAuthToken(data.token);
  }

  return data;
}

/**
 * Search NFTs/content — migrated from deprecated /api/search_nfts to /api/feed
 * Maintains the same interface for backward compatibility.
 */
export async function searchNFTs(params: SearchNFTsParams = {}): Promise<PaginatedResponse<DeHubNFT>> {
  // Map old sortMode to new sortBy/sortOrder
  let sortBy: string | undefined;
  let sortOrder: string | undefined;
  switch (params.sortMode) {
    case 'new':
      sortBy = 'createdAt';
      sortOrder = 'desc';
      break;
    case 'popular':
      sortBy = 'likes';
      sortOrder = 'desc';
      break;
    case 'trending':
      sortBy = 'views';
      sortOrder = 'desc';
      break;
  }

  const apiParams: Record<string, string | number | undefined> = {
    page: params.page !== undefined ? params.page + 1 : 1, // Convert 0-based to 1-based
    limit: params.unit || 20,
    sortBy,
    sortOrder,
    category: params.category,
    minter: params.creator_id,
    postType: params.postType,
    search: params.search,
    status: params.status || 'minted',
  };

  const response = await apiCall<{ result: DeHubNFT[]; pagination?: { page: number; limit: number; totalCount: number; totalPages: number; hasMore: boolean } }>("/api/feed", {
    params: apiParams,
  });
  
  const items = response.result || [];
  const pagination = response.pagination;
  
  return {
    data: items,
    total: pagination?.totalCount ?? items.length,
    page: params.page || 0,
    limit: params.unit || 20,
    has_more: pagination?.hasMore ?? items.length >= (params.unit || 20),
  };
}

/**
 * Universal search across accounts, videos, and livestreams
 * Uses the /api/search endpoint
 * 
 * Note: The API returns a flat array of NFT content in `result`, not structured
 * accounts/videos/livestreams. We parse the array and categorize items.
 */
export async function universalSearch(params: UniversalSearchParams): Promise<UniversalSearchResponse> {
  // The API returns different data based on type param:
  // - type=accounts: returns user objects with _id, address, username, displayName, avatarImageUrl
  // - type=videos or no type: returns NFT objects with tokenId, name, imageUrl, minter
  const response = await apiCall<{ 
    result: Array<DeHubNFT | DeHubUser>; 
    pagination?: { hasMore: boolean; totalCount: number } 
  }>("/api/search", {
    params: {
      q: params.q,
      page: params.page,
      unit: params.unit,
      type: params.type,
      postType: params.postType,
      address: params.address,
    },
  });
  
  // Extract the array from response
  let items: Array<any> = [];
  if (response && typeof response === 'object' && 'result' in response) {
    items = Array.isArray(response.result) ? response.result : [];
  } else if (Array.isArray(response)) {
    items = response;
  }
  
  // Determine if results are accounts based on type param
  const isAccountSearch = params.type === 'accounts';
  
  if (isAccountSearch) {
    // Map raw user objects to SearchAccount format
    const accounts: SearchAccount[] = items
      .map(item => ({
        id: item._id || item.id || item.address || '',
        address: item.address || '',
        username: item.username || '',
        displayName: item.displayName,
        bio: item.aboutMe || item.bio,
        avatarUrl: item.avatarImageUrl || item.avatarUrl,
        avatarImageUrl: item.avatarImageUrl,
        verified: item.isVerified || false,
        followerCount: typeof item.followers === 'number' ? item.followers : undefined,
      }))
      .filter(a => a.id && a.address);
    
    return {
      accounts,
      videos: [],
      livestreams: [],
      has_more: (response as any).pagination?.hasMore ?? items.length >= (params.unit || 15),
      total: (response as any).pagination?.totalCount ?? items.length,
    };
  }
  
  // For video/NFT searches, keep existing behavior
  return {
    accounts: [],
    videos: items as DeHubNFT[],
    livestreams: [],
    has_more: (response as any).pagination?.hasMore ?? items.length >= (params.unit || 15),
    total: (response as any).pagination?.totalCount ?? items.length,
  };
}

/**
 * Search suggestions/autocomplete params
 */
export interface SearchSuggestionsParams {
  /** Partial search query */
  q: string;
  /** Max number of suggestions */
  limit?: number;
}

/**
 * Search suggestion item
 */
export interface SearchSuggestion {
  text: string;
  type: 'query' | 'account' | 'tag';
  data?: {
    address?: string;
    username?: string;
    avatarUrl?: string;
  };
}

/**
 * Get search autocomplete suggestions
 * Uses the /api/search/suggestions endpoint
 */
export async function getSearchSuggestions(params: SearchSuggestionsParams): Promise<SearchSuggestion[]> {
  const response = await apiCall<{ suggestions: SearchSuggestion[] } | SearchSuggestion[]>("/api/search/suggestions", {
    params: {
      q: params.q,
      limit: params.limit,
    },
  });
  
  // Handle wrapped response from API
  if (response && typeof response === 'object' && 'suggestions' in response) {
    return response.suggestions;
  }
  
  return response as SearchSuggestion[];
}

/**
 * Search analytics log params
 */
export interface SearchLogParams {
  /** Search query that was executed */
  query: string;
  /** Type of content searched */
  type?: 'accounts' | 'videos' | 'livestreams' | 'all';
  /** Number of results returned */
  resultCount?: number;
  /** Whether user clicked on a result */
  clicked?: boolean;
  /** ID of clicked result (if applicable) */
  clickedResultId?: string;
}

/**
 * Log search analytics
 * Uses the POST /api/search/log endpoint
 */
export async function logSearchAnalytics(params: SearchLogParams): Promise<void> {
  await apiCall<{ status: boolean }>("/api/search/log", {
    method: "POST",
    body: {
      query: params.query,
      type: params.type,
      resultCount: params.resultCount,
      clicked: params.clicked,
      clickedResultId: params.clickedResultId,
    },
  });
}

export async function getNFTInfo(tokenId: string): Promise<DeHubNFT> {
  // Pass auth token so API returns isLiked/isDisliked for current user
  const token = getAuthToken();
  const response = await apiCall<{ result: DeHubNFT } | DeHubNFT>(`/api/nft_info/${tokenId}`, {
    requiresAuth: !!token, // Only require auth if we have a token (allows unauthenticated viewing)
  });
  // Handle wrapped response from API
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as DeHubNFT;
}

// API comment response from /api/nft/{tokenId}/comments
export interface ApiCommentResponse {
  id: string;
  tokenId: number;
  address: string;
  content: string;
  imageUrl: string | null;
  replyIds: number[];
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
  likeCount?: number;
  isLiked?: boolean;
  writor: {
    username: string;
    avatarUrl?: string;
  };
}

// Response wrapper for comments endpoint
interface CommentsApiResponse {
  result: {
    items: ApiCommentResponse[];
    totalCount: number;
    skip: number;
    limit: number;
    hasMore: boolean;
  };
}

export async function getNFTComments(
  tokenId: string,
  page: number = 0,
  limit: number = 20,
  address?: string,
): Promise<ApiCommentResponse[]> {
  const response = await apiCall<CommentsApiResponse>(`/api/nft/${tokenId}/comments`, {
    params: { page, limit, address },
  });
  return response.result?.items || [];
}

export async function recordView(tokenId: string): Promise<void> {
  return apiCall<void>(`/api/record-view/${tokenId}`, {
    method: "GET",
  });
}

// User functions
export async function getAccountInfo(userId: string, address?: string): Promise<DeHubUser> {
  const params: Record<string, string> = {};
  if (address) {
    params.address = address;
  }
  const response = await apiCall<{ result: DeHubUser } | DeHubUser>(`/api/account_info/${encodeURIComponent(userId)}`, { params });
  // Handle wrapped response from API
  if (response && typeof response === "object" && "result" in response) {
    return response.result;
  }
  return response as DeHubUser;
}

export async function getAccountByUsername(username: string, address?: string): Promise<DeHubUser> {
  // Remove @ prefix if present
  const cleanUsername = username.replace("@", "");
  const params: Record<string, string> = {};
  if (address) {
    params.address = address;
  }
  const response = await apiCall<{ result: DeHubUser } | DeHubUser>(`/api/account_info/${encodeURIComponent(cleanUsername)}`, { params });
  // Handle wrapped response from API
  if (response && typeof response === "object" && "result" in response) {
    return response.result;
  }
  return response as DeHubUser;
}

// Profile update data interface
export interface UpdateProfileData {
  username?: string;
  displayName?: string;
  aboutMe?: string;
  hideFollowers?: boolean;
  isPrivate?: boolean;
  notificationPreferences?: string;
  twitterLink?: string;
  discordLink?: string;
  instagramLink?: string;
  tiktokLink?: string;
  telegramLink?: string;
  youtubeLink?: string;
  facebookLink?: string;
  customs?: Record<string, string>;
  avatarImg?: File;
  coverImg?: File;
}

export async function updateProfile(data: UpdateProfileData): Promise<{ result: boolean }> {
  const token = getAuthToken();
  
  if (!token) {
    throw new Error("Authentication required");
  }

  const formData = new FormData();

  // Add text fields
  if (data.username !== undefined) formData.append("username", data.username);
  if (data.displayName !== undefined) formData.append("displayName", data.displayName);
  if (data.aboutMe !== undefined) formData.append("aboutMe", data.aboutMe);
  if (data.hideFollowers !== undefined) formData.append("hideFollowers", String(data.hideFollowers));
  if (data.isPrivate !== undefined) formData.append("isPrivate", String(data.isPrivate));
  if (data.notificationPreferences !== undefined) formData.append("notificationPreferences", data.notificationPreferences);
  if (data.twitterLink !== undefined) formData.append("twitterLink", data.twitterLink);
  if (data.discordLink !== undefined) formData.append("discordLink", data.discordLink);
  if (data.instagramLink !== undefined) formData.append("instagramLink", data.instagramLink);
  if (data.tiktokLink !== undefined) formData.append("tiktokLink", data.tiktokLink);
  if (data.telegramLink !== undefined) formData.append("telegramLink", data.telegramLink);
  if (data.youtubeLink !== undefined) formData.append("youtubeLink", data.youtubeLink);
  if (data.facebookLink !== undefined) formData.append("facebookLink", data.facebookLink);
  
  // Add customs as JSON string
  if (data.customs !== undefined) {
    formData.append("customs", JSON.stringify(data.customs));
  }

  // Add image files
  if (data.avatarImg) formData.append("avatarImg", data.avatarImg);
  if (data.coverImg) formData.append("coverImg", data.coverImg);

  const response = await fetch(`${DEHUB_API_BASE}/api/update_profile`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      // Don't set Content-Type - browser will set it with boundary for FormData
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

export async function getUserNFTs(
  userId: string,
  page: number = 1,
  limit: number = 20,
): Promise<PaginatedResponse<DeHubNFT>> {
  return apiCall<PaginatedResponse<DeHubNFT>>(`/api/user/${userId}/nfts`, {
    params: { page, limit },
  });
}

// Interaction functions
export interface VoteResponse {
  result: boolean;
  action?: 'added' | 'removed' | 'changed';
  currentVote?: boolean | null;
}

/**
 * Cast a vote (like or dislike) on a video - toggleable
 * Uses POST /api/request_vote with body { streamTokenId, vote }
 * 
 * @param tokenId - The token ID of the video to vote on
 * @param vote - true for like, false for dislike
 * @returns VoteResponse with result, action, and currentVote
 */
export async function voteOnNFT(tokenId: string, vote: boolean): Promise<VoteResponse> {
  // API expects streamTokenId as a number
  const numericTokenId = parseInt(tokenId, 10);
  if (isNaN(numericTokenId)) {
    throw new Error(`Invalid token ID: ${tokenId}`);
  }
  
  console.log('[Vote] Calling API:', { streamTokenId: numericTokenId, vote });
  
  const result = await apiCall<VoteResponse>("/api/request_vote", {
    method: "POST",
    body: {
      streamTokenId: numericTokenId,
      vote: vote,
    },
    requiresAuth: true,
  });
  
  console.log('[Vote] API Response:', result);
  
  return result;
}

/**
 * Follow a user
 * Uses GET /api/request_follow?following={walletAddress}
 */
export async function followUser(walletAddress: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/request_follow", {
    method: "GET",
    params: { following: walletAddress },
    requiresAuth: true,
  });
}

/**
 * Unfollow a user
 * Uses GET /api/request_follow?following={walletAddress}&unFollowing=true
 */
export async function unfollowUser(walletAddress: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/request_follow", {
    method: "GET",
    params: { following: walletAddress, unFollowing: "true" },
    requiresAuth: true,
  });
}

// =============================================
// Follow Request System (Private Accounts)
// =============================================

/**
 * Follow request item from API
 */
export interface FollowRequestItem {
  id: string;
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  createdAt?: string;
}

/**
 * Get pending follow requests for the current user
 * GET /api/follow-requests
 */
export async function getFollowRequests(): Promise<FollowRequestItem[]> {
  const response = await apiCall<{ result: FollowRequestItem[] } | FollowRequestItem[]>(
    "/api/follow-requests",
    { requiresAuth: true }
  );
  
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as FollowRequestItem[];
}

/**
 * Accept a follow request
 * POST /api/follow-requests/{id}/accept
 */
export async function approveFollowRequest(requestId: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/follow-requests/${requestId}/accept`, {
    method: "POST",
    requiresAuth: true,
  });
}

/**
 * Reject a follow request
 * POST /api/follow-requests/{id}/reject
 */
export async function rejectFollowRequest(requestId: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/follow-requests/${requestId}/reject`, {
    method: "POST",
    requiresAuth: true,
  });
}

/**
 * Accept all pending follow requests
 * POST /api/follow-requests/accept-all
 */
export async function acceptAllFollowRequests(): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/follow-requests/accept-all", {
    method: "POST",
    requiresAuth: true,
  });
}

/**
 * Reject all pending follow requests
 * POST /api/follow-requests/reject-all
 */
export async function rejectAllFollowRequests(): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/follow-requests/reject-all", {
    method: "POST",
    requiresAuth: true,
  });
}

/**
 * Follow list item from API
 */
export interface FollowListItem {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  isFollowing?: boolean;
  followsYou?: boolean;
}

/**
 * Get followers or following list for a user
 * Uses GET /api/follow_list/{address}?type=followers|following
 * Supports pagination, sorting, and search per API docs.
 */
export async function getFollowList(
  address: string, 
  type: 'followers' | 'following',
  options?: {
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'username' | 'displayName';
    sortOrder?: 'asc' | 'desc';
    search?: string;
  }
): Promise<{ items: FollowListItem[]; pagination?: { page: number; limit: number; totalCount: number; totalPages: number; hasMore: boolean } }> {
  const params: Record<string, string | number | undefined> = { type };
  if (options?.page !== undefined) params.page = options.page;
  if (options?.limit !== undefined) params.limit = options.limit;
  if (options?.sortBy) params.sortBy = options.sortBy;
  if (options?.sortOrder) params.sortOrder = options.sortOrder;
  if (options?.search) params.search = options.search;
  
  const response = await apiCall<{ result: any; status?: boolean }>(
    `/api/follow_list/${encodeURIComponent(address)}`, 
    { params }
  );
  
  // Unwrap { result: [...] } wrapper if present
  const raw: any = (response && typeof response === 'object' && 'result' in response)
    ? (response as any).result
    : response;

  // Handle new paginated format: { items: [{ followedAt, user }], pagination }
  let items: any[];
  let pagination: any;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.items)) {
    items = raw.items.map((entry: any) => entry.user || entry);
    pagination = raw.pagination;
  } else if (Array.isArray(raw)) {
    items = raw;
  } else {
    return { items: [] };
  }

  if (items.length === 0) {
    return { items: [], pagination };
  }

  // API may return raw address strings instead of objects — normalise them
  if (typeof items[0] === 'string') {
    return { items: (items as string[]).map(addr => ({ address: addr.toLowerCase() })), pagination };
  }

  return { items: items as FollowListItem[], pagination };
}

export interface PostCommentResponse {
  result?: boolean;
}

export async function postComment(tokenId: string, content: string, replyToId?: string): Promise<PostCommentResponse> {
  const params: Record<string, string> = {
    streamTokenId: tokenId,
    content,
  };
  if (replyToId) {
    params.commentId = replyToId;
  }
  
  return apiCall<PostCommentResponse>("/api/request_comment", {
    method: "GET",
    params,
    requiresAuth: true,
  });
}

// Bookmark/Saved functions
export interface SavePostResponse {
  status: string; // "success"
  message: string; // "Feed saved" or "Feed unsaved"
}

/**
 * Toggle save/bookmark status for a post
 * Uses POST /api/savePost with body { tokenId: number }
 * This is a toggle endpoint - calling it toggles the saved state
 */
export async function toggleSavePost(tokenId: string | number): Promise<SavePostResponse> {
  return apiCall<SavePostResponse>("/api/savePost", {
    method: "POST",
    body: { tokenId: Number(tokenId) },
    requiresAuth: true,
  });
}

/**
 * Get user's saved/bookmarked posts
 * Uses GET /api/savedPosts with limit (items per page) and page (1-based)
 */
export async function getSavedPosts(page: number = 1, limit: number = 20): Promise<{ result: DeHubNFT[]; pagination?: { page: number; limit: number; totalCount: number; totalPages: number; hasMore: boolean } }> {
  return apiCall<{ result: DeHubNFT[]; pagination?: any }>("/api/savedPosts", {
    params: { page, limit },
    requiresAuth: true,
  });
}

/**
 * Get user's liked posts
 * Uses GET /api/liked_videos with limit (items per page) and page (1-based)
 */
export async function getLikedPosts(
  page: number = 1, 
  limit: number = 20, 
): Promise<{ result: DeHubNFT[]; pagination?: { page: number; limit: number; totalCount: number; totalPages: number; hasMore: boolean } }> {
  return apiCall<{ result: DeHubNFT[]; pagination?: any }>("/api/liked_videos", {
    params: { page, limit },
    requiresAuth: true,
  });
}

/**
 * Get user's watch history
 * Uses GET /api/my_watched_nfts with limit (items per page) and page (0-based)
 * API requires 'address' param for the viewer's address
 */
export async function getWatchHistory(
  page: number = 0, 
  limit: number = 20,
  address?: string
): Promise<{ result: DeHubNFT[] }> {
  return apiCall<{ result: DeHubNFT[] }>("/api/my_watched_nfts", {
    params: { page, limit, ...(address && { address }) },
    requiresAuth: true,
  });
}
export async function getCategories(): Promise<DeHubCategory[]> {
  const response = await apiCall<string[] | DeHubCategory[]>("/api/get_categories");
  
  // API returns an array of strings, normalize to DeHubCategory objects
  if (Array.isArray(response) && response.length > 0) {
    // Check if it's already in the expected format
    if (typeof response[0] === 'object' && 'name' in response[0]) {
      return response as DeHubCategory[];
    }
    // Convert string array to category objects
    // IMPORTANT: Keep the original name for API calls since the API is case-sensitive
    return (response as string[]).map((name) => ({
      id: name.trim(), // Use original name as ID for API calls
      name: name.trim(),
      slug: name.toLowerCase().trim().replace(/\s+/g, '-'),
    }));
  }
  
  return [];
}

// ============================================
// ADDITIONAL USER ENDPOINTS
// ============================================

/**
 * Get total registered user count
 * GET /api/users_count
 */
export async function getUsersCount(): Promise<number> {
  const response = await apiCall<{ result: number } | number>("/api/users_count");
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as number;
}

/**
 * Check if current user follows a target user
 * GET /api/is_following?target={address}
 */
export async function isFollowing(targetAddress: string): Promise<boolean> {
  const response = await apiCall<{ result: { isFollowing: boolean } } | { result: boolean } | boolean>("/api/is_following", {
    params: { target: targetAddress },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    const result = (response as any).result;
    if (typeof result === 'object' && 'isFollowing' in result) {
      return result.isFollowing;
    }
    return result;
  }
  return response as boolean;
}

// ============================================
// ADDITIONAL VIDEO/CONTENT ENDPOINTS
// ============================================

/**
 * Get current server time
 * GET /api/getServerTime
 */
export async function getServerTime(): Promise<{ time: string }> {
  return apiCall<{ time: string }>("/api/getServerTime");
}

/**
 * Get signature to claim bounty reward
 * GET /api/claim-bounty
 */
export async function claimBounty(tokenId: number | string): Promise<{
  r: string;
  s: string;
  v: number;
  amount: number;
}> {
  const response = await apiCall<any>("/api/claim-bounty", {
    params: { tokenId },
    requiresAuth: true,
  });
  return response?.result || response;
}

/**
 * Get unlocked PPV videos for a user
 * GET /api/unlocked_nfts/{id}
 */
export async function getUnlockedNFTs(
  userId: string,
  page: number = 0,
  limit: number = 20
): Promise<{ result: DeHubNFT[] }> {
  return apiCall<{ result: DeHubNFT[] }>(`/api/unlocked_nfts/${userId}`, {
    params: { page, limit },
    requiresAuth: true,
  });
}

/**
 * Record batch views (optimized for feeds)
 * POST /api/view/batch
 */
export async function recordBatchViews(tokenIds: number[]): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/view/batch", {
    method: "POST",
    body: { tokenIds },
    requiresAuth: false,
  });
}

// Content creation
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

// ============================================
// LIVESTREAM API
// ============================================

/**
 * Live stream data returned by API
 */
export interface LiveStream {
  streamId: string;
  address: string;
  title: string;
  description?: string;
  category?: string;
  thumbnailUrl?: string;
  viewerCount: number;
  likeCount: number;
  status: 'scheduled' | 'live' | 'ended';
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
  streamer?: DeHubUser;
  playbackUrl?: string;
}

/**
 * Stream key and ingest info for starting a stream
 */
export interface StreamKeyInfo {
  streamKey: string;
  ingestUrl: string;
}

/**
 * Activity log entry for a live stream
 */
export interface StreamActivity {
  id: string;
  type: 'join' | 'leave' | 'like' | 'gift' | 'comment';
  address: string;
  username?: string;
  avatarUrl?: string;
  message?: string;
  giftAmount?: number;
  giftCurrency?: string;
  timestamp: string;
}

/**
 * Create a new live stream (schedule or prepare to go live)
 * POST /api/live
 */
export interface CreateLiveStreamData {
  title: string;
  description?: string;
  category?: string;
  thumbnailUrl?: string;
  scheduledAt?: string; // ISO date string for scheduled streams
}

export async function createLiveStream(data: CreateLiveStreamData): Promise<{ result: LiveStream }> {
  return apiCall<{ result: LiveStream }>("/api/live", {
    method: "POST",
    body: { ...data },
    requiresAuth: true,
  });
}

/**
 * Get all active live streams
 * GET /api/live
 */
export interface GetLiveStreamsParams {
  page?: number;
  unit?: number;
  category?: string;
  sortMode?: 'viewers' | 'recent' | 'popular';
}

export async function getLiveStreams(params: GetLiveStreamsParams = {}): Promise<{ result: LiveStream[] }> {
  return apiCall<{ result: LiveStream[] }>("/api/live", {
    params: {
      page: params.page,
      unit: params.unit,
      category: params.category,
      sortMode: params.sortMode,
    },
  });
}

/**
 * Get live streams by a specific user
 * GET /api/live/user/{address}
 */
export async function getUserLiveStreams(address: string): Promise<{ result: LiveStream[] }> {
  return apiCall<{ result: LiveStream[] }>(`/api/live/user/${address}`);
}

/**
 * Get scheduled live streams for a user
 * GET /api/live/user/{address}/scheduled
 */
export async function getUserScheduledStreams(address: string): Promise<{ result: LiveStream[] }> {
  return apiCall<{ result: LiveStream[] }>(`/api/live/user/${address}/scheduled`);
}

/**
 * Get a specific live stream by ID
 * GET /api/live/{streamId}
 */
export async function getLiveStream(streamId: string): Promise<{ result: LiveStream }> {
  return apiCall<{ result: LiveStream }>(`/api/live/${streamId}`);
}

/**
 * Get stream key for starting broadcast (only for stream owner)
 * GET /api/live/{streamId}/key
 */
export async function getStreamKey(streamId: string): Promise<{ result: StreamKeyInfo }> {
  return apiCall<{ result: StreamKeyInfo }>(`/api/live/${streamId}/key`, {
    requiresAuth: true,
  });
}

/**
 * Get stream activities (joins, gifts, likes, etc.)
 * GET /api/live/{streamId}/activities
 */
export async function getStreamActivities(
  streamId: string,
  params: { page?: number; unit?: number } = {}
): Promise<{ result: StreamActivity[] }> {
  return apiCall<{ result: StreamActivity[] }>(`/api/live/${streamId}/activities`, {
    params,
  });
}

/**
 * Get the ingest URL for a stream
 * GET /api/live/{streamId}/ingesturl
 */
export async function getStreamIngestUrl(streamId: string): Promise<{ result: { ingestUrl: string } }> {
  return apiCall<{ result: { ingestUrl: string } }>(`/api/live/${streamId}/ingesturl`, {
    requiresAuth: true,
  });
}

/**
 * Start broadcasting (go live)
 * POST /api/live/start
 */
export interface StartLiveStreamData {
  streamId?: string; // If continuing a scheduled stream
  title?: string;
  description?: string;
  category?: string;
  thumbnailUrl?: string;
}

export interface StartLiveStreamResponse {
  result: {
    streamId: string;
    streamKey: string;
    ingestUrl: string;
    playbackUrl: string;
  };
}

export async function startLiveStream(data: StartLiveStreamData = {}): Promise<StartLiveStreamResponse> {
  return apiCall<StartLiveStreamResponse>("/api/live/start", {
    method: "POST",
    body: { ...data },
    requiresAuth: true,
  });
}

/**
 * Like a live stream
 * POST /api/live/{streamId}/like
 */
export async function likeLiveStream(streamId: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/live/${streamId}/like`, {
    method: "POST",
    requiresAuth: true,
  });
}

/**
 * Send a gift to a live stream
 * POST /api/live/{streamId}/gift
 */
export interface SendGiftData {
  amount: number;
  currency: string; // 'DHB', 'USDC', etc.
  message?: string;
}

export async function sendLiveStreamGift(streamId: string, data: SendGiftData): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/live/${streamId}/gift`, {
    method: "POST",
    body: { ...data },
    requiresAuth: true,
  });
}

/**
 * End a live stream
 * POST /api/live/{streamId}/end (or use webhook)
 */
export async function endLiveStream(streamId: string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/live/${streamId}/end`, {
    method: "POST",
    requiresAuth: true,
  });
}

// Legacy alias for backwards compatibility
export const startLivestream = startLiveStream;
export const endLivestream = async () => ({ success: true });

// DHB Price
export async function getDHBPrice(): Promise<{ price: number; change_24h: number }> {
  return apiCall<{ price: number; change_24h: number }>("/api/dpay/price");
}

// Leaderboard types
export interface LeaderboardEntry {
  account: string;
  total: number;
  username?: string;
  userDisplayName?: string;
  avatarUrl?: string;
  sentTips: number;
  receivedTips: number;
  followers?: number;
  likes?: number;
  subscribers?: number;
}

export interface LeaderboardResponse {
  result: {
    byWalletBalance: LeaderboardEntry[];
  };
}

export type LeaderboardSortMode = 'holdings' | 'sentTips' | 'receivedTips';
export type LeaderboardPeriod = 'day' | 'week' | 'month' | 'year' | 'all';

/**
 * Fetch leaderboard data - tries server cache first (refreshed every 6 hours)
 * Falls back to direct API if cache unavailable
 * @param sort - Sort criteria: holdings (default), sentTips, receivedTips
 * @param period - Time period filter: day, week, month, year, all (default)
 */
export async function getLeaderboard(
  sort: LeaderboardSortMode = 'holdings',
  period: LeaderboardPeriod = 'all'
): Promise<LeaderboardResponse> {
  // Try to get from server cache first
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    
    const { data: cached, error } = await supabase
      .from('leaderboard_cache')
      .select('data, updated_at')
      .eq('sort_mode', sort)
      .eq('period', period)
      .single();
    
    if (!error && cached?.data) {
      console.log(`[Leaderboard] Using cached data from ${cached.updated_at}`);
      return cached.data as unknown as LeaderboardResponse;
    }
  } catch (cacheError) {
    console.warn('[Leaderboard] Cache unavailable, falling back to API:', cacheError);
  }
  
  // Fallback to direct API call
  const params: Record<string, string> = { sort };
  if (period !== 'all') {
    params.period = period;
  }
  
  return apiCall<LeaderboardResponse>("/api/leaderboard", { params });
}

// ============================================
// NOTIFICATIONS API
// ============================================

/**
 * Notification types from DeHub API
 */
export type NotificationType = 
  | 'like' 
  | 'comment' 
  | 'comment_reply'
  | 'following'
  | 'tip' 
  | 'subscription'
  | 'ppv_purchase'
  | 'video_milestone'
  | 'livestream_start'
  | 'video_removal';

/**
 * Notification categories from DeHub API
 */
export type NotificationCategory = 
  | 'engagement'    // likes, comments, replies
  | 'social'        // follows, mentions
  | 'monetization'  // tips, subscriptions, PPV purchases
  | 'content'       // video milestones, livestream starts
  | 'system';       // video removals, account warnings

/**
 * Post type for content notifications
 */
export type NotificationPostType = 'video' | 'feed-images' | 'feed-simple';

/**
 * Notification interface matching DeHub API spec
 */
export interface DeHubNotification {
  _id: string;
  id: string; // Normalized from _id
  address: string;
  type: NotificationType;
  category: NotificationCategory;
  content: string;
  read: boolean;
  createdAt: string;
  updatedAt: string;
  readAt?: string;
  
  // Actor info (who triggered the notification)
  actorAddress?: string;
  actorUsername?: string;
  actorAvatar?: string;
  
  // Related content
  tokenId?: number;
  tokenTitle?: string;
  tokenThumbnail?: string;
  postType?: NotificationPostType;
  
  // Aggregation (for grouped notifications)
  aggregatedCount?: number;
  latestActorNames?: string[];
  
  // Monetization specific
  amount?: number;
  currency?: string;
  
  // Legacy support - normalized actor object
  actor?: DeHubUser;
  post?: DeHubNFT;
}

/**
 * Raw notification from API (before normalization)
 */
interface RawNotification {
  _id: string;
  address: string;
  type: NotificationType;
  category: NotificationCategory;
  content: string;
  read: boolean;
  createdAt: string;
  updatedAt: string;
  readAt?: string;
  actorAddress?: string;
  actorUsername?: string;
  actorAvatar?: string;
  tokenId?: number;
  tokenTitle?: string;
  tokenThumbnail?: string;
  postType?: NotificationPostType;
  aggregatedCount?: number;
  latestActorNames?: string[];
  amount?: number;
  currency?: string;
}

/**
 * Notifications list response from API
 */
interface NotificationsApiResponse {
  result: RawNotification[];
}

/**
 * Unread count response from API
 */
interface UnreadCountApiResponse {
  total: number;
  byCategory: {
    engagement: number;
    social: number;
    monetization: number;
    content: number;
    system: number;
  };
}

/**
 * Normalize raw notification from API to internal format
 */
function normalizeNotification(raw: RawNotification): DeHubNotification {
  return {
    ...raw,
    id: raw._id, // Normalize _id to id
    // Create legacy actor object for backwards compatibility
    actor: raw.actorUsername || raw.actorAddress ? {
      address: raw.actorAddress,
      username: raw.actorUsername,
      avatarImageUrl: raw.actorAvatar,
    } : undefined,
    // Create legacy post object
    post: raw.tokenId ? {
      tokenId: raw.tokenId,
      name: raw.tokenTitle || '',
      title: raw.tokenTitle,
      imageUrl: raw.tokenThumbnail || '',
      postType: raw.postType === 'video' ? 'video' : 'image',
      minter: '',
      createdAt: raw.createdAt,
    } : undefined,
  };
}

/**
 * Fetch user notifications
 * Uses GET /api/notification endpoint
 * @param page - Page number (1-indexed as per API spec)
 * @param limit - Items per page (default 30, max 100)
 * @param category - Optional category filter
 * @param unreadOnly - If true, only returns unread notifications (default true)
 */
export async function getNotifications(
  page: number = 1,
  limit: number = 30,
  category?: NotificationCategory,
  unreadOnly: boolean = false
): Promise<{ items: DeHubNotification[]; totalCount: number; hasMore: boolean }> {
  const params: Record<string, string | number> = { 
    page, 
    limit,
    unreadOnly: unreadOnly.toString(),
  };
  
  if (category) {
    params.category = category;
  }
  
  const response = await apiCall<NotificationsApiResponse | { result: RawNotification[] } | RawNotification[]>("/api/notification", {
    params,
    requiresAuth: true,
  });
  
  // Handle { result: [...] } format
  if (response && typeof response === 'object' && 'result' in response) {
    const result = response.result;
    if (Array.isArray(result)) {
      const items = result
        .filter(item => item && item._id)
        .map(normalizeNotification);
      return { 
        items, 
        totalCount: items.length, 
        hasMore: items.length >= limit 
      };
    }
  }
  
  // Handle direct array response
  if (Array.isArray(response)) {
    const items = response
      .filter(item => item && item._id)
      .map(normalizeNotification);
    return { 
      items, 
      totalCount: items.length, 
      hasMore: items.length >= limit 
    };
  }
  
  return { items: [], totalCount: 0, hasMore: false };
}

/**
 * Unread count result type
 */
export interface UnreadNotificationCount {
  total: number;
  byCategory: {
    engagement: number;
    social: number;
    monetization: number;
    content: number;
    system: number;
  };
}

/**
 * Get unread notification count with category breakdown
 * Uses GET /api/notification/unread-count endpoint
 */
export async function getUnreadNotificationCount(): Promise<UnreadNotificationCount> {
  const response = await apiCall<UnreadCountApiResponse>("/api/notification/unread-count", {
    requiresAuth: true,
  });
  
  return {
    total: response?.total || 0,
    byCategory: response?.byCategory || {
      engagement: 0,
      social: 0,
      monetization: 0,
      content: 0,
      system: 0,
    },
  };
}

/**
 * Mark a single notification as read
 * Uses PATCH /api/notification/{notificationId} endpoint
 * @param notificationId - The notification MongoDB ObjectId
 */
export async function markNotificationAsRead(notificationId: string): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`/api/notification/${notificationId}`, {
    method: "PATCH",
    requiresAuth: true,
  });
}

/**
 * Mark all notifications as read
 * Uses POST /api/notification/mark-all-read endpoint
 * @param category - Optional: Only mark notifications in this category as read
 */
export async function markAllNotificationsAsRead(category?: NotificationCategory): Promise<{ message: string; count: number }> {
  const params: Record<string, string> = {};
  if (category) {
    params.category = category;
  }
  
  return apiCall<{ message: string; count: number }>("/api/notification/mark-all-read", {
    method: "POST",
    params,
    requiresAuth: true,
  });
}

// ============================================
// REPORTS API
// ============================================

/**
 * Report interface
 */
export interface DeHubReport {
  id: string;
  tokenId: number;
  reporterId: string;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt: string;
  updatedAt?: string;
}

/**
 * Report submission data
 */
export interface ReportSubmission {
  tokenId: number;
  reason: string;
  description?: string;
}

/**
 * Get all reports (admin only)
 * Uses GET /api/nft/reports endpoint
 */
export async function getAllReports(): Promise<DeHubReport[]> {
  const response = await apiCall<{ result: DeHubReport[] } | DeHubReport[]>("/api/nft/reports", {
    requiresAuth: true,
  });
  
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  if (Array.isArray(response)) {
    return response;
  }
  return [];
}

/**
 * Get reports for a specific NFT
 * Uses GET /api/reports/{tokenId} endpoint
 * @param tokenId - The NFT token ID
 */
export async function getReportsForNFT(tokenId: number | string): Promise<DeHubReport[]> {
  const response = await apiCall<{ result: DeHubReport[] } | DeHubReport[]>(`/api/reports/${tokenId}`, {
    requiresAuth: true,
  });
  
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  if (Array.isArray(response)) {
    return response;
  }
  return [];
}

/**
 * Submit a report for an NFT
 * Uses POST /api/nft/reports endpoint
 * @param data - Report submission data
 */
export async function submitReport(data: ReportSubmission): Promise<{ success: boolean; reportId?: string; message?: string }> {
  try {
    const response = await apiCall<{ success?: boolean; result?: { id: string }; message?: string; _id?: string }>("/api/nft/reports", {
      method: "POST",
      body: data as unknown as Record<string, unknown>,
      requiresAuth: true,
    });
    
    // Handle various response formats from API
    // Format 1: { success: true, result: { id: "..." } }
    // Format 2: { _id: "..." } (direct creation response)
    // Format 3: { message: "Report created" }
    const reportId = response?.result?.id || response?._id;
    
    return { 
      success: response?.success !== false, 
      reportId,
      message: response?.message || 'Report submitted successfully',
    };
  } catch (error: any) {
    console.error('[submitReport] Error:', error);
    throw error;
  }
}

// ============================================
// NEW REPORTS API (v2)
// ============================================

/**
 * Report reason from API
 */
export interface ReportReason {
  id: string;
  label: string;
  description?: string;
}

/**
 * Check if you already reported a video/post
 * GET /api/report/content/status/{tokenId}
 */
export async function getContentReportStatus(tokenId: number | string): Promise<{ reported: boolean }> {
  const response = await apiCall<any>(`/api/report/content/status/${tokenId}`, {
    requiresAuth: true,
  });
  return { reported: response?.result?.reported ?? response?.reported ?? false };
}

/**
 * Check if you already reported a user
 * GET /api/report/user/status/{userId}
 */
export async function getUserReportStatus(userId: string): Promise<{ reported: boolean }> {
  const response = await apiCall<any>(`/api/report/user/status/${userId}`, {
    requiresAuth: true,
  });
  return { reported: response?.result?.reported ?? response?.reported ?? false };
}

/**
 * Get available content report reasons
 * GET /api/report/reasons/content
 */
export async function getContentReportReasons(): Promise<ReportReason[]> {
  const response = await apiCall<{ result: ReportReason[] } | ReportReason[]>("/api/report/reasons/content");
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  return Array.isArray(response) ? response : [];
}

/**
 * Get available user report reasons
 * GET /api/report/reasons/user
 */
export async function getUserReportReasons(): Promise<ReportReason[]> {
  const response = await apiCall<{ result: ReportReason[] } | ReportReason[]>("/api/report/reasons/user");
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  return Array.isArray(response) ? response : [];
}

/**
 * Report a video or post
 * POST /api/report/content
 */
export async function reportContent(params: {
  tokenId: number;
  reason: string;
  description?: string;
}): Promise<{ success: boolean; message?: string }> {
  const response = await apiCall<any>("/api/report/content", {
    method: "POST",
    body: params as Record<string, unknown>,
    requiresAuth: true,
  });
  return { success: response?.success !== false, message: response?.message };
}

/**
 * Report a user
 * POST /api/report/user
 */
export async function reportUser(params: {
  userId: string;
  reason: string;
  description?: string;
}): Promise<{ success: boolean; message?: string }> {
  const response = await apiCall<any>("/api/report/user", {
    method: "POST",
    body: params as Record<string, unknown>,
    requiresAuth: true,
  });
  return { success: response?.success !== false, message: response?.message };
}

// ============================================
// DIRECT MESSAGING API
// ============================================

/**
 * Message types supported by the DM system
 */
export type DMMessageType = 'text' | 'image' | 'gif' | 'audio' | 'video' | 'tip';

/**
 * Group chat info
 */
export interface GroupInfo {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  creatorAddress: string;
  memberCount: number;
  members?: DeHubUser[];
  isPublic?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Conversation interface for DMs
 */
export interface DeHubConversation {
  id: string;
  participants: DeHubUser[];
  lastMessage?: DeHubDMMessage;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  /** The other participant (convenience field for 1:1 chats) */
  otherUser?: DeHubUser;
  /** Group info if this is a group chat */
  groupInfo?: GroupInfo;
  /** Whether this is a group conversation */
  isGroup?: boolean;
  /** Whether the current user has blocked this conversation */
  isBlocked?: boolean;
}

/**
 * Direct message interface
 */
export interface DeHubDMMessage {
  id: string;
  conversationId: string;
  sender: DeHubUser;
  content: string;
  type: DMMessageType;
  mediaUrl?: string;
  createdAt: string;
  readAt?: string;
  /** For tip messages */
  tipAmount?: number;
  tipCurrency?: string;
  /** For audio messages - duration in seconds */
  duration?: number;
}

/**
 * User online status
 */
export interface UserOnlineStatus {
  address: string;
  online: boolean;
  lastSeen?: string;
}

/**
 * Conversations list response from API
 */
interface ConversationsApiResponse {
  result: {
    items: DeHubConversation[];
    totalCount: number;
    hasMore: boolean;
  };
}

/**
 * Messages list response from API
 */
interface MessagesApiResponse {
  result: {
    items: DeHubDMMessage[];
    totalCount: number;
    hasMore: boolean;
  };
}

/**
 * Fetch list of user's conversations
 * - When no search query: Uses /api/dm/contacts/{address} to list all conversations
 * - With search query: Uses /api/dm/search endpoint
 * @param page - Page number (0-indexed)
 * @param limit - Items per page
 * @param searchQuery - Optional search query
 */
export async function getConversations(
  page: number = 0,
  limit: number = 20,
  searchQuery?: string
): Promise<{ items: DeHubConversation[]; totalCount: number; hasMore: boolean }> {
  console.log('[DM API] getConversations called', { page, limit, searchQuery });
  
  // If no search query, use the contacts endpoint to list all conversations
  if (!searchQuery) {
    const token = getAuthToken();
    if (!token) {
      console.log('[DM API] No auth token available');
      return { items: [], totalCount: 0, hasMore: false };
    }
    
    try {
      // Parse user address from JWT token
      const payload = JSON.parse(atob(token.split('.')[1]));
      const userAddress = payload.address;
      console.log('[DM API] Parsed user address from JWT:', userAddress);
      
      if (!userAddress) {
        console.warn('[DM API] No user address in JWT payload');
        return { items: [], totalCount: 0, hasMore: false };
      }
      
      // Use contacts endpoint which returns conversations for the user
      console.log('[DM API] Fetching from /api/dm/contacts/' + userAddress);
      const response = await apiCall<any>(
        `/api/dm/contacts/${userAddress}`,
        {
          params: { page, limit },
          requiresAuth: true,
        }
      );
      console.log('[DM API] getConversations raw response:', response);
      
      // Handle multiple response formats from the API
      let items: DeHubConversation[] = [];
      
      // Format 1: Direct array response
      if (Array.isArray(response)) {
        items = response;
      }
      // Format 2: { result: [...] }
      else if (response?.result && Array.isArray(response.result)) {
        items = response.result;
      }
      // Format 3: { result: { items: [...] } }
      else if (response?.result?.items && Array.isArray(response.result.items)) {
        items = response.result.items;
        const hasMore = response.result.hasMore ?? items.length >= limit;
        console.log('[DM API] Returning conversations (format 3):', { count: items.length, hasMore });
        return { items, totalCount: items.length, hasMore };
      }
      // Format 4: { items: [...] }
      else if (response?.items && Array.isArray(response.items)) {
        items = response.items;
        const hasMore = response.hasMore ?? items.length >= limit;
        console.log('[DM API] Returning conversations (format 4):', { count: items.length, hasMore });
        return { items, totalCount: items.length, hasMore };
      }
      
      console.log('[DM API] Returning conversations:', { count: items.length, hasMore: items.length >= limit });
      return { 
        items, 
        totalCount: items.length, 
        hasMore: items.length >= limit 
      };
    } catch (error) {
      console.error('[DM API] Failed to fetch conversations:', error);
      return { items: [], totalCount: 0, hasMore: false };
    }
  }
  
  // With search query, use the search endpoint
  console.log('[DM API] Searching conversations with query:', searchQuery);
  try {
    const response = await apiCall<any>("/api/dm/search", {
      params: { query: searchQuery, page, limit },
      requiresAuth: true,
    });
    console.log('[DM API] Search response:', response);
    
    // Handle various response formats
    if (response?.result?.items) {
      return response.result;
    }
    if (response?.result && Array.isArray(response.result)) {
      return { items: response.result, totalCount: response.result.length, hasMore: response.result.length >= limit };
    }
    if (Array.isArray(response)) {
      return { items: response, totalCount: response.length, hasMore: response.length >= limit };
    }
    
    return { items: [], totalCount: 0, hasMore: false };
  } catch (error) {
    console.error('[DM API] Search failed:', error);
    return { items: [], totalCount: 0, hasMore: false };
  }
}

/**
 * Get a single conversation by ID
 * Uses /api/dm/{id} endpoint
 * @param conversationId - The conversation ID
 */
export async function getConversation(conversationId: string): Promise<DeHubConversation> {
  const response = await apiCall<{ result: DeHubConversation }>(`/api/dm/${conversationId}`, {
    requiresAuth: true,
  });
  return response.result;
}

/**
 * Create a new conversation with a user by sending an initial message
 * Uses POST /api/dm/tnx endpoint with recipient address
 * If no content is provided, returns a "virtual" conversation object for UI navigation
 * @param recipientAddress - Wallet address of the recipient
 * @param recipientUser - Optional user data for constructing virtual conversation
 */
export async function createConversation(
  recipientAddress: string,
  recipientUser?: Partial<DeHubUser>
): Promise<DeHubConversation> {
  console.log('[DM API] createConversation called', { recipientAddress, recipientUser });
  
  // Return a virtual/placeholder conversation for UI navigation
  // The actual conversation is created when the first message is sent
  const otherUser: DeHubUser = recipientUser ? {
    _id: recipientUser._id || recipientAddress,
    address: recipientAddress,
    username: recipientUser.username,
    displayName: recipientUser.displayName || recipientUser.display_name,
    avatarImageUrl: recipientUser.avatarImageUrl || recipientUser.avatarUrl,
    isVerified: recipientUser.isVerified || recipientUser.is_verified,
  } : {
    _id: recipientAddress,
    address: recipientAddress,
  };
  
  const virtualConversation: DeHubConversation = {
    id: `new_${recipientAddress}`,
    participants: [otherUser],
    otherUser,
    lastMessage: undefined,
    unreadCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  console.log('[DM API] Created virtual conversation:', virtualConversation);
  return virtualConversation;
}

/**
 * Delete a conversation / messages
 * Uses /api/dm/delete-messages endpoint
 * @param conversationId - The conversation ID to delete
 */
export async function deleteConversation(conversationId: string): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>("/api/dm/delete-messages", {
    method: "POST",
    body: { conversationId },
    requiresAuth: true,
  });
}

/**
 * Fetch messages in a conversation
 * Uses /api/dm/messages/{id} endpoint
 * @param conversationId - The conversation ID
 * @param page - Page number (0-indexed)
 * @param limit - Items per page
 */
export async function getMessages(
  conversationId: string,
  page: number = 0,
  limit: number = 30
): Promise<{ items: DeHubDMMessage[]; totalCount: number; hasMore: boolean }> {
  console.log('[DM API] getMessages called', { conversationId, page, limit });
  
  // Skip API call for virtual/new conversations - they have no messages yet
  if (conversationId.startsWith('new_')) {
    console.log('[DM API] Virtual conversation - returning empty messages');
    return { items: [], totalCount: 0, hasMore: false };
  }
  
  try {
    const response = await apiCall<any>(`/api/dm/messages/${conversationId}`, {
      params: { page, limit },
      requiresAuth: true,
    });
    console.log('[DM API] getMessages raw response:', response);
    
    // Handle various response formats
    let items: DeHubDMMessage[] = [];
    
    // Format 1: { result: { items: [...] } }
    if (response?.result?.items && Array.isArray(response.result.items)) {
      items = response.result.items;
      const hasMore = response.result.hasMore ?? items.length >= limit;
      return { items, totalCount: response.result.totalCount || items.length, hasMore };
    }
    // Format 2: { result: [...] }
    if (response?.result && Array.isArray(response.result)) {
      items = response.result;
      return { items, totalCount: items.length, hasMore: items.length >= limit };
    }
    // Format 3: Direct array
    if (Array.isArray(response)) {
      items = response;
      return { items, totalCount: items.length, hasMore: items.length >= limit };
    }
    // Format 4: { items: [...] }
    if (response?.items && Array.isArray(response.items)) {
      items = response.items;
      return { items, totalCount: response.totalCount || items.length, hasMore: response.hasMore ?? items.length >= limit };
    }
    
    console.warn('[DM API] Unknown response format for getMessages:', response);
    return { items: [], totalCount: 0, hasMore: false };
  } catch (error) {
    console.error('[DM API] getMessages failed:', error);
    return { items: [], totalCount: 0, hasMore: false };
  }
}

/**
 * Send a message in a conversation
 * Uses /api/dm/upload endpoint with FormData for sending messages
 * @param conversationId - The conversation ID (or 'new_{address}' for new conversations)
 * @param content - Message content
 * @param type - Message type (text, image, gif, audio, video, tip)
 * @param mediaUrl - Optional media URL for images/gifs/audio/video
 * @param tipAmount - Optional tip amount for tip messages
 * @param tipCurrency - Optional tip currency (default: DHB)
 */
export async function sendMessage(
  conversationId: string,
  content: string,
  type: DMMessageType = 'text',
  mediaUrl?: string,
  tipAmount?: number,
  tipCurrency?: string
): Promise<DeHubDMMessage> {
  console.log('[DM API] sendMessage called', { conversationId, content: content.substring(0, 50), type, mediaUrl });
  
  const token = getAuthToken();
  if (!token) {
    throw new Error("Authentication required");
  }
  
  // Check if this is a new/virtual conversation
  const isNewConversation = conversationId.startsWith('new_');
  const recipientAddress = isNewConversation ? conversationId.replace('new_', '') : undefined;
  
  try {
    // Get the sender's wallet address from localStorage
    const senderAddress = localStorage.getItem('dehub_wallet');
    if (!senderAddress) {
      throw new Error("Wallet address not found. Please reconnect your wallet.");
    }
    
    const sender = senderAddress.toLowerCase();
    const hasMedia = !!mediaUrl || (type !== 'text' && type !== 'tip');
    
    let data: any;
    
    if (!hasMedia) {
      // TEXT / TIP messages → JSON via /api/dm/tnx
      const body: Record<string, unknown> = {
        sender,
        content,
        type,
      };
      
      if (isNewConversation && recipientAddress) {
        body.receiver = recipientAddress.toLowerCase();
        console.log('[DM API] Sending text to new conversation with recipient:', recipientAddress);
      } else {
        body.conversationId = conversationId;
      }
      
      if (type === 'tip' && tipAmount !== undefined) {
        body.tipAmount = tipAmount;
        body.tipCurrency = tipCurrency || 'DHB';
      }
      
      console.log('[DM API] Sending text message via /api/dm/tnx');
      data = await apiCall<any>('/api/dm/tnx', {
        method: 'POST',
        body,
        requiresAuth: true,
      });
    } else {
      // MEDIA messages → FormData via /api/dm/upload
      const formData = new FormData();
      formData.append('content', content);
      formData.append('type', type);
      formData.append('sender', sender);
      
      if (isNewConversation && recipientAddress) {
        formData.append('receiver', recipientAddress.toLowerCase());
        console.log('[DM API] Sending media to new conversation with recipient:', recipientAddress);
      } else {
        formData.append('conversationId', conversationId);
      }
      
      if (mediaUrl) {
        formData.append('mediaUrl', mediaUrl);
      }
      
      console.log('[DM API] Sending media message via /api/dm/upload');
      const response = await fetch(`${DEHUB_API_BASE}/api/dm/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[DM API] sendMessage upload error response:', errorData);
        throw new Error(errorData.message || 'Failed to send message');
      }
      
      data = await response.json();
    }
    
    console.log('[DM API] sendMessage response:', data);
    
    // Handle various response formats
    if (data?.result) {
      return data.result;
    }
    if (data?._id || data?.id) {
      return {
        id: data._id || data.id,
        conversationId: data.conversationId || conversationId,
        sender: data.sender,
        content: data.content || content,
        type: data.type || type,
        mediaUrl: data.mediaUrl,
        createdAt: data.createdAt || new Date().toISOString(),
      };
    }
    if (data?.message && typeof data.message === 'object') {
      return data.message;
    }
    
    console.warn('[DM API] Unknown response format for sendMessage:', data);
    throw new Error('Invalid response from sendMessage');
  } catch (error) {
    console.error('[DM API] sendMessage failed:', error);
    throw error;
  }
}

/**
 * Mark all messages in a conversation as read
 * Uses PUT /api/dm/tnx endpoint
 * @param conversationId - The conversation ID
 */
export async function markConversationAsRead(conversationId: string): Promise<{ success: boolean }> {
  console.log('[DM API] markConversationAsRead called', { conversationId });
  
  // Skip for virtual/new conversations
  if (conversationId.startsWith('new_')) {
    console.log('[DM API] Virtual conversation - skipping mark as read');
    return { success: true };
  }
  
  try {
    const response = await apiCall<any>("/api/dm/tnx", {
      method: "PUT",
      body: { conversationId, read: true },
      requiresAuth: true,
    });
    console.log('[DM API] markConversationAsRead response:', response);
    
    // Handle various response formats
    if (response?.success !== undefined) {
      return { success: response.success };
    }
    if (response?.result?.success !== undefined) {
      return { success: response.result.success };
    }
    // Assume success if no error was thrown
    return { success: true };
  } catch (error) {
    console.error('[DM API] markConversationAsRead failed:', error);
    return { success: false };
  }
}

/**
 * Get user's DM contacts
 * Uses /api/dm/contacts/{address} endpoint
 * @param address - User wallet address
 * @param page - Page number
 * @param limit - Items per page
 */
export async function getDMContacts(
  address: string,
  page: number = 0,
  limit: number = 10
): Promise<{ items: DeHubUser[]; hasMore: boolean }> {
  const response = await apiCall<{ result: { items: DeHubUser[]; hasMore: boolean } }>(`/api/dm/contacts/${address}`, {
    params: { page, limit },
    requiresAuth: true,
  });
  return response.result || { items: [], hasMore: false };
}

/**
 * Get user's online status for DM
 * Uses /api/dm/user-status/{address} endpoint
 * @param address - User wallet address
 */
export async function getDMUserStatus(address: string): Promise<{ online: boolean; lastSeen?: string }> {
  const response = await apiCall<{ result: { online: boolean; lastSeen?: string } }>(`/api/dm/user-status/${address}`, {
    requiresAuth: true,
  });
  return response.result || { online: false };
}

/**
 * Search users for starting a new conversation
 * Uses /api/search endpoint with type=accounts
 * @param query - Search query (username or display name) - must be at least 2 characters
 * @param page - Page number
 * @param limit - Items per page
 */
export async function searchUsersForDM(
  query: string,
  page: number = 0,
  limit: number = 10
): Promise<{ items: DeHubUser[]; hasMore: boolean }> {
  // Guard: API requires a non-empty query for regex matching
  const trimmedQuery = query?.trim();
  if (!trimmedQuery || trimmedQuery.length < 2) {
    return { items: [], hasMore: false };
  }
  
  console.log('[DM API] searchUsersForDM called', { query: trimmedQuery, page, limit });
  
  try {
    // Use /api/search with type=accounts to search for users
    const response = await apiCall<any>("/api/search", {
      params: { q: trimmedQuery, type: 'accounts', page, unit: limit },
      requiresAuth: true,
    });
    
    console.log('[DM API] searchUsersForDM response:', response);
    
    // Handle various response formats
    let accounts: DeHubUser[] = [];
    
    // Format 1: { result: { accounts: [...] } }
    if (response?.result?.accounts && Array.isArray(response.result.accounts)) {
      accounts = response.result.accounts;
    }
    // Format 2: { accounts: [...] }
    else if (response?.accounts && Array.isArray(response.accounts)) {
      accounts = response.accounts;
    }
    // Format 3: { result: [...] }
    else if (response?.result && Array.isArray(response.result)) {
      accounts = response.result;
    }
    // Format 4: Direct array
    else if (Array.isArray(response)) {
      accounts = response;
    }
    
    // Map accounts to DeHubUser format if needed
    const items: DeHubUser[] = accounts.map((acc: any) => ({
      _id: acc._id || acc.id,
      id: acc.id || acc._id,
      address: acc.address,
      username: acc.username,
      displayName: acc.displayName || acc.display_name,
      display_name: acc.display_name || acc.displayName,
      avatarImageUrl: acc.avatarImageUrl || acc.avatarUrl,
      avatarUrl: acc.avatarUrl || acc.avatarImageUrl,
      isVerified: acc.isVerified || acc.verified,
      is_verified: acc.is_verified || acc.verified,
      bio: acc.bio,
      dmSettings: acc.dmSettings,
    }));
    
  console.log('[DM API] searchUsersForDM returning', { count: items.length });
    return { 
      items, 
      hasMore: items.length >= limit 
    };
  } catch (error) {
    console.error('[DM API] searchUsersForDM failed:', error);
    return { items: [], hasMore: false };
  }
}

// ============================================
// DM: BLOCK / UNBLOCK
// ============================================

/**
 * Block a user/conversation
 * POST /api/dm/block
 */
export async function blockConversation(conversationId: string): Promise<{ success: boolean }> {
  console.log('[DM API] blockConversation called', { conversationId });
  
  try {
    const response = await apiCall<any>("/api/dm/block", {
      method: "POST",
      body: { conversationId },
      requiresAuth: true,
    });
    console.log('[DM API] blockConversation response:', response);
    
    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] blockConversation failed:', error);
    throw error;
  }
}

/**
 * Unblock a conversation
 * GET /api/dm/un-block/{conversationId}
 */
export async function unblockConversation(conversationId: string): Promise<{ success: boolean }> {
  console.log('[DM API] unblockConversation called', { conversationId });
  
  try {
    const response = await apiCall<any>(`/api/dm/un-block/${conversationId}`, {
      method: "GET",
      requiresAuth: true,
    });
    console.log('[DM API] unblockConversation response:', response);
    
    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] unblockConversation failed:', error);
    throw error;
  }
}

// ============================================
// DM: GROUP CHAT
// ============================================

/**
 * Create a new group chat
 * POST /api/dm/group
 * @param name - Group name
 * @param memberAddresses - Array of wallet addresses to add to the group
 * @param description - Optional group description
 */
export async function createGroup(
  name: string,
  memberAddresses: string[],
  description?: string
): Promise<DeHubConversation> {
  console.log('[DM API] createGroup called', { name, memberAddresses, description });
  
  const token = getAuthToken();
  if (!token) {
    throw new Error("Authentication required");
  }
  
  try {
    const response = await apiCall<any>("/api/dm/group", {
      method: "POST",
      body: {
        name,
        members: JSON.stringify(memberAddresses),
        description,
      },
      requiresAuth: true,
    });
    console.log('[DM API] createGroup response:', response);
    
    // Handle response formats
    if (response?.result) {
      return response.result;
    }
    if (response?.id || response?._id) {
      return {
        id: response._id || response.id,
        participants: response.members || [],
        unreadCount: 0,
        createdAt: response.createdAt || new Date().toISOString(),
        updatedAt: response.updatedAt || new Date().toISOString(),
        isGroup: true,
        groupInfo: {
          id: response._id || response.id,
          name: response.name || name,
          description: response.description,
          creatorAddress: response.creatorAddress,
          memberCount: memberAddresses.length,
          createdAt: response.createdAt || new Date().toISOString(),
          updatedAt: response.updatedAt || new Date().toISOString(),
        },
      };
    }
    
    throw new Error('Invalid response from createGroup');
  } catch (error) {
    console.error('[DM API] createGroup failed:', error);
    throw error;
  }
}

/**
 * Get group info
 * POST /api/dm/group/info
 */
export async function getGroupInfo(groupId: string): Promise<GroupInfo> {
  console.log('[DM API] getGroupInfo called', { groupId });
  
  try {
    const response = await apiCall<any>("/api/dm/group/info", {
      method: "POST",
      body: { groupId },
      requiresAuth: true,
    });
    console.log('[DM API] getGroupInfo response:', response);
    
    if (response?.result) {
      return response.result;
    }
    return response;
  } catch (error) {
    console.error('[DM API] getGroupInfo failed:', error);
    throw error;
  }
}

/**
 * Join a group chat
 * POST /api/dm/group/join
 */
export async function joinGroup(groupId: string): Promise<{ success: boolean }> {
  console.log('[DM API] joinGroup called', { groupId });
  
  try {
    const response = await apiCall<any>("/api/dm/group/join", {
      method: "POST",
      body: { groupId },
      requiresAuth: true,
    });
    console.log('[DM API] joinGroup response:', response);
    
    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] joinGroup failed:', error);
    throw error;
  }
}

/**
 * Update group info
 * PUT /api/dm/group
 */
export async function updateGroup(
  groupId: string,
  updates: { name?: string; description?: string; avatarUrl?: string }
): Promise<GroupInfo> {
  console.log('[DM API] updateGroup called', { groupId, updates });
  
  try {
    const response = await apiCall<any>("/api/dm/group", {
      method: "PUT",
      body: { groupId, ...updates },
      requiresAuth: true,
    });
    console.log('[DM API] updateGroup response:', response);
    
    if (response?.result) {
      return response.result;
    }
    return response;
  } catch (error) {
    console.error('[DM API] updateGroup failed:', error);
    throw error;
  }
}

/**
 * Leave a group chat
 * POST /api/dm/group-user-exit
 */
export async function leaveGroup(groupId: string): Promise<{ success: boolean }> {
  console.log('[DM API] leaveGroup called', { groupId });
  
  try {
    const response = await apiCall<any>("/api/dm/group-user-exit", {
      method: "POST",
      body: { groupId },
      requiresAuth: true,
    });
    console.log('[DM API] leaveGroup response:', response);
    
    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] leaveGroup failed:', error);
    throw error;
  }
}

/**
 * Block a user in a group chat (admin action)
 * POST /api/dm/group-user-block
 */
export async function blockUserInGroup(
  groupId: string,
  userAddress: string
): Promise<{ success: boolean }> {
  console.log('[DM API] blockUserInGroup called', { groupId, userAddress });
  
  try {
    const response = await apiCall<any>("/api/dm/group-user-block", {
      method: "POST",
      body: { groupId, userAddress },
      requiresAuth: true,
    });
    console.log('[DM API] blockUserInGroup response:', response);
    
    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] blockUserInGroup failed:', error);
    throw error;
  }
}

// ============================================
// DM: MEDIA UPLOAD
// ============================================

/**
 * Upload an image for chat/DM
 * POST /api/chat-image
 * @param file - The image file to upload
 * @returns The URL of the uploaded image
 */
export async function uploadChatImage(file: File): Promise<{ url: string }> {
  console.log('[DM API] uploadChatImage called', { fileName: file.name, size: file.size });
  
  const token = getAuthToken();
  if (!token) {
    throw new Error("Authentication required");
  }
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${DEHUB_API_BASE}/api/chat-image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to upload image');
    }
    
    const data = await response.json();
    console.log('[DM API] uploadChatImage response:', data);
    
    // Handle various response formats
    const url = data?.result?.url || data?.url || data?.imageUrl || data?.result?.imageUrl;
    
    if (!url) {
      throw new Error('No URL returned from image upload');
    }
    
    return { url };
  } catch (error) {
    console.error('[DM API] uploadChatImage failed:', error);
    throw error;
  }
}

// ============================================
// DM: USER STATUS
// ============================================

/**
 * Get user's online status
 * GET /api/dm/user-status/{address}
 */
export async function getUserOnlineStatus(address: string): Promise<UserOnlineStatus> {
  console.log('[DM API] getUserOnlineStatus called', { address });
  
  try {
    const response = await apiCall<any>(`/api/dm/user-status/${address}`, {
      method: "GET",
      requiresAuth: true,
    });
    console.log('[DM API] getUserOnlineStatus response:', response);
    
    const result = response?.result || response;
    return {
      address,
      online: result?.online ?? false,
      lastSeen: result?.lastSeen,
    };
  } catch (error) {
    console.error('[DM API] getUserOnlineStatus failed:', error);
    return { address, online: false };
  }
}

/**
 * Update user's online status (heartbeat)
 * POST /api/dm/user-status/{address}
 */
export async function updateUserOnlineStatus(address: string): Promise<{ success: boolean }> {
  console.log('[DM API] updateUserOnlineStatus called', { address });
  
  try {
    const response = await apiCall<any>(`/api/dm/user-status/${address}`, {
      method: "POST",
      body: {},
      requiresAuth: true,
    });
    console.log('[DM API] updateUserOnlineStatus response:', response);
    
    return { success: response?.success !== false };
  } catch (error) {
    console.error('[DM API] updateUserOnlineStatus failed:', error);
    return { success: false };
  }
}

// ============================================
// DM: SUBSCRIPTION-GATED DMs
// ============================================

/**
 * Get DM settings for a subscription plan
 * GET /api/dm/plan/{planId}
 */
export async function getDMPlanSettings(planId: string): Promise<{
  enabled: boolean;
  minTipDhb?: number;
  allowedMessageTypes?: DMMessageType[];
}> {
  console.log('[DM API] getDMPlanSettings called', { planId });
  
  try {
    const response = await apiCall<any>(`/api/dm/plan/${planId}`, {
      method: "GET",
      requiresAuth: true,
    });
    console.log('[DM API] getDMPlanSettings response:', response);
    
    return response?.result || response || { enabled: true };
  } catch (error) {
    console.error('[DM API] getDMPlanSettings failed:', error);
    return { enabled: true };
  }
}

/**
 * Get DM videos (videos shared in DMs)
 * GET /api/dm/dm-videos
 */
export async function getDMVideos(
  page: number = 0,
  limit: number = 20
): Promise<{ items: DeHubNFT[]; hasMore: boolean }> {
  console.log('[DM API] getDMVideos called', { page, limit });
  
  try {
    const response = await apiCall<any>("/api/dm/dm-videos", {
      params: { page, limit },
      requiresAuth: true,
    });
    console.log('[DM API] getDMVideos response:', response);
    
    // Handle various response formats
    if (response?.result?.items) {
      return response.result;
    }
    if (response?.result && Array.isArray(response.result)) {
      return { items: response.result, hasMore: response.result.length >= limit };
    }
    if (Array.isArray(response)) {
      return { items: response, hasMore: response.length >= limit };
    }
    
    return { items: [], hasMore: false };
  } catch (error) {
    console.error('[DM API] getDMVideos failed:', error);
    return { items: [], hasMore: false };
  }
}

// ============================================================
// MINT/POST API
// ============================================================

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
  postType: 'video' | 'feed-images' | 'feed-simple' | 'live';
  chainId: number;
  category: string[];
  streamInfo?: StreamInfo;
  plans?: string[];
  files?: File[];
  thumbnail?: Blob;
  /** Minter's wallet address - required for signature generation */
  minterAddress: string;
}

export interface MintResponse {
  r: string;
  s: string;
  v: number;
  createdTokenId: string;
  timestamp: number;
}

/**
 * Mint/upload a new post to DeHub
 * Step 1 of the 2-step minting process
 */
export async function mintPost(params: MintPostParams): Promise<MintResponse> {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Authentication required");
  }

  const formData = new FormData();
  formData.append('name', params.name);
  formData.append('description', params.description);
  formData.append('postType', params.postType);
  formData.append('chainId', String(params.chainId));
  formData.append('category', JSON.stringify(params.category));
  
  // Include minter address for signature generation
  // The backend needs this to generate a signature that includes msg.sender
  formData.append('minter', params.minterAddress);
  console.log('[MintPost] Including minter address:', params.minterAddress);
  
  // Add streamInfo for monetization settings
  const streamInfo: StreamInfo = params.streamInfo || {
    isLockContent: false,
    isPayPerView: false,
    isAddBounty: false,
  };
  formData.append('streamInfo', JSON.stringify(streamInfo));
  
  // Add plans if provided (for gated content)
  if (params.plans && params.plans.length > 0) {
    formData.append('plans', JSON.stringify(params.plans));
  }

  // Add media files
  if (params.files && params.files.length > 0) {
    params.files.forEach((file) => {
      formData.append('file', file);
    });
  }

  // Add thumbnail for videos
  if (params.thumbnail) {
    formData.append('file', params.thumbnail, 'thumbnail.jpg');
  }

  const response = await fetch(`${DEHUB_API_BASE}/api/user_mint`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Mint failed: ${response.status}`);
  }

  const data = await response.json();
  
  // Handle wrapped response
  if (data.result) {
    return data.result;
  }
  
  return data;
}

// ============================================
// EDIT & DELETE POST API
// ============================================

/**
 * Edit post details (title, description, categories)
 * PATCH /api/nft/{tokenId}
 * Only the content creator (minter) can edit their own content.
 * All fields are optional — only the fields you send will be updated.
 */
export interface EditPostParams {
  /** Post title (max 140 characters) */
  name?: string;
  /** Post description (max 500 characters) */
  description?: string;
  /** Array of category names */
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

/**
 * Soft delete content
 * DELETE /api/nft/{tokenId}
 * Only the content creator (minter) can delete their own content.
 */
export async function deletePost(tokenId: number | string): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>(`/api/nft/${tokenId}`, {
    method: "DELETE",
    requiresAuth: true,
  });
}

// Token visibility types
export type TokenVisibility = 'public' | 'private' | 'unlisted';

export interface TokenVisibilityResponse {
  status: boolean;
  message?: string;
  result?: {
    tokenId: number;
    visibility: TokenVisibility;
  };
}

/**
 * Update the visibility of a token/post
 * @param tokenId - The token ID to update
 * @param visibility - The new visibility setting: 'public', 'private', or 'unlisted'
 */
export async function updateTokenVisibility(
  tokenId: number | string,
  visibility: TokenVisibility
): Promise<TokenVisibilityResponse> {
  const token = getAuthToken();
  
  if (!token) {
    throw new Error("Authentication required");
  }

  // Convert visibility string to numeric status code (API expects numbers)
  const visibilityToStatus: Record<TokenVisibility, number> = {
    'public': 0,
    'private': 1,
    'unlisted': 2,
  };

  const response = await fetch(`${DEHUB_API_BASE}/api/token_visibility`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      tokenId: Number(tokenId),
      status: visibilityToStatus[visibility],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Failed to update visibility: ${response.status}`);
  }

  return response.json();
}

// ============= SUBSCRIPTIONS & PLANS API =============

/**
 * Subscription plan from the DeHub API
 */
export interface SubscriptionPlan {
  _id?: string;
  id?: string;
  creatorAddress: string;
  name: string;
  description?: string;
  price: number;
  currency: string; // e.g., "DHB", "USDC"
  duration: number; // Duration in days
  benefits?: string[];
  isActive?: boolean;
  subscriberCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * User subscription data
 */
export interface Subscription {
  _id?: string;
  id?: string;
  planId: string;
  plan?: SubscriptionPlan;
  subscriberAddress: string;
  creatorAddress: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  autoRenew?: boolean;
  transactionHash?: string;
  createdAt?: string;
}

/**
 * Get a specific subscription plan by ID
 * GET /api/plans/{id}
 */
export async function getPlan(planId: string): Promise<SubscriptionPlan> {
  const response = await apiCall<{ result: SubscriptionPlan } | SubscriptionPlan>(`/api/plans/${planId}`);
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as SubscriptionPlan;
}

/**
 * Get all plans for a creator
 * GET /api/plans with optional creator filter
 */
export async function getPlans(creatorAddress?: string): Promise<SubscriptionPlan[]> {
  const response = await apiCall<{ result: SubscriptionPlan[] } | SubscriptionPlan[]>("/api/plans", {
    params: creatorAddress ? { creator: creatorAddress } : {},
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  return Array.isArray(response) ? response : [];
}

/**
 * Get current user's plans (as a creator)
 * GET /api/plans with auth
 */
export async function getMyPlans(): Promise<SubscriptionPlan[]> {
  const response = await apiCall<{ result: SubscriptionPlan[] } | SubscriptionPlan[]>("/api/plans", {
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  return Array.isArray(response) ? response : [];
}

/**
 * Get current user's subscriptions (what they're subscribed to)
 * GET /api/subscription/me
 */
export async function getMySubscriptions(): Promise<Subscription[]> {
  const response = await apiCall<{ result: Subscription[] } | Subscription[]>("/api/subscription/me", {
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  return Array.isArray(response) ? response : [];
}

/**
 * Get a specific subscription by ID
 * GET /api/subscription/{id}
 */
export async function getSubscription(subscriptionId: string): Promise<Subscription> {
  const response = await apiCall<{ result: Subscription } | Subscription>(`/api/subscription/${subscriptionId}`, {
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as Subscription;
}

/**
 * Create a new subscription plan (as a creator)
 * POST /api/plans
 */
export async function createPlan(planData: {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  duration: number; // days
  benefits?: string[];
}): Promise<SubscriptionPlan> {
  console.log('[createPlan] Sending request with data:', JSON.stringify(planData));
  try {
    const response = await apiCall<{ result: SubscriptionPlan } | SubscriptionPlan>("/api/plans", {
      method: "POST",
      body: {
        ...planData,
        currency: planData.currency || "DHB",
      },
      requiresAuth: true,
    });
    console.log('[createPlan] Success response:', JSON.stringify(response));
    if (response && typeof response === 'object' && 'result' in response) {
      return response.result;
    }
    return response as SubscriptionPlan;
  } catch (err) {
    console.error('[createPlan] API error:', err);
    throw err;
  }
}

/**
 * Update an existing subscription plan
 * POST /api/plans/{id}
 */
export async function updatePlan(
  planId: string, 
  planData: Partial<{
    name: string;
    description: string;
    price: number;
    currency: string;
    duration: number;
    benefits: string[];
    isActive: boolean;
  }>
): Promise<SubscriptionPlan> {
  const response = await apiCall<{ result: SubscriptionPlan } | SubscriptionPlan>(`/api/plans/${planId}`, {
    method: "POST",
    body: planData,
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as SubscriptionPlan;
}

/**
 * Subscribe to a plan (buy subscription)
 * POST /api/plan/buy
 */
export async function buyPlan(planId: string): Promise<{ subscription: Subscription; transactionHash?: string }> {
  const response = await apiCall<{ result: { subscription: Subscription; transactionHash?: string } } | { subscription: Subscription; transactionHash?: string }>("/api/plan/buy", {
    method: "POST",
    body: { planId },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as { subscription: Subscription; transactionHash?: string };
}

/**
 * Check if user is subscribed to a specific creator
 */
export async function isSubscribedToCreator(creatorAddress: string): Promise<boolean> {
  try {
    const subscriptions = await getMySubscriptions();
    return subscriptions.some(
      sub => sub.creatorAddress.toLowerCase() === creatorAddress.toLowerCase() && sub.isActive
    );
  } catch {
    return false;
  }
}

// ============================================================================
// REACTIONS API - Comments, Votes, Follows
// ============================================================================

/**
 * Comment response from API
 */
export interface CommentResponse {
  id: string;
  tokenId: number;
  content: string;
  imageUrl?: string;
  address: string;
  createdAt: string;
  updatedAt: string;
  user?: DeHubUser;
  likeCount?: number;
  replyIds?: string[];
  parentId?: string | null;
}

/**
 * Add a text comment to a video/post
 * POST /api/request_comment
 */
export async function addComment(params: {
  tokenId: number;
  content: string;
  parentId?: string; // For replies
}): Promise<CommentResponse> {
  const response = await apiCall<{ result: CommentResponse } | CommentResponse>("/api/request_comment", {
    method: "POST",
    body: {
      tokenId: params.tokenId,
      content: params.content,
      parentId: params.parentId,
    },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as CommentResponse;
}

/**
 * Add a comment with an image attachment
 * POST /api/comment_image
 */
export async function addCommentWithImage(params: {
  tokenId: number;
  content?: string;
  imageUrl: string; // URL or base64 of the image
  parentId?: string;
}): Promise<CommentResponse> {
  const response = await apiCall<{ result: CommentResponse } | CommentResponse>("/api/comment_image", {
    method: "POST",
    body: {
      tokenId: params.tokenId,
      content: params.content || '',
      imageUrl: params.imageUrl,
      parentId: params.parentId,
    },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as CommentResponse;
}

/**
 * Vote response from API
 */
export interface VoteResponse {
  success: boolean;
  tokenId: number;
  voteType: 'for' | 'against' | null; // null means vote removed
  totalVotes?: {
    for: number;
    against: number;
  };
}

/**
 * Like or dislike a video/post (toggleable)
 * POST /api/request_vote
 * 
 * If user already voted the same way, the vote is removed (toggle off)
 * If user voted differently, the vote is switched
 */
export async function voteOnPost(params: {
  tokenId: number;
  voteType: 'for' | 'against'; // 'for' = like, 'against' = dislike
}): Promise<VoteResponse> {
  const response = await apiCall<{ result: VoteResponse; success?: boolean } | VoteResponse>("/api/request_vote", {
    method: "POST",
    body: {
      streamTokenId: params.tokenId,
      vote: params.voteType === 'for',
    },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response && typeof response.result === 'object') {
    return response.result;
  }
  return response as VoteResponse;
}

/**
 * Follow response from API
 */
export interface FollowResponse {
  success: boolean;
  isFollowing: boolean; // true if now following, false if unfollowed
  followerCount?: number;
}

/**
 * Follow or unfollow a user (toggleable)
 * POST /api/request_follow
 */
export async function toggleFollow(params: {
  targetAddress: string;
}): Promise<FollowResponse> {
  const response = await apiCall<{ result: FollowResponse } | FollowResponse>("/api/request_follow", {
    method: "POST",
    body: {
      address: params.targetAddress.toLowerCase(),
    },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as FollowResponse;
}

/**
 * Comment like response from API
 */
export interface CommentLikeResponse {
  success: boolean;
  commentId: string;
  isLiked: boolean; // true if now liked, false if unliked
  likeCount?: number;
}

/**
 * Like or unlike a comment (toggleable)
 * POST /api/like_comment
 */
export async function toggleCommentLike(params: {
  commentId: string;
}): Promise<CommentLikeResponse> {
  const response = await apiCall<{ result: CommentLikeResponse } | CommentLikeResponse>("/api/like_comment", {
    method: "POST",
    body: {
      commentId: params.commentId,
    },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as CommentLikeResponse;
}

/**
 * Edit comment response from API
 */
export interface EditCommentResponse {
  success: boolean;
  comment: CommentResponse;
}

/**
 * Edit an existing comment
 * POST /api/edit_comment
 */
export async function editComment(params: {
  commentId: string;
  content: string;
}): Promise<EditCommentResponse> {
  const response = await apiCall<{ result: EditCommentResponse } | EditCommentResponse>("/api/edit_comment", {
    method: "POST",
    body: {
      commentId: params.commentId,
      content: params.content,
    },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as EditCommentResponse;
}

// ==========================================
// LiveChat (Public Chat Rooms) API
// ==========================================

/**
 * LiveChat room from API
 */
export interface LiveChatRoom {
  id: string;
  name?: string;
  topic?: string;
  description?: string;
  participantCount?: number;
  messageCount?: number;
  createdAt?: string;
  settings?: Record<string, unknown>;
  moderators?: string[];
}

/**
 * LiveChat message from API
 */
export interface LiveChatMessage {
  id: string;
  roomId: string;
  content: string;
  type?: 'text' | 'image' | 'gif';
  imageUrl?: string;
  sender: {
    address: string;
    username?: string;
    displayName?: string;
    avatarImageUrl?: string;
  };
  isPinned?: boolean;
  createdAt: string;
}

/**
 * LiveChat user profile
 */
export interface LiveChatUserProfile {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  isBanned?: boolean;
  isModerator?: boolean;
}

/**
 * List available chat rooms
 * GET /api/livechat/rooms
 */
export async function getLiveChatRooms(): Promise<LiveChatRoom[]> {
  const response = await apiCall<Record<string, unknown>>("/api/livechat/rooms", {
    requiresAuth: false,
  });
  // API returns { rooms: [...], total: N }
  if (response && typeof response === 'object') {
    if ('rooms' in response && Array.isArray(response.rooms)) return response.rooms as LiveChatRoom[];
    if ('result' in response && Array.isArray(response.result)) return response.result as LiveChatRoom[];
  }
  if (Array.isArray(response)) return response as unknown as LiveChatRoom[];
  return [];
}

/**
 * Get room details
 * GET /api/livechat/rooms/{roomId}
 */
export async function getLiveChatRoom(roomId: string): Promise<LiveChatRoom> {
  const response = await apiCall<{ result: LiveChatRoom } | LiveChatRoom>(`/api/livechat/rooms/${roomId}`, {
    requiresAuth: false,
  });
  if (response && typeof response === 'object' && 'result' in response && !Array.isArray(response.result)) {
    return response.result;
  }
  return response as LiveChatRoom;
}

/**
 * Get messages from a room
 * GET /api/livechat/rooms/{roomId}/messages
 */
export async function getLiveChatMessages(
  roomId: string,
  params?: { page?: number; limit?: number; before?: string }
): Promise<LiveChatMessage[]> {
  const response = await apiCall<Record<string, unknown>>(
    `/api/livechat/rooms/${roomId}/messages`,
    {
      params: {
        page: params?.page,
        limit: params?.limit,
        before: params?.before,
      },
      requiresAuth: false,
    }
  );
  // API may return { messages: [...] } or { result: [...] }
  if (response && typeof response === 'object') {
    if ('messages' in response && Array.isArray(response.messages)) return response.messages as LiveChatMessage[];
    if ('result' in response && Array.isArray(response.result)) return response.result as LiveChatMessage[];
  }
  if (Array.isArray(response)) return response as unknown as LiveChatMessage[];
  return [];
}

/**
 * Get user chat profile
 * GET /api/livechat/user/{address}
 */
export async function getLiveChatUserProfile(address: string): Promise<LiveChatUserProfile> {
  const response = await apiCall<{ result: LiveChatUserProfile } | LiveChatUserProfile>(
    `/api/livechat/user/${address}`,
    { requiresAuth: false }
  );
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as LiveChatUserProfile;
}

/**
 * Create a topic-based chat room
 * POST /api/livechat/rooms/topic
 */
export async function createTopicRoom(params: {
  topic: string;
  description?: string;
}): Promise<LiveChatRoom> {
  const response = await apiCall<{ result: LiveChatRoom } | LiveChatRoom>("/api/livechat/rooms/topic", {
    method: "POST",
    body: params as Record<string, unknown>,
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as LiveChatRoom;
}

/**
 * Send a message to a livechat room
 * Uses the DM upload endpoint pattern for sending messages
 * POST /api/livechat/rooms/{roomId}/messages (if separate endpoint exists)
 * Falls back to a simulated send via the DM upload pattern
 */
export async function sendLiveChatMessage(
  roomId: string,
  content: string,
  type: 'text' | 'image' | 'gif' = 'text',
  imageUrl?: string
): Promise<LiveChatMessage> {
  const senderAddress = localStorage.getItem('dehub_wallet') || '';
  const body: Record<string, unknown> = {
    roomId,
    content,
    type,
    senderAddress: senderAddress.toLowerCase(),
  };
  if (imageUrl) body.imageUrl = imageUrl;

  const response = await apiCall<{ result: LiveChatMessage } | LiveChatMessage>(
    `/api/livechat/rooms/${roomId}/messages`,
    {
      method: "POST",
      body,
      requiresAuth: true,
    }
  );
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as LiveChatMessage;
}

/**
 * Pin a message
 * POST /api/livechat/rooms/{roomId}/messages/{messageId}/pin
 */
export async function pinLiveChatMessage(roomId: string, messageId: string): Promise<void> {
  await apiCall(`/api/livechat/rooms/${roomId}/messages/${messageId}/pin`, {
    method: "POST",
    requiresAuth: true,
  });
}

/**
 * Unpin a message
 * DELETE /api/livechat/rooms/{roomId}/messages/{messageId}/pin
 */
export async function unpinLiveChatMessage(roomId: string, messageId: string): Promise<void> {
  await apiCall(`/api/livechat/rooms/${roomId}/messages/${messageId}/pin`, {
    method: "DELETE",
    requiresAuth: true,
  });
}

/**
 * Ban a user from a room
 * POST /api/livechat/rooms/{roomId}/ban
 */
export async function banLiveChatUser(roomId: string, userAddress: string): Promise<void> {
  await apiCall(`/api/livechat/rooms/${roomId}/ban`, {
    method: "POST",
    body: { address: userAddress.toLowerCase() },
    requiresAuth: true,
  });
}

/**
 * Unban a user from a room
 * DELETE /api/livechat/rooms/{roomId}/ban/{userAddress}
 */
export async function unbanLiveChatUser(roomId: string, userAddress: string): Promise<void> {
  await apiCall(`/api/livechat/rooms/${roomId}/ban/${userAddress.toLowerCase()}`, {
    method: "DELETE",
    requiresAuth: true,
  });
}

/**
 * Add a moderator to a room
 * POST /api/livechat/rooms/{roomId}/moderators
 */
export async function addLiveChatModerator(roomId: string, userAddress: string): Promise<void> {
  await apiCall(`/api/livechat/rooms/${roomId}/moderators`, {
    method: "POST",
    body: { address: userAddress.toLowerCase() },
    requiresAuth: true,
  });
}

/**
 * Update room settings
 * PATCH /api/livechat/rooms/{roomId}/settings
 */
export async function updateLiveChatRoomSettings(
  roomId: string,
  settings: Record<string, unknown>
): Promise<LiveChatRoom> {
  const response = await apiCall<{ result: LiveChatRoom } | LiveChatRoom>(
    `/api/livechat/rooms/${roomId}/settings`,
    {
      method: "PATCH",
      body: settings,
      requiresAuth: true,
    }
  );
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as LiveChatRoom;
}

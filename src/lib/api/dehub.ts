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
  following_count?: number;
  likes?: number | number[];
  uploads?: number;
  post_count?: number;
  sentTips?: number;
  receivedTips?: number;
  unlocked?: number[];

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
  mintername?: string;
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

  // PPV/Live
  is_live?: boolean;
  is_ppv?: boolean;
  ppv_price?: number;

  // User interaction state (returned when address param is provided)
  isLiked?: boolean;
  isDisliked?: boolean;
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
  media_type?: "video" | "image" | "audio" | "live";
  search?: string;
  /** Connected wallet address to get isLiked/isDisliked info */
  address?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// Store auth token
let authToken: string | null = null;

// Token expiry duration in milliseconds (24 hours)
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    localStorage.setItem("dehub_token", token);
    localStorage.setItem("dehub_token_timestamp", String(Date.now()));
  } else {
    localStorage.removeItem("dehub_token");
    localStorage.removeItem("dehub_token_timestamp");
  }
};

export const getAuthToken = (): string | null => {
  if (!authToken) {
    authToken = localStorage.getItem("dehub_token");
  }
  return authToken;
};

export const isTokenExpired = (): boolean => {
  const timestamp = localStorage.getItem("dehub_token_timestamp");
  if (!timestamp) return true;
  
  const tokenAge = Date.now() - parseInt(timestamp, 10);
  return tokenAge >= TOKEN_EXPIRY_MS;
};

export const clearAuthSession = () => {
  authToken = null;
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
    throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
  }

  return response.json();
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

// NFT/Content functions
export async function searchNFTs(params: SearchNFTsParams = {}): Promise<PaginatedResponse<DeHubNFT>> {
  return apiCall<PaginatedResponse<DeHubNFT>>("/api/search_nfts", {
    params: {
      page: params.page,
      unit: params.unit,
      category: params.category,
      sortMode: params.sortMode,
      creator_id: params.creator_id,
      media_type: params.media_type,
      search: params.search,
      address: params.address,
    },
  });
}

export async function getNFTInfo(tokenId: string): Promise<DeHubNFT> {
  return apiCall<DeHubNFT>(`/api/nft_info/${tokenId}`);
}

export async function getNFTComments(
  tokenId: string,
  page: number = 1,
  limit: number = 20,
): Promise<PaginatedResponse<DeHubComment>> {
  return apiCall<PaginatedResponse<DeHubComment>>(`/api/nft/${tokenId}/comments`, {
    params: { page, limit },
  });
}

export async function recordView(tokenId: string): Promise<void> {
  return apiCall<void>(`/api/record-view/${tokenId}`, {
    method: "POST",
  });
}

// User functions
export async function getAccountInfo(userId: string): Promise<DeHubUser> {
  const response = await apiCall<{ result: DeHubUser } | DeHubUser>(`/api/account_info/${encodeURIComponent(userId)}`);
  // Handle wrapped response from API
  if (response && typeof response === "object" && "result" in response) {
    return response.result;
  }
  return response as DeHubUser;
}

export async function getAccountByUsername(username: string): Promise<DeHubUser> {
  // Remove @ prefix if present
  const cleanUsername = username.replace("@", "");
  const response = await apiCall<{ result: DeHubUser } | DeHubUser>(`/api/account_info/${encodeURIComponent(cleanUsername)}`);
  // Handle wrapped response from API
  if (response && typeof response === "object" && "result" in response) {
    return response.result;
  }
  return response as DeHubUser;
}

export async function updateProfile(
  data: Partial<Pick<DeHubUser, "username" | "display_name" | "bio" | "avatar_url" | "cover_url">>,
): Promise<DeHubUser> {
  return apiCall<DeHubUser>("/api/update_profile", {
    method: "POST",
    body: data,
    requiresAuth: true,
  });
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
export async function voteOnNFT(tokenId: string, voteType: "like" | "dislike"): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>("/api/request_vote", {
    method: "POST",
    body: { token_id: tokenId, vote_type: voteType },
    requiresAuth: true,
  });
}

export async function followUser(userId: string): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>("/api/request_follow", {
    method: "POST",
    body: { user_id: userId },
    requiresAuth: true,
  });
}

export async function unfollowUser(userId: string): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>("/api/request_unfollow", {
    method: "POST",
    body: { user_id: userId },
    requiresAuth: true,
  });
}

export async function postComment(tokenId: string, content: string, parentId?: string): Promise<DeHubComment> {
  return apiCall<DeHubComment>("/api/request_comment", {
    method: "POST",
    body: { token_id: tokenId, content, parent_id: parentId },
    requiresAuth: true,
  });
}

// Bookmark functions
export async function savePost(tokenId: string): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>("/api/savePost", {
    method: "POST",
    body: { token_id: tokenId },
    requiresAuth: true,
  });
}

export async function getSavedPosts(page: number = 1, limit: number = 20): Promise<PaginatedResponse<DeHubNFT>> {
  return apiCall<PaginatedResponse<DeHubNFT>>("/api/savedPosts", {
    params: { page, limit },
    requiresAuth: true,
  });
}

// Category functions
export async function getCategories(): Promise<DeHubCategory[]> {
  return apiCall<DeHubCategory[]>("/api/get_categories");
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

// Livestream functions
export async function startLivestream(data: {
  title: string;
  description?: string;
  category?: string;
  thumbnail_url?: string;
}): Promise<{
  stream_key: string;
  ingest_url: string;
  playback_url: string;
}> {
  return apiCall("/api/live/start", {
    method: "POST",
    body: data,
    requiresAuth: true,
  });
}

export async function endLivestream(): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>("/api/live/end", {
    method: "POST",
    requiresAuth: true,
  });
}

// DHB Price
export async function getDHBPrice(): Promise<{ price: number; change_24h: number }> {
  return apiCall<{ price: number; change_24h: number }>("/api/dpay/price");
}

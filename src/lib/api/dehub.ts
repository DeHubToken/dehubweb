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

  // Follow relationship (returned when address param is provided)
  isFollowing?: boolean;   // Viewer follows this user
  followsYou?: boolean;    // This user follows viewer

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

  // PPV/Live/Content Access
  is_live?: boolean;
  is_ppv?: boolean;
  ppv_price?: number;
  ppv_currency?: string;
  is_w2e?: boolean;
  is_locked?: boolean;

  // User interaction state (returned when address param is provided)
  isLiked?: boolean;
  isDisliked?: boolean;

  // Blockchain data
  chainId?: number; // 8453 for Base, 56 for BSC/BNB
  mintTxHash?: string; // Transaction hash of the mint
  status?: string; // "minted", "pending", etc.
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

// NFT/Content functions
export async function searchNFTs(params: SearchNFTsParams = {}): Promise<PaginatedResponse<DeHubNFT>> {
  const response = await apiCall<{ result: DeHubNFT[] } | PaginatedResponse<DeHubNFT>>("/api/search_nfts", {
    params: {
      page: params.page,
      unit: params.unit,
      category: params.category,
      sortMode: params.sortMode,
      creator_id: params.creator_id,
      postType: params.postType,
      search: params.search,
      address: params.address,
    },
  });
  
  // Handle wrapped response from API (returns { result: [...] })
  if (response && typeof response === 'object' && 'result' in response && Array.isArray(response.result)) {
    return {
      data: response.result,
      total: response.result.length,
      page: params.page || 0,
      limit: params.unit || 10,
      has_more: response.result.length === (params.unit || 10),
    };
  }
  
  return response as PaginatedResponse<DeHubNFT>;
}

export async function getNFTInfo(tokenId: string): Promise<DeHubNFT> {
  const response = await apiCall<{ result: DeHubNFT } | DeHubNFT>(`/api/nft_info/${tokenId}`);
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
): Promise<ApiCommentResponse[]> {
  const response = await apiCall<CommentsApiResponse>(`/api/nft/${tokenId}/comments`, {
    params: { page, limit },
  });
  return response.result?.items || [];
}

export async function recordView(tokenId: string): Promise<void> {
  return apiCall<void>(`/api/record-view/${tokenId}`, {
    method: "POST",
  });
}

// User functions
export async function getAccountInfo(userId: string, viewerAddress?: string): Promise<DeHubUser> {
  const params: Record<string, string> = {};
  if (viewerAddress) {
    params.address = viewerAddress;
  }
  const response = await apiCall<{ result: DeHubUser } | DeHubUser>(`/api/account_info/${encodeURIComponent(userId)}`, { params });
  // Handle wrapped response from API
  if (response && typeof response === "object" && "result" in response) {
    return response.result;
  }
  return response as DeHubUser;
}

export async function getAccountByUsername(username: string, viewerAddress?: string): Promise<DeHubUser> {
  // Remove @ prefix if present
  const cleanUsername = username.replace("@", "");
  const params: Record<string, string> = {};
  if (viewerAddress) {
    params.address = viewerAddress;
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
  success: boolean;
  message?: string;
}

/**
 * Cast a vote (like or dislike) on a video
 * Uses GET /api/request_vote?streamTokenId={tokenId}&vote={true|false}
 * 
 * @param tokenId - The token ID of the video to vote on
 * @param vote - true for like, false for dislike
 * @returns VoteResponse with success status
 * @throws Error with message "already_voted" if user has already voted (409)
 */
export async function voteOnNFT(tokenId: string, vote: boolean): Promise<VoteResponse> {
  return apiCall<VoteResponse>("/api/request_vote", {
    method: "GET",
    params: {
      streamTokenId: tokenId,
      vote: String(vote),
    },
    requiresAuth: true,
  });
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

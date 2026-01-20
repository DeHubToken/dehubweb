import { supabase } from '@/integrations/supabase/client';

// DeHub CDN base URL for media assets
export const DEHUB_CDN_BASE = 'https://content.dehub.io/';

/**
 * Convert relative media paths to absolute CDN URLs
 * The DeHub API returns relative paths like "images/xxx.jpg"
 */
export function getMediaUrl(relativePath?: string): string | undefined {
  if (!relativePath) return undefined;
  // Already an absolute URL
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
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
  username?: string;
  displayName?: string;
  display_name?: string;
  bio?: string;
  
  // Avatar/Cover (API uses *ImageUrl suffix)
  avatarImageUrl?: string;
  avatarUrl?: string;
  avatar_url?: string;
  coverImageUrl?: string;
  coverUrl?: string;
  cover_url?: string;
  
  // Verification
  isVerified?: boolean;
  is_verified?: boolean;
  
  // Stats (API returns arrays, we normalize to counts)
  followers?: string[];
  follower_count?: number;
  followings?: string[];
  following_count?: number;
  uploads?: number;
  post_count?: number;
  
  // Timestamps
  createdAt?: string;
  created_at?: string;
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
  postType: 'video' | 'image' | 'audio';
  media_type?: 'video' | 'image' | 'audio';
  
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
  limit?: number;
  category?: string;
  sort?: 'latest' | 'popular' | 'trending';
  creator_id?: string;
  media_type?: 'video' | 'image' | 'audio' | 'live';
  search?: string;
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

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    localStorage.setItem('dehub_token', token);
  } else {
    localStorage.removeItem('dehub_token');
  }
};

export const getAuthToken = (): string | null => {
  if (!authToken) {
    authToken = localStorage.getItem('dehub_token');
  }
  return authToken;
};

// Base API call function
async function apiCall<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    body?: Record<string, unknown>;
    params?: Record<string, string | number | undefined>;
    requiresAuth?: boolean;
  } = {}
): Promise<T> {
  const { method = 'GET', body, params = {}, requiresAuth = false } = options;
  
  // Build query string
  const queryParams = new URLSearchParams();
  queryParams.set('endpoint', endpoint);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      queryParams.set(key, String(value));
    }
  });

  const token = getAuthToken();
  
  if (requiresAuth && !token) {
    throw new Error('Authentication required');
  }

  const { data, error } = await supabase.functions.invoke('dehub-api', {
    method: 'POST',
    body: {
      _method: method,
      _endpoint: endpoint,
      _params: params,
      ...body,
    },
    headers: token ? { 'x-dehub-token': token } : undefined,
  });

  if (error) {
    throw new Error(error.message || 'API call failed');
  }

  return data as T;
}

// Auth functions
export async function authenticateWallet(
  walletAddress: string,
  signature: string,
  message: string,
  chainId: number = 1
): Promise<{ token: string; user: DeHubUser }> {
  const { data, error } = await supabase.functions.invoke('dehub-auth', {
    body: {
      wallet_address: walletAddress,
      signature,
      message,
      chain_id: chainId,
    },
  });

  if (error) {
    throw new Error(error.message || 'Authentication failed');
  }

  if (data.token) {
    setAuthToken(data.token);
  }

  return data;
}

// NFT/Content functions
export async function searchNFTs(params: SearchNFTsParams = {}): Promise<PaginatedResponse<DeHubNFT>> {
  return apiCall<PaginatedResponse<DeHubNFT>>('/api/search_nfts', {
    params: {
      page: params.page,
      limit: params.limit,
      category: params.category,
      sort: params.sort,
      creator_id: params.creator_id,
      media_type: params.media_type,
      search: params.search,
    },
  });
}

export async function getNFTInfo(tokenId: string): Promise<DeHubNFT> {
  return apiCall<DeHubNFT>(`/api/nft_info/${tokenId}`);
}

export async function getNFTComments(
  tokenId: string,
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResponse<DeHubComment>> {
  return apiCall<PaginatedResponse<DeHubComment>>(`/api/nft/${tokenId}/comments`, {
    params: { page, limit },
  });
}

export async function recordView(tokenId: string): Promise<void> {
  return apiCall<void>(`/api/record-view/${tokenId}`, {
    method: 'POST',
  });
}

// User functions
export async function getAccountInfo(userId: string): Promise<DeHubUser> {
  const response = await apiCall<{ result: DeHubUser } | DeHubUser>(`/api/account_info/${userId}`);
  // Handle wrapped response from API
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as DeHubUser;
}

export async function getAccountByUsername(username: string): Promise<DeHubUser> {
  // Remove @ prefix if present
  const cleanUsername = username.replace('@', '');
  const response = await apiCall<{ result: DeHubUser } | DeHubUser>(`/api/account_info/${cleanUsername}`);
  // Handle wrapped response from API
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as DeHubUser;
}

export async function updateProfile(
  data: Partial<Pick<DeHubUser, 'username' | 'display_name' | 'bio' | 'avatar_url' | 'cover_url'>>
): Promise<DeHubUser> {
  return apiCall<DeHubUser>('/api/update_profile', {
    method: 'POST',
    body: data,
    requiresAuth: true,
  });
}

export async function getUserNFTs(
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResponse<DeHubNFT>> {
  return apiCall<PaginatedResponse<DeHubNFT>>(`/api/user/${userId}/nfts`, {
    params: { page, limit },
  });
}

// Interaction functions
export async function voteOnNFT(
  tokenId: string,
  voteType: 'like' | 'dislike'
): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>('/api/request_vote', {
    method: 'POST',
    body: { token_id: tokenId, vote_type: voteType },
    requiresAuth: true,
  });
}

export async function followUser(userId: string): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>('/api/request_follow', {
    method: 'POST',
    body: { user_id: userId },
    requiresAuth: true,
  });
}

export async function unfollowUser(userId: string): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>('/api/request_unfollow', {
    method: 'POST',
    body: { user_id: userId },
    requiresAuth: true,
  });
}

export async function postComment(
  tokenId: string,
  content: string,
  parentId?: string
): Promise<DeHubComment> {
  return apiCall<DeHubComment>('/api/request_comment', {
    method: 'POST',
    body: { token_id: tokenId, content, parent_id: parentId },
    requiresAuth: true,
  });
}

// Bookmark functions
export async function savePost(tokenId: string): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>('/api/savePost', {
    method: 'POST',
    body: { token_id: tokenId },
    requiresAuth: true,
  });
}

export async function getSavedPosts(
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResponse<DeHubNFT>> {
  return apiCall<PaginatedResponse<DeHubNFT>>('/api/savedPosts', {
    params: { page, limit },
    requiresAuth: true,
  });
}

// Category functions
export async function getCategories(): Promise<DeHubCategory[]> {
  return apiCall<DeHubCategory[]>('/api/get_categories');
}

// Content creation
export async function mintNFT(data: {
  title: string;
  description?: string;
  media_url: string;
  thumbnail_url?: string;
  media_type: 'video' | 'image' | 'audio';
  category?: string;
  tags?: string[];
  is_ppv?: boolean;
  ppv_price?: number;
}): Promise<DeHubNFT> {
  return apiCall<DeHubNFT>('/api/user_mint', {
    method: 'POST',
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
  return apiCall('/api/live/start', {
    method: 'POST',
    body: data,
    requiresAuth: true,
  });
}

export async function endLivestream(): Promise<{ success: boolean }> {
  return apiCall<{ success: boolean }>('/api/live/end', {
    method: 'POST',
    requiresAuth: true,
  });
}

// DHB Price
export async function getDHBPrice(): Promise<{ price: number; change_24h: number }> {
  return apiCall<{ price: number; change_24h: number }>('/api/dpay/price');
}

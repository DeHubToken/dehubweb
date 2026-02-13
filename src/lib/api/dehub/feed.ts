import { apiCall, getAuthToken } from './core';
import type {
  DeHubNFT,
  DeHubUser,
  DeHubCategory,
  PaginatedResponse,
  SearchNFTsParams,
  UniversalSearchParams,
  UniversalSearchResponse,
  SearchAccount,
  SearchSuggestionsParams,
  SearchSuggestion,
  SearchLogParams,
} from './types';

export async function searchNFTs(params: SearchNFTsParams = {}): Promise<PaginatedResponse<DeHubNFT>> {
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
    page: params.page !== undefined ? params.page + 1 : 1,
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

export async function universalSearch(params: UniversalSearchParams): Promise<UniversalSearchResponse> {
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
  
  let items: Array<any> = [];
  if (response && typeof response === 'object' && 'result' in response) {
    items = Array.isArray(response.result) ? response.result : [];
  } else if (Array.isArray(response)) {
    items = response;
  }
  
  const isAccountSearch = params.type === 'accounts';
  
  if (isAccountSearch) {
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
  
  return {
    accounts: [],
    videos: items as DeHubNFT[],
    livestreams: [],
    has_more: (response as any).pagination?.hasMore ?? items.length >= (params.unit || 15),
    total: (response as any).pagination?.totalCount ?? items.length,
  };
}

export async function getSearchSuggestions(params: SearchSuggestionsParams): Promise<SearchSuggestion[]> {
  const response = await apiCall<{ suggestions: SearchSuggestion[] } | SearchSuggestion[]>("/api/search/suggestions", {
    params: {
      q: params.q,
      limit: params.limit,
    },
  });
  
  if (response && typeof response === 'object' && 'suggestions' in response) {
    return response.suggestions;
  }
  
  return response as SearchSuggestion[];
}

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
  const token = getAuthToken();
  const response = await apiCall<{ result: DeHubNFT } | DeHubNFT>(`/api/nft_info/${tokenId}`, {
    requiresAuth: !!token,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as DeHubNFT;
}

export async function recordView(tokenId: string): Promise<void> {
  return apiCall<void>(`/api/record-view/${tokenId}`, {
    method: "GET",
  });
}

export interface SavePostResponse {
  status: string;
  message: string;
}

export async function toggleSavePost(tokenId: string | number): Promise<SavePostResponse> {
  return apiCall<SavePostResponse>("/api/savePost", {
    method: "POST",
    body: { tokenId: Number(tokenId) },
    requiresAuth: true,
  });
}

export async function getSavedPosts(page: number = 1, limit: number = 20): Promise<{ result: DeHubNFT[]; pagination?: { page: number; limit: number; totalCount: number; totalPages: number; hasMore: boolean } }> {
  return apiCall<{ result: DeHubNFT[]; pagination?: any }>("/api/savedPosts", {
    params: { page, limit },
    requiresAuth: true,
  });
}

export async function getLikedPosts(
  page: number = 1, 
  limit: number = 20, 
): Promise<{ result: DeHubNFT[]; pagination?: { page: number; limit: number; totalCount: number; totalPages: number; hasMore: boolean } }> {
  return apiCall<{ result: DeHubNFT[]; pagination?: any }>("/api/liked_videos", {
    params: { page, limit },
    requiresAuth: true,
  });
}

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
  
  if (Array.isArray(response) && response.length > 0) {
    if (typeof response[0] === 'object' && 'name' in response[0]) {
      return response as DeHubCategory[];
    }
    return (response as string[]).map((name) => ({
      id: name.trim(),
      name: name.trim(),
      slug: name.toLowerCase().trim().replace(/\s+/g, '-'),
    }));
  }
  
  return [];
}

export async function getServerTime(): Promise<{ time: string }> {
  return apiCall<{ time: string }>("/api/getServerTime");
}

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

export async function recordBatchViews(tokenIds: number[]): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/view/batch", {
    method: "POST",
    body: { tokenIds },
    requiresAuth: false,
  });
}

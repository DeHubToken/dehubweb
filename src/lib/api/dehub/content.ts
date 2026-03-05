import { DEHUB_API_BASE, apiCall, getAuthToken } from './core';
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
  r: string;
  s: string;
  v: number;
  createdTokenId: string;
  timestamp: number;
}

export async function mintPost(
  params: MintPostParams,
  onProgress?: (percent: number) => void
): Promise<MintResponse> {
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

  return new Promise<MintResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress (bytes sent to server)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.result ?? data);
        } catch {
          reject(new Error('Invalid response from server'));
        }
      } else {
        let errorData: Record<string, string> = {};
        try { errorData = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        reject(new Error(errorData.message || errorData.error || `Mint failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed — please check your connection and try again'));
    xhr.ontimeout = () => reject(new Error('Upload timed out — your video may be too large or connection too slow'));

    // 8-minute timeout for large video files on slow mobile connections
    xhr.timeout = 8 * 60 * 1000;

    xhr.open('POST', `${DEHUB_API_BASE}/api/user_mint`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
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
  const token = getAuthToken();
  
  if (!token) {
    throw new Error("Authentication required");
  }

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

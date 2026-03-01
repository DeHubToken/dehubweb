import { apiCall, DEHUB_API_BASE, getAuthToken } from './core';
import type { DeHubUser } from './types';

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

interface CommentsApiResponse {
  result: {
    items: ApiCommentResponse[];
    totalCount: number;
    skip: number;
    limit: number;
    hasMore: boolean;
  };
}

export interface PostCommentResponse {
  result?: boolean;
}

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

export interface EditCommentResponse {
  success: boolean;
  comment: CommentResponse;
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

export async function postComment(tokenId: string, content: string, replyToId?: string): Promise<PostCommentResponse> {
  const body: Record<string, unknown> = {
    streamTokenId: Number(tokenId),
    content,
  };
  if (replyToId) {
    body.commentId = Number(replyToId);
  }

  const hasMention = /@\w+/.test(content);
  console.log('[postComment] →', {
    method: 'POST',
    body,
    hasMention,
    mentions: hasMention ? content.match(/@\w+/g) : [],
  });

  const result = await apiCall<PostCommentResponse>("/api/request_comment", {
    method: "POST",
    body,
    requiresAuth: true,
  });

  console.log('[postComment] ← response:', result);
  return result;
}

export async function addComment(params: {
  tokenId: number;
  content: string;
  parentId?: string;
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

export async function addCommentWithImage(params: {
  tokenId: number;
  content?: string;
  imageUrl: string;
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

export interface VoiceCommentResponse {
  result: boolean;
  commentId: number;
  audioUrl: string;
  audioDuration: number;
}

export async function addVoiceComment(params: {
  tokenId: number;
  audioFile: Blob;
  content?: string;
  parentId?: string;
}): Promise<VoiceCommentResponse> {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required');

  const formData = new FormData();
  // Determine extension from blob type
  const ext = params.audioFile.type.includes('webm') ? 'webm' 
    : params.audioFile.type.includes('mp4') || params.audioFile.type.includes('m4a') ? 'm4a'
    : params.audioFile.type.includes('ogg') ? 'ogg' : 'webm';
  formData.append('file', params.audioFile, `voice-${Date.now()}.${ext}`);

  const url = new URL('/api/comment_audio', DEHUB_API_BASE);
  url.searchParams.set('streamTokenId', String(params.tokenId));
  if (params.content?.trim()) {
    url.searchParams.set('content', params.content);
  }
  if (params.parentId) {
    url.searchParams.set('commentId', params.parentId);
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Voice comment failed: ${response.status}`);
  }

  return response.json();
}

export async function addGifComment(params: {
  tokenId: number;
  gifUrl: string;
  content?: string;
  parentId?: string;
}): Promise<CommentResponse> {
  const response = await apiCall<{ result: CommentResponse } | CommentResponse>("/api/comment_gif", {
    method: "POST",
    body: {
      streamTokenId: params.tokenId,
      gifUrl: params.gifUrl,
      content: params.content || '',
      commentId: params.parentId,
    },
    requiresAuth: true,
  });
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result;
  }
  return response as CommentResponse;
}

export async function deleteComment(commentId: string | number): Promise<{ result: boolean }> {
  return apiCall<{ result: boolean }>("/api/delete_comment", {
    method: "DELETE",
    body: { commentId: Number(commentId) },
    requiresAuth: true,
  });
}

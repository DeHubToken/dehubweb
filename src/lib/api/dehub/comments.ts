import { apiCall } from './core';
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

import { apiCall } from './core';
import type { DeHubUser, DeHubNFT } from './types';

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

export type NotificationCategory = 
  | 'engagement'
  | 'social'
  | 'monetization'
  | 'content'
  | 'system';

export type NotificationPostType = 'video' | 'feed-images' | 'feed-simple';

export interface DeHubNotification {
  _id: string;
  id: string;
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
  actor?: DeHubUser;
  post?: DeHubNFT;
}

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

interface NotificationsApiResponse {
  result: RawNotification[];
}

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

function normalizeNotification(raw: RawNotification): DeHubNotification {
  return {
    ...raw,
    id: raw._id,
    actor: raw.actorUsername || raw.actorAddress ? {
      address: raw.actorAddress,
      username: raw.actorUsername,
      avatarImageUrl: raw.actorAvatar,
    } : undefined,
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

export async function markNotificationAsRead(notificationId: string): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`/api/notification/${notificationId}`, {
    method: "PATCH",
    requiresAuth: true,
  });
}

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

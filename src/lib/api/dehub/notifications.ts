import { apiCall } from './core';
import type { DeHubUser, DeHubNFT } from './types';
import type { PostReaction } from '@/lib/reactions';

/**
 * Every type the API can send. This used to list only thirteen of them, so the
 * rest reached the UI as unhandled strings and every read of them needed an
 * `as any` — which is how several ended up with no icon and no click target.
 */
export type NotificationType =
  | 'like'
  | 'comment'
  | 'comment_reply'
  | 'comment_like'
  | 'mention'
  | 'following'
  | 'follow_request'
  | 'follow_request_accepted'
  | 'repost'
  | 'quote'
  | 'tip'
  | 'subscription'
  | 'ppv_purchase'
  | 'bounty_available'
  | 'bounty_claimed'
  | 'fraction_offer'
  | 'fraction_offer_accepted'
  | 'fraction_offer_rejected'
  | 'fraction_purchased'
  | 'video_milestone'
  | 'livestream_start'
  | 'signal_flare'
  | 'video_removal'
  | 'account_warning'
  | 'system';

export type NotificationCategory =
  | 'engagement'
  | 'social'
  | 'monetization'
  | 'content'
  | 'messages'
  | 'system';

export type NotificationPostType = 'video' | 'short' | 'feed-images' | 'feed-simple' | 'feed-audio';

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
  /**
   * Which reaction produced a `like` notification. Absent when the actors in an
   * aggregated row disagree (render it as a generic "reacted to"), and on rows
   * written before multi-reaction shipped (render them as a plain like).
   */
  reaction?: PostReaction;
  /**
   * Free-form bag the server attaches per notification type; it already rode
   * through `normalizeNotification`'s spread, it was just never declared. The
   * one key the UI reads is `articleUrl`, which an admin broadcast sets to the
   * page the announcement is about — see `announcementTarget` in
   * NotificationsPage.
   */
  metadata?: NotificationMetadata;
}

/** Only the keys the client reads; the server sends more. */
export interface NotificationMetadata {
  articleUrl?: string;
  [key: string]: unknown;
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
  actor?: {
    address?: string;
    username?: string;
    displayName?: string;
    avatarImageUrl?: string;
    avatarUrl?: string;
  };
  tokenId?: number;
  tokenTitle?: string;
  tokenThumbnail?: string;
  postType?: NotificationPostType;
  aggregatedCount?: number;
  latestActorNames?: string[];
  reaction?: PostReaction;
  amount?: number;
  currency?: string;
  metadata?: NotificationMetadata;
}

interface NotificationsApiResponse {
  result: RawNotification[];
}

interface UnreadCountApiResponse {
  total: number;
  byCategory: UnreadCountByCategory;
}

/** One entry per NotificationCategory — keep the two in step or indexing by a
 *  notification's own category stops type-checking. */
export type UnreadCountByCategory = Record<NotificationCategory, number>;

const EMPTY_UNREAD_BY_CATEGORY: UnreadCountByCategory = {
  engagement: 0,
  social: 0,
  monetization: 0,
  content: 0,
  messages: 0,
  system: 0,
};

/** Normalize API type strings to our canonical snake_case types */
function normalizeNotificationType(rawType: string): NotificationType {
  const typeMap: Record<string, NotificationType> = {
    'followRequest': 'follow_request',
    'follow-request': 'follow_request',
    'follow_request': 'follow_request',
    'commentReply': 'comment_reply',
    'comment-reply': 'comment_reply',
    'commentLike': 'comment_like',
    'comment-like': 'comment_like',
    'ppvPurchase': 'ppv_purchase',
    'ppv-purchase': 'ppv_purchase',
    'videoMilestone': 'video_milestone',
    'video-milestone': 'video_milestone',
    'livestreamStart': 'livestream_start',
    'signalFlare': 'signal_flare',
    'signal-flare': 'signal_flare',
    'livestream-start': 'livestream_start',
    'videoRemoval': 'video_removal',
    'video-removal': 'video_removal',
  };
  return typeMap[rawType] || rawType as NotificationType;
}

function normalizeNotification(raw: RawNotification): DeHubNotification {
  // Resolve avatar: prefer nested actor object (from API), fall back to flat actorAvatar field
  const actorAvatarPath = raw.actor?.avatarImageUrl || raw.actor?.avatarUrl || raw.actorAvatar;
  const normalizedType = normalizeNotificationType(raw.type as string);
  
  return {
    ...raw,
    id: raw._id,
    type: normalizedType,
    actorAvatar: actorAvatarPath,
    actor: raw.actorUsername || raw.actorAddress ? {
      address: raw.actorAddress,
      username: raw.actorUsername,
      avatarImageUrl: actorAvatarPath,
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
  unreadOnly: boolean = false,
  types?: string[]
): Promise<{ items: DeHubNotification[]; totalCount: number; hasMore: boolean }> {
  const params: Record<string, string | number> = {
    page,
    limit,
    unreadOnly: unreadOnly.toString(),
  };

  if (category) {
    params.category = category;
  }

  // Server-side type filter. The API validates the list and ignores names it
  // does not know, so sending types it has never heard of (the Supabase-backed
  // ones) degrades to an unfiltered page rather than an empty one.
  if (types?.length) {
    params.types = types.join(',');
  }

  const response = await apiCall<NotificationsApiResponse | { result: RawNotification[] } | RawNotification[]>("/api/notification", {
    params,
    requiresAuth: true,
  });
  
  if (response && typeof response === 'object' && 'result' in response) {
    const result = response.result;
    if (Array.isArray(result)) {
      console.log('[Notifications] raw types from API:', result.map((n: any) => n?.type));
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
    console.log('[Notifications] raw types from API:', response.map((n: any) => n?.type));
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
  byCategory: UnreadCountByCategory;
}

export async function getUnreadNotificationCount(): Promise<UnreadNotificationCount> {
  const response = await apiCall<UnreadCountApiResponse>("/api/notification/unread-count", {
    requiresAuth: true,
  });

  return {
    total: response?.total || 0,
    // Merged rather than substituted: older deployments omit `messages`, and a
    // missing key would make every read of it undefined instead of zero.
    byCategory: { ...EMPTY_UNREAD_BY_CATEGORY, ...(response?.byCategory ?? {}) },
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

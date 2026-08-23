/**
 * Comment data shape + API mapping
 * ================================
 * Lives outside the comments UI so non-component consumers (the author-thread
 * hook) can map API rows without importing a component module — which also
 * keeps react-refresh happy about CommentsSection's exports.
 */

import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { formatTimeAgo } from '@/lib/feed-utils';
import type { ApiCommentResponse } from '@/lib/api/dehub';

export interface VoiceNote {
  url: string;
  duration: number;
}

export interface Comment {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
  text: string;
  imageUrl?: string;
  likes: number;
  dislikes: number;
  timeAgo: string;
  createdAt: Date; // For sorting
  isLiked?: boolean;
  isDisliked?: boolean;
  voiceNote?: VoiceNote;
  replyToId?: string;
  address?: string;
  badgeBalance?: number;
}

/** Map an API comment row to the UI shape. */
export function mapApiComment(apiComment: ApiCommentResponse): Comment {
  const address = apiComment.address;
  // Use centralized utility for avatar field extraction
  const rawAvatarPath = extractAvatarPath(apiComment.writor);

  // Build avatar URL - buildAvatarUrl for proper CDN path resolution
  const resolvedAvatar = address && rawAvatarPath
    ? buildAvatarUrl(address, rawAvatarPath)
    : undefined;

  // Parse createdAt for sorting - fallback to current time if parsing fails
  const createdAt = apiComment.createdAt ? new Date(apiComment.createdAt) : new Date();

  const voiceNote = (apiComment as any).audioUrl ? {
    url: (apiComment as any).audioUrl.startsWith('http')
      ? (apiComment as any).audioUrl
      : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/${(apiComment as any).audioUrl}`,
    duration: (apiComment as any).audioDuration || 0,
  } : undefined;

  // Resolve imageUrl (GIF comments or image comments)
  // API may return gif in imageUrl, gifUrl, or image field
  let commentImageUrl: string | undefined;
  const rawImageUrl = apiComment.imageUrl || (apiComment as any).gifUrl || (apiComment as any).image || (apiComment as any).gif;
  if (rawImageUrl) {
    commentImageUrl = rawImageUrl.startsWith('http')
      ? rawImageUrl
      : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/${rawImageUrl}`;
  }

  return {
    id: String(apiComment.id),
    username: apiComment.writor?.username || 'Anonymous',
    displayName: apiComment.writor?.displayName || undefined,
    avatar: resolvedAvatar,
    text: apiComment.content || (apiComment as any).text || (apiComment as any).body || '',
    imageUrl: commentImageUrl,
    likes: apiComment.likeCount ?? 0,
    dislikes: apiComment.dislikeCount ?? 0,
    timeAgo: formatTimeAgo(apiComment.createdAt),
    createdAt,
    isLiked: apiComment.isLiked ?? false,
    isDisliked: apiComment.isDisliked ?? false,
    replyToId: apiComment.parentId ? String(apiComment.parentId) : undefined,
    address,
    voiceNote,
    badgeBalance: apiComment.writor?.badgeBalance,
  };
}

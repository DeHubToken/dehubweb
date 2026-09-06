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
import {
  asReaction,
  reconcileReactionCounts,
  type PostReaction,
  type ReactionCounts,
} from '@/lib/reactions';

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
  /**
   * Times this comment has scrolled into a reader's viewport.
   *
   * A plain counter on the comment row, not the post's view count: it has no
   * denormalised sum behind it and no per-viewer ledger, so it is an
   * impression figure and reads a little high compared with a post's.
   */
  views: number;
  timeAgo: string;
  createdAt: Date; // For sorting
  isLiked?: boolean;
  isDisliked?: boolean;
  /**
   * Which of the nine reactions the viewer holds on this comment.
   * `isLiked`/`isDisliked` are its POLARITY, exactly as on a post — a comment
   * somebody loved is still a comment they liked.
   */
  myReaction?: PostReaction | null;
  /** Per-reaction totals, for the tray on the comment's thumb. */
  reactionCounts?: ReactionCounts;
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
    views: apiComment.views ?? 0,
    timeAgo: formatTimeAgo(apiComment.createdAt),
    createdAt,
    isLiked: apiComment.isLiked ?? false,
    isDisliked: apiComment.isDisliked ?? false,
    // Falls back to the polarity flags, which is what a plain like always was.
    // Covers both a comment voted on before reactions existed and an API that
    // has not shipped them yet — without it the viewer's own like would draw
    // as no reaction at all.
    myReaction:
      asReaction(apiComment.myReaction) ??
      (apiComment.isLiked ? 'like' : apiComment.isDisliked ? 'dislike' : null),
    // Reconciled rather than passed through: a comment from before reactions
    // shipped carries no split at all, and one whose totals were edited by
    // hand carries a split that adds up to less than the count beside it. The
    // number people can see is the one that has to be right, so the split is
    // scaled to fit it — same rule posts follow.
    reactionCounts: reconcileReactionCounts(
      apiComment.likeCount ?? 0,
      apiComment.dislikeCount ?? 0,
      apiComment.reactionCounts as ReactionCounts | undefined,
    ),
    replyToId: apiComment.parentId ? String(apiComment.parentId) : undefined,
    address,
    voiceNote,
    badgeBalance: apiComment.writor?.badgeBalance,
  };
}

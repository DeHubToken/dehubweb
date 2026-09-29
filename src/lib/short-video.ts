/**
 * API post → ShortVideo
 * =====================
 * The one mapper every shorts surface uses to turn a feed row into what the
 * shorts viewer renders: the Shorts tab, and the mixed feed a phone opens by
 * swiping up out of a fullscreen video.
 *
 * @module lib/short-video
 */

import { getMediaUrl } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { resolveViewCount } from '@/lib/engagement';
import { shortsPhotoMedia } from '@/lib/shorts-photos';
import type { ShortVideo } from '@/types/feed.types';

export function formatLikes(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

// Parse duration string to seconds (e.g., "0:15" → 15)
export function parseDurationToSeconds(duration: string): number {
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// Map video NFT to ShortVideo format
export function mapToShortVideo(nft: any, index: number): ShortVideo & { durationSeconds: number; uploadedAgo: string } {
  const id = String(nft.tokenId || nft.id || nft.token_id);
  // Use videoDuration (number in seconds) directly if available, fallback to string parsing
  const durationSeconds = typeof nft.videoDuration === 'number' 
    ? nft.videoDuration 
    : parseDurationToSeconds(nft.duration || '0:00');
  const viewCount = resolveViewCount(nft);
  const minterAddress = nft.minter || nft.creator?.id || nft.creator?.address || '';
  
  // Try all possible avatar fields - same pattern as leaderboard/profile
  const rawAvatarUrl = nft.minterAvatarUrl || nft.minterAvatarImg || nft.avatarUrl || nft.avatarImg ||
                       nft.creator?.avatar_url || nft.creator?.avatarImg || nft.creator?.avatarUrl;
  const avatarUrl = rawAvatarUrl?.startsWith('http') 
    ? rawAvatarUrl 
    : buildAvatarUrl(minterAddress, rawAvatarUrl);
  
  const voteType = nft.voteType ?? nft.userVote ?? nft.myVote ?? null;

  return {
    id,
    type: 'short',
    username: nft.minterDisplayName || nft.minterUsername || nft.mintername || nft.creator?.username || 'user',
    // Use minterUsername for the @handle, not display name
    handle: nft.minterUsername || nft.mintername || nft.creator?.username || 'user',
    verified: nft.creator?.is_verified || false,
    avatar: avatarUrl || undefined,
    likes: String(nft.totalVotes?.for || nft.like_count || 0),
    dislikes: nft.totalVotes?.against || nft.dislike_count || 0,
    thumbnail: getMediaUrl(nft.imageUrl) || getMediaUrl(nft.thumbnail_url) || '',
    videoUrl: getMediaUrl(nft.videoUrl) || getMediaUrl(nft.media_url) || (id ? `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/videos/${id}.mp4` : ''),
    transcodingStatus: nft.transcodingStatus,
    // Title and body separately, and both are rendered: the caption usually
    // lives in the title, but a short that has both used to show only one.
    title: nft.name || nft.title || '',
    description: nft.description || '',
    sound: 'Original Sound',
    ...shortsPhotoMedia(nft),
    comments: formatLikes(nft.commentCount || nft.comment_count || 0),
    shares: '0',
    repostCount: (nft.totalReposts || nft.reposts || 0) + (nft.quotes || 0),
    views: formatLikes(viewCount),
    durationSeconds: Math.round(durationSeconds),
    uploadedAgo: nft.uploadedAgo || nft.createdAt || '1d ago',
    creatorUsername: nft.minterUsername || nft.mintername || nft.creator?.username || 'user',
    creatorId: minterAddress,
    displayName: nft.minterDisplayName || undefined,
    isLiked: nft.isLiked ?? voteType === 'for',
    isDisliked: nft.isDisliked ?? voteType === 'against',
  } as ShortVideo & { durationSeconds: number; uploadedAgo: string; handle: string };
}

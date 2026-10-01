/**
 * Music feed items
 * ================
 * Shared by the Music tab and its phone layout: which creators to hide, and
 * how an NFT row becomes a feed VideoItem.
 */

import type { DeHubNFT } from '@/lib/api/dehub';
import { buildAvatarUrl, buildImageUrl, buildVideoUrl, extractAvatarPath } from '@/lib/media-url';
import { formatDuration, formatViews, formatTimeAgo } from '@/lib/feed-utils';
import { resolveViewCount } from '@/lib/engagement';
import type { VideoItem } from '@/types/feed.types';

/** Hardcoded fallback usernames/display names to filter out from feeds */
const BLOCKED_CREATORS_FALLBACK = [
  'monkey d luffy',
  'monkey d. luffy',
  'monkeydluffy',
  'monkey_d_luffy',
];

export function isBlockedCreator(nft: DeHubNFT, dynamicBlockedAddresses?: Set<string>): boolean {
  if (dynamicBlockedAddresses) {
    const minter = (nft.minter || '').toLowerCase();
    if (minter && dynamicBlockedAddresses.has(minter)) return true;
  }
  const displayName = (nft.minterDisplayName || nft.mintername || '').toLowerCase();
  const username = (nft.creator?.username || '').toLowerCase();
  return BLOCKED_CREATORS_FALLBACK.some(blocked => 
    displayName.includes(blocked) || username.includes(blocked)
  );
}

// Helper functions (formatDuration, formatViews, formatTimeAgo) are now imported from @/lib/feed-utils
export function mapNFTToVideoItem(nft: DeHubNFT, index: number): VideoItem {
  const minterAddress = nft.minter || nft.creator?.id || '';
  // Use centralized utility for avatar extraction
  const rawAvatarUrl = extractAvatarPath(nft) || extractAvatarPath(nft.creator);
  const avatarUrl = minterAddress && rawAvatarUrl 
    ? buildAvatarUrl(minterAddress, rawAvatarUrl) 
    : undefined;

  const tokenId = nft.tokenId || nft.id || nft.token_id || index;
  
  // Audio fields the shared NFT type does not declare.
  const audio = nft as Omit<DeHubNFT, 'postType'> & { postType?: string; audioDuration?: number; audioUrl?: string };

  // Detect audio posts
  const postType = audio.postType;
  const isAudioPost = postType === 'audio' || postType === 'feed-audio';
  
  // Get duration from various possible fields
  const duration = isAudioPost 
    ? (audio.audioDuration || nft.videoDuration || nft.duration)
    : (nft.videoDuration || nft.duration);
  
  // Build audio URL for audio posts
  const rawAudioUrl = audio.audioUrl;
  const audioUrl = isAudioPost && rawAudioUrl
    ? (rawAudioUrl.startsWith('http') ? rawAudioUrl : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/${rawAudioUrl}`)
    : undefined;
  
  return {
    id: String(tokenId),
    type: 'video',
    thumbnail: buildImageUrl(tokenId, nft.imageUrl) || buildImageUrl(tokenId, nft.thumbnail_url) || '',
    title: nft.name || nft.title || nft.description?.split('\n')[0] || '',
    channel: nft.minterDisplayName || nft.mintername || nft.creator?.username || 'Anonymous',
    verified: nft.creator?.is_verified || false,
    channelAvatar: avatarUrl || undefined,
    views: formatViews(resolveViewCount(nft)),
    uploadedAgo: formatTimeAgo(nft.createdAt || nft.created_at),
    duration: formatDuration(duration),
    videoUrl: isAudioPost ? undefined : buildVideoUrl(tokenId),
    audioUrl,
    audioDuration: isAudioPost ? (typeof duration === 'number' ? duration : 0) : undefined,
    isAudio: isAudioPost,
    isPPV: nft.is_ppv,
    ppvPrice: nft.ppv_price,
    ppvCurrency: nft.ppv_currency,
    isW2E: nft.is_w2e,
    isLocked: nft.is_locked || nft.streamInfo?.isLockContent,
    lockedPrice: nft.locked_price || nft.streamInfo?.lockContentAmount,
    lockedCurrency: nft.locked_currency || nft.streamInfo?.lockContentTokenSymbol || 'DHB',
    lockedTokenAddress: nft.streamInfo?.lockContentContractAddress,
    lockedChainId: nft.streamInfo?.lockContentChainIds?.[0],
    creatorUsername: nft.mintername || nft.creator?.username,
    creatorId: minterAddress,
    chainId: nft.chainId,
    totalTips: nft.totalTips ?? 0,
  };
}


/** Music charts accept audio tracks and explicitly classified music videos. */
export function isMusicFeedItem(nft: DeHubNFT): boolean {
  const type = String(nft.postType ?? '').toLowerCase();
  if (type === 'audio' || type === 'feed-audio') return true;
  if (type !== 'video' && type !== 'feed-video') return false;
  const categories = Array.isArray(nft.category) ? nft.category : [nft.category ?? ''];
  return categories.some(value => String(value).split(/\|\|\||,/).some(
    category => category.trim().replace(/^#/, '').toLowerCase().replace(/[\s_-]+/g, '') === 'musicvideo',
  ));
}

/**
 * Shared NFT → FeedItem mapper
 * Used by bookmarks, notifications, and anywhere we need to convert raw DeHubNFT to renderable feed cards.
 */
import { buildAvatarUrl, buildImageUrl, buildVideoUrl, buildFeedImageUrls } from '@/lib/media-url';
import { formatDuration, formatViews, formatTimeAgo } from '@/lib/feed-utils';
import type { DeHubNFT } from '@/lib/api/dehub';
import type { VideoItem, ImagePost, TextPost, FeedItem } from '@/types/feed.types';

function detectPostType(nft: DeHubNFT): 'video' | 'image' | 'text' {
  const postType = (nft.postType || nft.media_type) as string | undefined;
  if (postType === 'video' || postType === 'feed-video' || nft.videoUrl) return 'video';
  if (postType === 'image' || postType === 'feed-images' || nft.imageUrl || nft.imageUrls?.length) return 'image';
  if (postType === 'feed-simple' || postType === 'feed-all' || postType === 'text') return 'text';
  return 'text';
}

function mapNFTToVideoItem(nft: DeHubNFT): VideoItem {
  const id = String(nft.tokenId);
  const thumbnail = buildImageUrl(nft.tokenId, nft.imageUrl || nft.thumbnail_url);
  const videoUrl = buildVideoUrl(nft.tokenId);
  const channelAvatar = nft.minterAvatarUrl
    ? buildAvatarUrl(nft.minter, nft.minterAvatarUrl) || 'user'
    : 'user';

  return {
    id,
    type: 'video',
    thumbnail,
    videoUrl: videoUrl || nft.videoUrl || undefined,
    duration: formatDuration(nft.videoDuration || nft.duration),
    title: nft.name || nft.title || nft.description?.split('\n')[0] || '',
    description: nft.description || undefined,
    channel: nft.minterDisplayName || nft.minterUsername || nft.mintername || 'Unknown Creator',
    channelAvatar,
    verified: false,
    views: formatViews(nft.views || nft.view_count),
    uploadedAgo: formatTimeAgo(nft.createdAt || nft.created_at),
    creatorId: nft.minter,
    creatorUsername: nft.minterUsername || nft.mintername,
    isLiked: nft.isLiked ?? false,
    likeCount: nft.totalVotes?.for || nft.like_count || 0,
    dislikeCount: nft.totalVotes?.against || 0,
    commentCount: nft.commentCount || nft.comment_count || 0,
    isPPV: nft.is_ppv ?? false,
    ppvPrice: nft.ppv_price,
    ppvCurrency: nft.ppv_currency || 'DHB',
    isW2E: nft.is_w2e ?? false,
    isLocked: nft.is_locked ?? false,
    lockedPrice: nft.locked_price,
    lockedCurrency: nft.locked_currency || 'DHB',
    isOwner: nft.isOwner ?? false,
    isUnlocked: nft.isUnlocked ?? false,
    chainId: nft.chainId,
  };
}

function mapNFTToImagePost(nft: DeHubNFT): ImagePost {
  const id = String(nft.tokenId);
  const imageUrls = buildFeedImageUrls(nft.imageUrls);
  const image = imageUrls?.[0] || buildImageUrl(nft.tokenId, nft.imageUrl || nft.thumbnail_url);
  const avatar = nft.minterAvatarUrl
    ? buildAvatarUrl(nft.minter, nft.minterAvatarUrl) || 'user'
    : 'user';

  return {
    id,
    type: 'image',
    username: nft.minterUsername || nft.mintername || nft.minterDisplayName || 'unknown',
    verified: false,
    avatar,
    image,
    imageUrls,
    title: nft.name || nft.title,
    description: nft.description,
    likes: nft.totalVotes?.for || nft.like_count || 0,
    caption: nft.description || nft.name || '',
    comments: nft.commentCount || nft.comment_count || 0,
    views: formatViews(nft.views || nft.view_count).replace(' views', ''),
    timeAgo: formatTimeAgo(nft.createdAt || nft.created_at),
    creatorId: nft.minter,
    creatorUsername: nft.minterUsername || nft.mintername,
    isLiked: nft.isLiked ?? false,
    isPPV: nft.is_ppv || nft.streamInfo?.isPayPerView || false,
    ppvPrice: nft.ppv_price || nft.streamInfo?.payPerViewAmount,
    ppvCurrency: nft.ppv_currency || 'DHB',
    isW2E: nft.is_w2e || nft.streamInfo?.isAddBounty || false,
    isLocked: nft.is_locked || nft.streamInfo?.isLockContent || false,
    lockedPrice: nft.locked_price || nft.streamInfo?.lockContentAmount,
    lockedCurrency: nft.locked_currency || nft.streamInfo?.lockContentTokenSymbol || 'DHB',
    bountyViews: nft.streamInfo?.addBountyFirstXViewers != null ? Number(nft.streamInfo.addBountyFirstXViewers) : undefined,
    bountyComments: nft.streamInfo?.addBountyFirstXComments != null ? Number(nft.streamInfo.addBountyFirstXComments) : undefined,
    bountyAmount: nft.streamInfo?.addBountyAmount,
    bountyCurrency: nft.streamInfo?.addBountyTokenSymbol || 'DHB',
    isOwner: nft.isOwner ?? false,
    isUnlocked: nft.isUnlocked ?? false,
    chainId: nft.chainId,
  };
}

function mapNFTToTextPost(nft: DeHubNFT): TextPost {
  const id = String(nft.tokenId);
  const avatarUrl = nft.minterAvatarUrl
    ? buildAvatarUrl(nft.minter, nft.minterAvatarUrl) || nft.minter
    : nft.minter;

  return {
    id,
    type: 'post',
    author: {
      id: nft.minter,
      name: nft.minterDisplayName || nft.minterUsername || nft.mintername || 'Unknown',
      handle: nft.minterUsername || nft.mintername || nft.minter,
      avatarSeed: avatarUrl,
      verified: false,
    },
    content: nft.description || nft.name || '',
    createdAt: formatTimeAgo(nft.createdAt || nft.created_at),
    views: formatViews(nft.views || nft.view_count).replace(' views', ''),
    stats: {
      comments: nft.commentCount || nft.comment_count || 0,
      reposts: (nft.totalReposts || nft.reposts || 0) + (nft.quotes || 0),
      likes: nft.totalVotes?.for || nft.like_count || 0,
    },
  };
}

export function mapNFTToFeedItem(nft: DeHubNFT): FeedItem {
  const contentType = detectPostType(nft);
  switch (contentType) {
    case 'video':
      return mapNFTToVideoItem(nft);
    case 'image':
      return mapNFTToImagePost(nft);
    default:
      return mapNFTToTextPost(nft);
  }
}

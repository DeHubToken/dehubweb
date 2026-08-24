/**
 * Single Post Page
 * ================
 * Displays a single post/video/image as a standalone page with sidebars.
 * Auto-detects content type and renders the appropriate card component.
 * 
 * Routes:
 * - /app/post/:postId - Any post type (auto-detected)
 * - /app/video/:tokenId - Alias for video posts
 * 
 * @module pages/app/SinglePostPage
 */

import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getVoteCache } from '@/lib/vote-cache';
import { scrollDocumentTo } from '@/lib/document-scroll';
import { cn } from '@/lib/utils';
import {
  resolveLikeCount,
  resolveDislikeCount,
  resolveMyReaction,
  resolveReactionCounts,
  resolveViewCount,
  applyVoteStateToNFT,
  mergeViewerState,
} from '@/lib/engagement';
import { SEOHead } from '@/components/SEOHead';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Clock, ArrowLeft, Sparkles, MoreVertical, Flag, Link2, Gem, Pencil, Trash2 } from 'lucide-react';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { useTranslation as useI18n } from 'react-i18next';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import dehubCoin from '@/assets/dehub-coin.png';
import { getNFTInfo, getLiveStream, type DeHubNFT } from '@/lib/api/dehub';
import { parseSoundtrackTag, findCachedFeedPost } from '@/hooks/use-unified-feed';
import { PollCard } from '@/components/app/cards/PollCard';
import { useStreamLiveStatus } from '@/hooks/use-stream-live-status';

import { buildAvatarUrl, extractAvatarPath, buildImageUrl, buildFeedImageUrls, buildVideoUrl } from '@/lib/media-url';
import { PageHeader } from '@/components/app/PageHeader';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { CardHeader } from '@/components/app/cards/CardHeader';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { PostCard } from '@/components/app/cards/PostCard';
import { AuthorThread } from '@/components/app/cards/AuthorThread';
import { LiveStreamCard } from '@/components/app/cards/LiveStreamCard';
import { RelatedVideosFeed } from '@/components/app/feeds/RelatedVideosFeed';
import { RelatedImagesFeed } from '@/components/app/feeds/RelatedImagesFeed';
import { RelatedPostsFeed } from '@/components/app/feeds/RelatedPostsFeed';
import { LivePostChat } from '@/components/app/cards/LivePostChat';
import { StreamShopRail } from '@/components/app/live/StreamShop';
import { StreamShopManager } from '@/components/app/live/StreamShopManager';
import { PostAIChat } from '@/components/app/cards/PostAIChat';
import { ReportModal } from '@/components/app/modals/ReportModal';
import { TipModal } from '@/components/app/modals/TipModal';
import { EditPostModal } from '@/components/app/modals/EditPostModal';
import { applyOptimisticEdit } from '@/lib/optimistic-edit';
import { DeletePostModal } from '@/components/app/modals/DeletePostModal';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { formatTimeAgo, formatDuration, formatViews } from '@/lib/feed-utils';
import { useAuth } from '@/contexts/AuthContext';
import { VideoCardSkeleton, ImageCardSkeleton, PostCardSkeleton } from '@/components/app/feeds/FeedSkeletons';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import type { VideoItem, ImagePost, TextPost, LiveStream } from '@/types/feed.types';

/**
 * Detect content type from API response
 */
function getContentType(post: DeHubNFT): 'video' | 'image' | 'post' | 'live' {
  const postType = (post as any).postType as string | undefined;
  if (postType === 'live' || (post as any).isLive !== undefined) return 'live';
  // Audio posts render through VideoCard (which has AudioVisualizer support)
  if (postType === 'audio' || postType === 'feed-audio' || (post as any).audioUrl) return 'video';
  if (postType === 'video' || post.videoUrl) return 'video';
  if (
    postType === 'image' ||
    postType === 'feed-images' ||
    (post.imageUrls && post.imageUrls.length > 0 && !post.videoUrl) ||
    (post.imageUrl && !post.videoUrl)
  ) return 'image';
  return 'post';
}

/**
 * Transform API NFT data to VideoItem format
 */
function toVideoItem(nft: DeHubNFT): VideoItem {
  const views = formatViews(resolveViewCount(nft)).replace(' views', '');
  const title = nft.title || nft.name || '';
  const description = nft.description && nft.description !== title ? nft.description : undefined;
  const rawTimestamp = nft.createdAt || nft.created_at || (nft as any).mintedAt || (nft as any).minted_at || (nft as any).updatedAt || (nft as any).updated_at;
  const timestamp = rawTimestamp && !/^(just now|\d+[smhdwy]|\d+mo)$/i.test(String(rawTimestamp).trim()) ? rawTimestamp : undefined;

  // Detect audio posts
  const postType = (nft as any).postType as string | undefined;
  const rawAudioUrl = (nft as any).audioUrl as string | undefined;
  const isAudioPost = postType === 'audio' || postType === 'feed-audio' || !!rawAudioUrl;
  
  const durationSeconds = isAudioPost 
    ? ((nft as any).audioDuration || nft.videoDuration || nft.duration || 0)
    : (nft.videoDuration || nft.duration || 0);
  
  const streamInfo = nft.streamInfo;
  const isW2E = nft.is_w2e || streamInfo?.isAddBounty || false;
  const bountyViews = streamInfo?.addBountyFirstXViewers != null ? Number(streamInfo.addBountyFirstXViewers) : undefined;
  const bountyComments = streamInfo?.addBountyFirstXComments != null ? Number(streamInfo.addBountyFirstXComments) : undefined;
  const bountyAmount = streamInfo?.addBountyAmount;
  const bountyCurrency = streamInfo?.addBountyTokenSymbol || 'DHB';
  
  // Canonical avatar resolution (matches feed normalization)
  const creatorObj = (nft as any).creator;
  const ownerObj = (nft as any).owner;
  const rawAvatarPath = extractAvatarPath(nft) || extractAvatarPath(creatorObj);
  const resolvedAddress = nft.minter || creatorObj?.id || creatorObj?.address;
  const avatar = rawAvatarPath && resolvedAddress ? buildAvatarUrl(resolvedAddress, rawAvatarPath) || '/placeholder.svg' : '/placeholder.svg';
  
  // Build audio URL for audio posts — try audioUrl first, then fall back to videoUrl/media_url
  // The API sometimes returns the audio file path in videoUrl for audio posts
  const rawAudioSource = rawAudioUrl || (isAudioPost ? (nft.videoUrl || nft.media_url) : undefined);
  const audioUrl = isAudioPost && rawAudioSource
    ? (rawAudioSource.startsWith('http') ? rawAudioSource : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/${rawAudioSource.replace(/^\/+/, '')}`)
    : undefined;
  
  return {
    id: String(nft.tokenId),
    contentRating: nft.contentRating,
    type: 'video',
    thumbnail: buildImageUrl(nft.tokenId, nft.imageUrl) || '/placeholder.svg',
    videoUrl: isAudioPost ? undefined : (nft.tokenId ? buildVideoUrl(nft.tokenId) : undefined),
    audioUrl,
    audioDuration: isAudioPost ? (typeof durationSeconds === 'number' ? durationSeconds : 0) : undefined,
    isAudio: isAudioPost,
    duration: formatDuration(durationSeconds),
    durationSeconds: typeof durationSeconds === 'number' ? durationSeconds : 0,
    title,
    description,
    channel: nft.minterDisplayName || nft.minterUsername || nft.mintername || creatorObj?.display_name || creatorObj?.username || ownerObj?.username || 'Unknown',
    channelAvatar: avatar,
    verified: false,
    views,
    uploadedAgo: formatTimeAgo(timestamp),
    status: nft.status,
    creatorId: resolvedAddress,
    creatorUsername: nft.minterUsername || nft.mintername || creatorObj?.username || ownerObj?.username,
    // Same source the feed normalizer reads (use-unified-feed). Without it the
    // creator row on this page rendered no staking badge while the identical row
    // on the home feed did.
    creatorBadgeBalance: (nft as any).minterUser?.badgeBalance ?? (nft as any).badgeBalance,
    isLiked: nft.isLiked ?? false,
    isDisliked: nft.isDisliked ?? false,
    myReaction: resolveMyReaction(nft),
    reactionCounts: resolveReactionCounts(nft),
    isReposted: nft.isReposted ?? false,
    likeCount: resolveLikeCount(nft),
    dislikeCount: resolveDislikeCount(nft),
    commentCount: nft.commentCount || nft.comment_count || 0,
    isPPV: nft.is_ppv || streamInfo?.isPayPerView || false,
    ppvPrice: nft.ppv_price || streamInfo?.payPerViewAmount,
    ppvCurrency: nft.ppv_currency || 'DHB',
    isW2E,
    isLocked: nft.is_locked || streamInfo?.isLockContent || false,
    lockedPrice: nft.locked_price || streamInfo?.lockContentAmount,
    lockedCurrency: nft.locked_currency || streamInfo?.lockContentTokenSymbol || 'DHB',
    bountyViews,
    bountyComments,
    bountyAmount,
    bountyCurrency,
    isOwner: nft.isOwner ?? false,
    isUnlocked: nft.isUnlocked ?? false,
    repostCount: (nft.totalReposts || nft.reposts || 0) + (nft.quotes || 0),
  };
}

/**
 * Transform API NFT data to ImagePost format
 */
function toImagePost(nft: DeHubNFT): ImagePost {
  const views = formatViews(resolveViewCount(nft)).replace(' views', '');
  
  // Canonical image resolution (matches feed normalization)
  const primaryImage = buildImageUrl(nft.tokenId, nft.imageUrl) || '/placeholder.svg';
  const feedImages = buildFeedImageUrls(nft.imageUrls);
  const imageUrls = feedImages && feedImages.length > 0 ? feedImages : [primaryImage];
  
  const title = nft.title || nft.name;
  const rawDescription = nft.description && nft.description !== title ? nft.description : undefined;
  const soundtrack = parseSoundtrackTag(rawDescription);
  const description = rawDescription?.replace(/\[soundtrack:[^\]]*\]/, '').trim() || undefined;
  const rawTimestamp = nft.createdAt || nft.created_at || (nft as any).mintedAt || (nft as any).minted_at || (nft as any).updatedAt || (nft as any).updated_at;
  const timestamp = rawTimestamp && !/^(just now|\d+[smhdwy]|\d+mo)$/i.test(String(rawTimestamp).trim()) ? rawTimestamp : undefined;
  const streamInfo = nft.streamInfo;
  
  // Canonical avatar resolution (matches feed normalization)
  const creatorObj = (nft as any).creator;
  const ownerObj = (nft as any).owner;
  const rawAvatarPath = extractAvatarPath(nft) || extractAvatarPath(creatorObj);
  const resolvedAddress = nft.minter || creatorObj?.id || creatorObj?.address;
  const avatar = rawAvatarPath && resolvedAddress ? buildAvatarUrl(resolvedAddress, rawAvatarPath) || '/placeholder.svg' : '/placeholder.svg';
  
  return {
    id: String(nft.tokenId),
    contentRating: nft.contentRating,
    type: 'image',
    username: nft.minterDisplayName || nft.minterUsername || nft.mintername || creatorObj?.display_name || creatorObj?.username || ownerObj?.username || 'Unknown',
    verified: false,
    avatar,
    image: primaryImage,
    imageUrls,
    title,
    description,
    likes: resolveLikeCount(nft),
    dislikes: resolveDislikeCount(nft),
    caption: description || '',
    comments: nft.commentCount || nft.comment_count || 0,
    status: nft.status,
    views,
    timeAgo: formatTimeAgo(timestamp),
    creatorId: resolvedAddress,
    creatorUsername: nft.minterUsername || nft.mintername || creatorObj?.username || ownerObj?.username,
    creatorBadgeBalance: (nft as any).minterUser?.badgeBalance ?? (nft as any).badgeBalance,
    isLiked: nft.isLiked ?? false,
    isDisliked: nft.isDisliked ?? false,
    myReaction: resolveMyReaction(nft),
    reactionCounts: resolveReactionCounts(nft),
    isReposted: nft.isReposted ?? false,
    isPPV: nft.is_ppv || streamInfo?.isPayPerView || false,
    ppvPrice: nft.ppv_price || streamInfo?.payPerViewAmount,
    ppvCurrency: nft.ppv_currency || 'DHB',
    isW2E: nft.is_w2e || streamInfo?.isAddBounty || false,
    isLocked: nft.is_locked || streamInfo?.isLockContent || false,
    lockedPrice: nft.locked_price || streamInfo?.lockContentAmount,
    lockedCurrency: nft.locked_currency || streamInfo?.lockContentTokenSymbol || 'DHB',
    bountyViews: streamInfo?.addBountyFirstXViewers != null ? Number(streamInfo.addBountyFirstXViewers) : undefined,
    bountyComments: streamInfo?.addBountyFirstXComments != null ? Number(streamInfo.addBountyFirstXComments) : undefined,
    bountyAmount: streamInfo?.addBountyAmount,
    bountyCurrency: streamInfo?.addBountyTokenSymbol || 'DHB',
    isOwner: nft.isOwner ?? false,
    isUnlocked: nft.isUnlocked ?? false,
    repostCount: (nft.totalReposts || nft.reposts || 0) + (nft.quotes || 0),
    isQuotePost: !!nft.isQuotePost,
    quotedPost: nft.quotedPost || null,
    ...soundtrack,
  };
}

/**
 * Transform API NFT data to TextPost format
 */
function toTextPost(nft: DeHubNFT): TextPost {
  const views = formatViews(resolveViewCount(nft)).replace(' views', '');
  const rawTimestamp = nft.createdAt || nft.created_at || (nft as any).mintedAt || (nft as any).minted_at || (nft as any).updatedAt || (nft as any).updated_at;
  const timestamp = rawTimestamp && !/^(just now|\d+[smhdwy]|\d+mo)$/i.test(String(rawTimestamp).trim()) ? rawTimestamp : undefined;
  
  // Canonical avatar resolution (matches feed normalization)
  const creatorObj = (nft as any).creator;
  const ownerObj = (nft as any).owner;
  const rawAvatarPath = extractAvatarPath(nft) || extractAvatarPath(creatorObj);
  const resolvedAddress = nft.minter || creatorObj?.id || creatorObj?.address;
  const avatar = rawAvatarPath && resolvedAddress ? buildAvatarUrl(resolvedAddress, rawAvatarPath) || '/placeholder.svg' : '/placeholder.svg';
  
  // Determine if the name is a meaningful title (matches feed normalization)
  const rawName = nft.name || '';
  const rawDescription = nft.description || '';
  const trimmedName = rawName.trim();
  const trimmedDesc = rawDescription.trim();
  const hasMeaningfulTitle = trimmedName.length > 0 
    && trimmedName !== trimmedDesc 
    && !trimmedDesc.startsWith(trimmedName);

  return {
    id: String(nft.tokenId),
    contentRating: nft.contentRating,
    type: 'post',
    createdAt: timestamp || '',
    views,
    status: nft.status,
    author: {
      id: resolvedAddress,
      name: nft.minterDisplayName || nft.minterUsername || nft.mintername || creatorObj?.display_name || creatorObj?.username || ownerObj?.username || 'Unknown',
      handle: nft.minterUsername || nft.mintername || creatorObj?.username || ownerObj?.username || resolvedAddress?.slice(0, 8) || 'anonymous',
      avatarSeed: avatar,
      verified: false,
      badgeBalance: (nft as any).minterUser?.badgeBalance ?? (nft as any).badgeBalance,
    },
    title: hasMeaningfulTitle ? trimmedName : undefined,
    content: trimmedDesc || (hasMeaningfulTitle ? '' : trimmedName) || '',
    rawName,
    rawDescription,
    stats: {
      comments: nft.commentCount || nft.comment_count || 0,
      reposts: (nft.totalReposts || nft.reposts || 0) + (nft.quotes || 0),
      likes: resolveLikeCount(nft),
      dislikes: resolveDislikeCount(nft),
    },
    // These three used to be missing here — the video and image mappers above
    // both carry them, so only text posts lost their like/dislike/repost state
    // when opened on their own page: PostCard got isLiked===undefined and the
    // thumb rendered inactive even though the feed showed it lit. It looked
    // fine for a few minutes only because ActionBar falls back to the
    // in-memory vote cache, which expires.
    isLiked: nft.isLiked ?? false,
    isDisliked: nft.isDisliked ?? false,
    myReaction: resolveMyReaction(nft),
    reactionCounts: resolveReactionCounts(nft),
    isReposted: nft.isReposted ?? false,
    isQuotePost: !!nft.isQuotePost,
    quotedPost: nft.quotedPost || null,
  };
}

/** Livepeer CDN bases - .studio is the active CDN; .com is legacy/deprecated */
const LIVEPEER_CDN_BASES = [
  'https://livepeercdn.studio',
  'https://livepeercdn.com',
];

/**
 * Build HLS playback URL from stream playbackId (when api.dehub.io /start fails)
 * Prefers backend playbackUrl if present; otherwise builds from playbackId.
 */
function buildLivePlaybackUrl(nft: DeHubNFT): string | undefined {
  const stream = (nft as any).stream;
  // Prefer backend-provided URL
  const fromApi = stream?.playbackUrl || nft.videoUrl || (nft as any).playbackUrl;
  if (fromApi && fromApi.includes('.m3u8')) return fromApi;

  const playbackId = stream?.playbackId;
  if (playbackId) {
    const primary = `${LIVEPEER_CDN_BASES[0]}/hls/${playbackId}/index.m3u8`;
    return primary;
  }
  return fromApi;
}

/** Build all possible playback URLs for fallback (different Livepeer CDNs) */
function buildLivePlaybackUrls(nft: DeHubNFT): string[] {
  const stream = (nft as any).stream;
  const playbackId = stream?.playbackId;
  if (!playbackId) return [];
  return LIVEPEER_CDN_BASES.map(base => `${base}/hls/${playbackId}/index.m3u8`);
}

/**
 * Derive isLive from stream status fields.
 * A stream is live only when Livepeer reports it as active AND it hasn't been ended.
 */
function deriveIsLive(nft: DeHubNFT): boolean {
  const explicit = (nft as any).isLive;
  if (explicit !== undefined) return !!explicit;
  const stream = (nft as any).stream;
  if (!stream) return false;

  // Ended: isActive=false or status=ENDED takes priority over everything
  if (stream.isActive === false) return false;
  const status = (stream.status || '').toUpperCase();
  if (status === 'ENDED' || status === 'INACTIVE') return false;
  // settings.status='ended' means we PATCHed it as ended
  if (stream.settings?.status === 'ended') return false;

  return status === 'LIVE' || status === 'ACTIVE';
}

/**
 * Transform API NFT data to LiveStream format
 */
function toLiveStream(nft: DeHubNFT): LiveStream {
  // Canonical avatar resolution (matches feed normalization)
  const creatorObj = (nft as any).creator;
  const ownerObj = (nft as any).owner;
  const rawAvatarPath = extractAvatarPath(nft) || extractAvatarPath(creatorObj);
  const resolvedAddress = nft.minter || creatorObj?.id || creatorObj?.address;
  const avatar = rawAvatarPath && resolvedAddress ? buildAvatarUrl(resolvedAddress, rawAvatarPath) || '/placeholder.svg' : '/placeholder.svg';
  
  const streamObj = (nft as any).stream;

  return {
    id: String(nft.tokenId),
    contentRating: nft.contentRating,
    type: 'live',
    // The Mongo ObjectId every /api/live/{id}/* route requires. Without it the
    // card falls back to the numeric tokenId and like/gift/activities/end all
    // 500 (or silently no-op) server-side. Same resolution as the feed mapper.
    streamId: streamObj?._id || streamObj?.streamId || undefined,
    streamer: nft.minterDisplayName || nft.minterUsername || nft.mintername || creatorObj?.display_name || creatorObj?.username || ownerObj?.username || 'Unknown',
    avatar,
    title: nft.title || nft.name || 'Live Stream',
    game: nft.description || '',
    viewers: formatViews(resolveViewCount(nft)).replace(' views', ''),
    thumbnail: buildImageUrl(nft.tokenId, nft.imageUrl) || '',
    tags: [],
    isLive: deriveIsLive(nft),
    creatorId: resolvedAddress,
    creatorUsername: nft.minterUsername || nft.mintername || creatorObj?.username || ownerObj?.username,
    creatorBadgeBalance: (nft as any).minterUser?.badgeBalance ?? (nft as any).badgeBalance,
    likeCount: resolveLikeCount(nft),
    commentCount: nft.commentCount || nft.comment_count || 0,
    playbackUrl: buildLivePlaybackUrl(nft),
    playbackUrls: buildLivePlaybackUrls(nft),
  };
}

/**
 * Live post wrapper: merges Supabase live status when api.dehub.io /start fails
 */
function LivePostWithStatus({ liveData, post }: { liveData: LiveStream; post: DeHubNFT }) {
  const tokenId = String(post.tokenId ?? (post as any).tokenId ?? liveData.id);
  const { data: isLiveFromSupabase } = useStreamLiveStatus(tokenId);
  const mergedStream: LiveStream = {
    ...liveData,
    isLive: liveData.isLive || !!isLiveFromSupabase,
  };
  return <LiveStreamCard stream={mergedStream} />;
}

/**
 * Processing state component for posts still being minted
 */
function ProcessingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center mb-4">
        <Clock className="w-8 h-8 text-zinc-400 animate-pulse" />
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Post is Processing</h2>
      <p className="text-zinc-400 max-w-md">
        This post is being minted on decentralized databases. 
        Metadata is being validated and will be available shortly.
      </p>
    </div>
  );
}

/**
 * Error state component for posts not found
 */
function NotFoundState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <ThemedIcon icon="posts" alt="" className="w-16 h-16 object-contain mb-4 opacity-80" />
      <h2 className="text-xl font-semibold text-white mb-2">Post Not Found</h2>
      <p className="text-zinc-400 max-w-md">
        This post may have been removed or the link is incorrect.
      </p>
    </div>
  );
}

/**
 * Loading state component
 */
function LoadingState() {
  return (
    <div className="space-y-3 py-4">
      <VideoCardSkeleton />
      <PostCardSkeleton />
    </div>
  );
}

/**
 * Immersive header for video posts - back button + creator info on same line
 */
interface ImmersiveVideoHeaderProps {
  fallbackRoute?: string;
  channel?: string;
  channelAvatar?: string;
  creatorUsername?: string;
  creatorId?: string;
  verified?: boolean;
  showBack?: boolean;
  /** Override the back action (e.g. close the drawer with animation first) */
  onBack?: () => void;
}

function ImmersiveVideoHeader({
  fallbackRoute = '/app',
  channel,
  channelAvatar,
  creatorUsername,
  creatorId,
  verified = false,
  showBack = true,
  onBack,
}: ImmersiveVideoHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if ((location.key && location.key !== 'default') || window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallbackRoute, { replace: true });
    }
  };

  const handleProfileClick = () => {
    if (creatorUsername) {
      const cleanUsername = creatorUsername.replace('@', '');
      navigate(`/${cleanUsername}`);
    } else if (creatorId) {
      navigate(`/app/profile?id=${creatorId}`);
    }
  };

  const isClickable = !!(creatorId || creatorUsername);

  if (!showBack) return null;

  return (
    <div className="absolute top-2 left-2 z-50">
      <button
        onClick={handleBack}
        className="h-8 w-8 rounded-xl bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10 hover:bg-black/60 transition-colors flex items-center justify-center"
        aria-label="Go back"
      >
        <ArrowLeft className="w-4 h-4 text-white" />
      </button>
    </div>
  );
}

/**
 * Desktop creator row for a video post.
 *
 * This is deliberately the SAME markup the home feed's VideoCard renders above
 * its player — `CardHeader` plus the Sparkles/MoreVertical pair — rather than a
 * second hand-rolled avatar+name block. The hand-rolled one drifted: a 40px
 * square avatar against the feed's 36px, no badge icon, no profile hover card,
 * `mb-4` where the feed uses CardHeader's own `pb-3`, and a lucide-free inline
 * check instead of the feed's CheckCircle. It also lived OUTSIDE the bento, so
 * the card visibly started at the video and the creator sat on the bare canvas
 * with no glass behind it — the "bento doesn't wrap the username" report. It is
 * rendered inside the bento now, so one frosted card holds the whole post.
 */
interface DesktopCreatorInfoProps {
  channel?: string;
  channelAvatar?: string;
  creatorUsername?: string;
  creatorId?: string;
  verified?: boolean;
  badgeBalance?: number;
  onAIClick?: () => void;
  onMenuClick?: () => void;
}

function DesktopCreatorInfo({
  channel,
  channelAvatar,
  creatorUsername,
  creatorId,
  verified = false,
  badgeBalance,
  onAIClick,
  onMenuClick,
}: DesktopCreatorInfoProps) {
  if (!channel) return null;

  return (
    <div className="flex items-start justify-between">
      <CardHeader
        username={channel}
        handle={creatorUsername}
        avatarSeed={channelAvatar || ''}
        verified={verified}
        contentType="video"
        creatorId={creatorId}
        creatorUsername={creatorUsername}
        badgeBalance={badgeBalance}
      />

      {/* Action buttons — same icons at the same 23.5px the feed card uses. */}
      <div className="flex items-center gap-1">
        <button
          onClick={onAIClick}
          className="text-zinc-400 hover:text-white transition-colors"
          aria-label="Ask AI about this video"
        >
          <Sparkles className="w-[23.5px] h-[23.5px]" />
        </button>
        <button
          onClick={onMenuClick}
          className="text-zinc-400 hover:text-white transition-colors -mr-0.5"
          aria-label="Post options"
        >
          <MoreVertical className="w-[23.5px] h-[23.5px]" />
        </button>
      </div>
    </div>
  );
}

interface SinglePostPageProps {
  /**
   * True when AppLayout renders this inside the from-feed post overlay. That
   * layer is its own scroll container, so the page must not touch the document
   * scroll — doing so would move the home feed mounted underneath and throw
   * away the position the user comes back to.
   */
  inOverlay?: boolean;
  /**
   * Render a specific post regardless of the route params. NewPostPage uses
   * this to show an off-chain post AT its /newpost/<n> URL — navigating to
   * /app/post/<tokenId> instead would swap the address bar to the NFT-style
   * URL the slug exists to avoid.
   */
  overrideId?: string;
}

/**
 * Canonical URL for a post page. The /posts/* short forms are first-class URLs
 * now, so a visitor on /posts/1/b gets that exact URL in the meta tags rather
 * than being forced back to /app/post/1.
 */
function postSeoUrl(pathname: string, id?: string): string {
  return pathname.startsWith('/posts/')
    ? `https://dehub.io${pathname}`
    : `https://dehub.io/app/post/${id}`;
}

export default function SinglePostPage({ inOverlay = false, overrideId }: SinglePostPageProps = {}) {
  const { postId, tokenId, commentId } = useParams<{ postId?: string; tokenId?: string; commentId?: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const id = overrideId || postId || tokenId;
  const location = useLocation();

  // Deep link to one comment: the thread-entry form (/posts/1/b/55) carries it
  // as a path segment; the legacy share form (?comment=55) keeps working too.
  const focusCommentId = commentId || new URLSearchParams(location.search).get('comment') || undefined;
  const [highlightCommentId, setHighlightCommentId] = useState<string | undefined>(focusCommentId);
  useEffect(() => {
    setHighlightCommentId(focusCommentId);
  }, [focusCommentId]);
  
  // Detect if opened from feed (overlay mode)
  const isFromFeed = !!(location.state as any)?.fromFeed;
  
  // Hide back button when there's no navigation history (direct URL access)
  const hasHistory = isFromFeed || !!(location.key && location.key !== 'default') || window.history.length > 1;
  
  // State for desktop AI chat and options drawer
  const [showDesktopAIChat, setShowDesktopAIChat] = useState(false);
  const [showDesktopOptionsDrawer, setShowDesktopOptionsDrawer] = useState(false);
  const [showDesktopReportModal, setShowDesktopReportModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { walletAddress } = useAuth();
  const queryClient = useQueryClient();
  
  // Mobile/tablet vs desktop layout. The post used to open in a vaul bottom
  // sheet on mobile; it is now the same page it is on desktop, so this only
  // picks between the two layouts (immersive media on mobile, creator bar +
  // card chrome on desktop) and — unlike the old branch, which rendered the
  // desktop tree too and merely hid it with `lg:` classes — renders one, not
  // both. That alone stops mobile mounting a second copy of every video.
  const [isMobileView, setIsMobileView] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 1024
  );
  useEffect(() => {
    const onResize = () => setIsMobileView(window.innerWidth < 1024);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Scrolling content root. Used for the swallow clip on the standalone route,
  // where the page itself scrolls; in overlay mode AppLayout's fixed layer is
  // the scroller and clips itself.
  const postRootRef = useRef<HTMLDivElement>(null);

  const goBack = useCallback(() => {
    if (hasHistory) navigate(-1);
    else navigate('/app');
  }, [hasHistory, navigate]);

  // Open every post at its top.
  //
  // In overlay mode AppLayout's fixed layer is the scroller and resets itself,
  // so there is nothing to do here — and touching the page scroll would drag
  // the home feed underneath to the top and lose the user's place in it.
  //
  // On the standalone route the page itself scrolls, so reset it before paint.
  // This used to be gated on `useNavigationType() === 'PUSH'`, which never
  // matched: App.tsx renders `<Routes location={loc}>`, and react-router pins
  // navigationType to POP for every consumer below an explicit location. The
  // effect simply never ran, which is why a post opened at whatever offset the
  // feed was scrolled to. Nothing here needs the navigation type: a fresh post
  // id always starts at the top, and browser back/forward on a standalone post
  // is a full page view whose own scroll the browser restores.
  useLayoutEffect(() => {
    if (inOverlay) return;
    scrollDocumentTo(0);
  }, [id, inOverlay]);

  const { data: post, isLoading } = useQuery({
    queryKey: ['single-post', id],
    queryFn: async () => {
      // What we're already showing: the seed the feed card wrote on click, the
      // last good fetch, or the feed item behind `placeholderData` below. Used
      // to keep viewer flags when this response comes back anonymous.
      const shown =
        queryClient.getQueryData<DeHubNFT>(['single-post', id]) ??
        (findCachedFeedPost(queryClient, id!) as unknown as DeHubNFT | undefined);

      // Try NFT info first (works for minted posts with tokenIds)
      try {
        const nft = await getNFTInfo(id!);
        const normalizedNft = {
          ...nft,
          createdAt: nft.createdAt || nft.created_at || (nft as any).mintedAt || (nft as any).minted_at || (nft as any).updatedAt || (nft as any).updated_at || '',
        };

        // api.dehub.io answers a request carrying an expired token with 200 and
        // NO viewer fields rather than 401. Replacing the seed wholesale with
        // such a response is what flipped a liked post to unliked one second
        // after opening it. Counts still come from the response; only the
        // per-viewer flags are carried over.
        const merged = mergeViewerState(normalizedNft, shown);

        // Enrich quote post if quotedPost data is missing
        if (merged.isQuotePost && merged.quotedTokenId && !merged.quotedPost) {
          try {
            const quoted = await getNFTInfo(String(merged.quotedTokenId));
            return { ...merged, quotedPost: quoted };
          } catch {
            // If we can't fetch the quoted post, still return the main post
            return merged;
          }
        }

        return merged;
      } catch {
        // Fallback: try livestream API (stream IDs from /api/live are not NFT tokenIds)
        const liveRes = await getLiveStream(id!);
        const stream: any = (liveRes as any)?.result || liveRes;
        if (!stream) throw new Error('Post not found');
        
        // Convert livestream data to DeHubNFT-like shape for unified rendering
        const account = (stream as any).account;
        return {
          // Prefer the stream doc's own numeric NFT tokenId: downstream this
          // becomes stream.id, which the on-chain gift path BigInt()-encodes
          // — a hex Mongo _id there throws. The _id stays available for the
          // /api/live/{id}/* routes via the `stream` passthrough below.
          tokenId: (stream as any).tokenId ?? ((stream as any)._id || stream.streamId || id),
          // Carry the raw stream doc so toLiveStream can resolve the Mongo
          // ObjectId (stream._id) for the /api/live/{id}/* interaction routes.
          stream,
          name: stream.title,
          title: stream.title,
          description: stream.description,
          postType: 'live',
          isLive: stream.status === 'live' || (stream.status as string) === 'LIVE' || stream.status === 'active' || !!(stream as any).streamKey,
          videoUrl: stream.playbackUrl || ((stream as any).playbackId ? `https://livepeercdn.studio/hls/${(stream as any).playbackId}/index.m3u8` : undefined),
          playbackUrl: stream.playbackUrl || ((stream as any).playbackId ? `https://livepeercdn.studio/hls/${(stream as any).playbackId}/index.m3u8` : undefined),
          imageUrl: stream.thumbnailUrl || (stream as any).thumbnail,
          views: stream.viewerCount || (stream as any).totalViews || 0,
          totalVotes: { for: stream.likeCount || (stream as any).likes || 0, against: 0 },
          minter: stream.address || account?.address,
          minterDisplayName: account?.displayName || account?.username || stream.streamer?.displayName,
          minterUsername: account?.username || stream.streamer?.username,
          minterAvatarUrl: account?.avatarImageUrl || account?.avatarUrl || stream.streamer?.avatarImageUrl,
          category: (stream as any).categories || (stream.category ? [stream.category] : []),
          creator: account ? { id: account.address, username: account.username, display_name: account.displayName, avatar_url: account.avatarImageUrl || account.avatarUrl } : undefined,
        } as unknown as DeHubNFT;
      }
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    // Instant open: if any feed cache already holds THIS post, paint it
    // immediately while the authoritative getNFTInfo fetch runs behind it.
    // Never fall back to previousData — that's the PREVIOUS post's content
    // (navigating post A → post B used to flash A's body under B's URL).
    placeholderData: () =>
      findCachedFeedPost(queryClient, id!) as unknown as DeHubNFT | undefined,
    // Always overlay the vote cache so a vote cast seconds ago outranks a
    // response that predates it (both counters are written, not just totalVotes).
    select: (data) => {
      if (!data || !id) return data;
      const cached = getVoteCache(id);
      if (!cached) return data;
      return applyVoteStateToNFT(data, cached);
    },
  });

  // Check if we have cached data (from feed navigation) to show immediately
  const hasCachedData = !!post;

  // Defer related-feed mounting until the main post has painted and the
  // browser is idle. The related feeds fire their own network requests and
  // render ~10 cards on mount, which otherwise competes with the main post's
  // media loading the moment the page opens.
  const [showRelated, setShowRelated] = useState(false);
  useEffect(() => {
    if (!post || showRelated) return;
    let cancelIdle: (() => void) | undefined;
    const raf = requestAnimationFrame(() => {
      if ('requestIdleCallback' in window) {
        const idleId = requestIdleCallback(() => setShowRelated(true), { timeout: 1500 });
        cancelIdle = () => cancelIdleCallback(idleId);
      } else {
        const timerId = setTimeout(() => setShowRelated(true), 400);
        cancelIdle = () => clearTimeout(timerId);
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelIdle?.();
    };
  }, [post, showRelated]);
  
  // Determine content type
  const contentType = post ? getContentType(post) : null;
  // toLiveStream builds fresh playbackUrls arrays; called inline in render it
  // handed LiveStreamCard new array identities on every page re-render, and
  // the playback effect (keyed on urlsToTry) tore down and re-created the
  // player each time — a guaranteed visible restart when showRelated flips
  // ~1s after paint. Memoize on the post object instead.
  const liveData = useMemo(
    () => (post && getContentType(post) === 'live' ? toLiveStream(post) : null),
    [post]
  );
  const isAudioPost = post ? ((post as any).postType === 'audio' || (post as any).postType === 'feed-audio') : false;
  const isVideoPost = contentType === 'video' && !isAudioPost;
  const isImagePost = contentType === 'image';
  const isTextPost = contentType === 'post' || contentType === null;

  // Deep link to a thread entry: scroll it into view once the thread has
  // rendered, and let the highlight ring live for a few seconds. The element
  // can lag the page by a fetch (the thread mounts with post data), so poll
  // briefly rather than giving up after one paint.
  useEffect(() => {
    if (!post || !focusCommentId) return;
    let cancelled = false;
    const tryScroll = (attempt: number) => {
      if (cancelled) return;
      const el = document.querySelector(`[data-comment-id="${CSS.escape(focusCommentId)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (attempt < 12) window.setTimeout(() => tryScroll(attempt + 1), 250);
    };
    const start = window.setTimeout(() => tryScroll(0), 150);
    const stop = window.setTimeout(() => setHighlightCommentId(undefined), 4500);
    return () => {
      cancelled = true;
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [post, focusCommentId]);

  // Swallow the post content at the sticky nav pill's top edge under the glass
  // themes, exactly like the home feed. Only for the standalone route: in
  // overlay mode the scroll surface is AppLayout's fixed layer, which runs its
  // own clip. No-op on opaque-nav themes and when no pill is visible.
  useFeedSwallowClip(postRootRef, '[data-feed-nav]', [inOverlay, isMobileView, contentType]);

  // Hide mobile header for video posts by adding a class to the body
  useEffect(() => {
    if (isVideoPost) {
      document.body.classList.add('immersive-video-mode');
    }
    return () => {
      document.body.classList.remove('immersive-video-mode');
    };
  }, [isVideoPost]);

  // (The `body { pointer-events: none }` guard that used to live here is gone
  // with the sheet: vaul set it even at modal={false}, which blocked taps on the
  // fixed mobile header, and undoing it needed a MutationObserver on the body
  // for as long as the post was open. The post is a plain page now, so there is
  // nothing to fight.)

  // Clearance for the chrome floating above the post, and for the mobile bottom
  // nav floating below it. In overlay mode the layer spans the whole viewport, so
  // the post has to clear the mobile header (h-11) plus the home feed's nav pill
  // — 5.5rem, the same resting offset the old bottom sheet had — and on desktop
  // just the pill. On the standalone route that chrome is in normal flow above
  // the content and needs none. Padding rather than an outer offset, so the post
  // scrolls up *under* the pill and gets swallowed at its edge like the feed.
  const chromeClearance = inOverlay
    ? 'pt-[5.5rem] pb-24 lg:pt-14 lg:pb-8'
    : 'pt-3 pb-8 lg:pt-0';

  // A video post hides that chrome on mobile instead of clearing it, so the media
  // starts at the very top of the screen and runs the full width — the shape the
  // immersive layout was always drawing, minus the 88px of nothing above it.
  // Desktop keeps its clearance: the chrome it clears is still on screen.
  const videoChromeClearance = inOverlay
    ? 'pb-24 lg:pt-14 lg:pb-8'
    : 'pb-8 lg:pt-0';

  // Determine content type and render appropriate card
  const renderContent = () => {
    // Only show loading if we have no data at all (not even cached)
    if (isLoading && !hasCachedData) return <LoadingState />;
    // Only treat it as "not found" when we genuinely have NO post to show.
    // We must NOT gate on `error` here: React Query retains the last good
    // `data` across a *failed background refetch* while still exposing `error`.
    // A seeded/loaded post that later hits a transient refetch failure (network
    // blip, request aborted on quick nav, cert/5xx hiccup) would otherwise flip
    // to "Post Not Found" even though we still hold valid data — the classic
    // "not found on back-nav, fine after refresh" bug. If `post` exists, render it.
    if (!post) return <NotFoundState />;
    
    // Handle processing posts. 'signed' is NOT transient: it is the for-life
    // status of a post published with mint opt-out, and those must render.
    if (post.status === 'pending') {
      return <ProcessingState />;
    }

    switch (contentType) {
      case 'video':
        return <VideoCard video={toVideoItem(post)} isImmersive={!isAudioPost} />;
      case 'image':
        return <ImageCard post={toImagePost(post)} />;
      case 'live': {
        if (!liveData) return <NotFoundState />;
        return (
          <LivePostWithStatus liveData={liveData} post={post} />
        );
      }
      default:
        return (
          <PostCard
            post={toTextPost(post)}
            threadSlot={
              id ? <AuthorThread tokenId={String(id)} authorAddress={post.minter} highlightId={highlightCommentId} /> : undefined
            }
          />
        );
    }
  };

  // Immersive layout for videos - uses fixed positioning to overlay the header area on mobile/tablet
  // Desktop gets standard layout with PageHeader
  // Both include the related videos feed below the main content
  if (isVideoPost && post) {
    const videoData = toVideoItem(post);
    // This branch returns before the shared SEOHead below — without its own,
    // shared video links get the generic app title and no OG tags.
    const videoSeoTitle = post.title || post.name || 'Video';
    const videoSeoDesc = post.description || 'Watch this video on DeHub';

    return (
      <>
        <SEOHead
          title={videoSeoTitle}
          description={videoSeoDesc.slice(0, 155)}
          url={postSeoUrl(location.pathname, id)}
          type="article"
          jsonLd={{
            '@context': 'https://schema.org',
            '@type': 'VideoObject',
            name: videoSeoTitle,
            description: videoSeoDesc,
            url: postSeoUrl(location.pathname, id),
            ...(videoData.thumbnail && { thumbnailUrl: videoData.thumbnail }),
            ...(post.createdAt && { uploadDate: post.createdAt }),
            publisher: { '@type': 'Organization', name: 'DeHub', url: 'https://dehub.io' },
          }}
        />
        {/* Mobile/tablet: a plain page, immersive media first, back button in the
            top nav pill. This used to be a vaul bottom sheet, which brought a
            portal, a transform animation, a body pointer-events fight and a
            second scroll container that everything else had to be re-wired to. */}
        {isMobileView ? (
          <div data-post-page data-glass-page ref={inOverlay ? undefined : postRootRef} className={cn('flex flex-col bg-black', videoChromeClearance)}>
            <div className="relative">
              {/* Back sits on the video, YouTube-style. The mobile header and the
                  home feed's nav pill are hidden over an immersive video (see
                  `immersive-video-mode` in index.css), and the pill is what
                  carried the overlay's back arrow — so the post has to bring its
                  own, and this is the control that was built for it. */}
              <ImmersiveVideoHeader onBack={goBack} />
              {renderContent()}
            </div>
            {showRelated && id && <RelatedVideosFeed currentVideoId={id} />}
          </div>
        ) : (
          /* Desktop: flush layout — top nav bar handles chrome, no floating back-button bento */
          <div data-post-page ref={inOverlay ? undefined : postRootRef} className="flex flex-col">
            <div className={cn('px-2 sm:px-3', chromeClearance)}>
              <div className="w-full">
                {/* One bento around the whole post — creator row included — with
                    the exact className HomeFeed wraps every feed card in, so the
                    canvas themes' shared [data-feed-item] glass frosts it
                    identically on both surfaces. The creator row used to sit
                    above this div, which left the card starting mid-post at the
                    video's top edge. */}
                <div data-feed-item className="rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3">
                  <DesktopCreatorInfo
                    channel={videoData.channel}
                    channelAvatar={videoData.channelAvatar}
                    creatorUsername={videoData.creatorUsername}
                    creatorId={videoData.creatorId}
                    verified={videoData.verified}
                    badgeBalance={videoData.creatorBadgeBalance}
                    onAIClick={() => setShowDesktopAIChat(true)}
                    onMenuClick={() => setShowDesktopOptionsDrawer(true)}
                  />
                  {renderContent()}
                  {id && parseInt(id, 10) > 0 && <PollCard tokenId={parseInt(id, 10)} />}
                </div>
                {/* Related Videos Feed */}
                {showRelated && id && <RelatedVideosFeed currentVideoId={id} />}
              </div>
            </div>
          </div>
        )}

        {/* Desktop AI Chat */}
        <PostAIChat
          isOpen={showDesktopAIChat}
          onClose={() => setShowDesktopAIChat(false)}
          postContext={{
            type: 'video',
            author: videoData.channel,
            title: videoData.title,
            imageUrl: videoData.thumbnail,
            videoUrl: videoData.videoUrl,
          }}
        />

        {/* Desktop Report Modal */}
        <ReportModal
          open={showDesktopReportModal}
          onOpenChange={setShowDesktopReportModal}
          tokenId={id || ''}
          contentType="video"
        />

        {/* Desktop Options Drawer */}
        <Drawer open={showDesktopOptionsDrawer} onOpenChange={setShowDesktopOptionsDrawer}>
          <DrawerContent glass className="px-4 pb-6">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-white text-lg">{t('postOptions.options')}</DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col gap-1">
              {!(walletAddress && videoData.creatorId?.toLowerCase() === walletAddress.toLowerCase()) && (
                <button
                  onClick={() => { setShowDesktopOptionsDrawer(false); setShowTipModal(true); }}
                  className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                >
                  <Gem className="w-5 h-5" /> {t('postOptions.sendTip')}
                </button>
              )}
              {/* Queue / Watch List removed until implemented — they rendered
                  as clickable options that silently did nothing. */}
              <button
                onClick={() => {
                  setShowDesktopOptionsDrawer(false);
                  setShowDesktopReportModal(true);
                }}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Flag className="w-5 h-5" /> {t('postOptions.report')}
              </button>
              {/* Download removed until implemented — dead button. */}
              <button 
                onClick={() => {
                  const url = `${window.location.origin}/app/post/${id}`;
                  navigator.clipboard.writeText(url)
                    .then(() => toast.success(t('postOptions.linkCopied')))
                    .catch(() => toast.error(t('postOptions.copyFailed', 'Could not copy link')));
                  setShowDesktopOptionsDrawer(false);
                }}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Link2 className="w-5 h-5" /> {t('postOptions.copyLink')}
              </button>
              {/* Block Creator removed until implemented — dead button. */}
              {walletAddress && videoData.creatorId?.toLowerCase() === walletAddress.toLowerCase() && (
                <>
                  <div className="border-t border-white/10 my-1" />
                  <button
                    onClick={() => { setShowDesktopOptionsDrawer(false); setShowEditModal(true); }}
                    className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <Pencil className="w-5 h-5" /> {t('postOptions.editPost')}
                  </button>
                  <button
                    onClick={() => { setShowDesktopOptionsDrawer(false); setShowDeleteModal(true); }}
                    className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-white/10 rounded-xl transition-colors text-left"
                  >
                    <Trash2 className="w-5 h-5" /> {t('postOptions.deletePost')}
                  </button>
                </>
              )}
            </div>
          </DrawerContent>
        </Drawer>

        {/* Edit Post Modal */}
        <EditPostModal
          open={showEditModal}
          onOpenChange={setShowEditModal}
          tokenId={id || ''}
          currentTitle={videoData.title}
          currentDescription={videoData.description}
          currentContentRating={videoData.contentRating}
          onSuccess={(edited) => {
            applyOptimisticEdit(queryClient, id || '', edited);
          }}
        />

        {/* Delete Post Modal */}
        <DeletePostModal
          open={showDeleteModal}
          onOpenChange={setShowDeleteModal}
          tokenId={id || ''}
          onSuccess={() => navigate('/app')}
        />

        {/* Tip Modal */}
        <TipModal
          open={showTipModal}
          onOpenChange={setShowTipModal}
          creatorAddress={videoData.creatorId}
          creatorName={videoData.channel}
          context={id || undefined}
        />
      </>
    );
  }

  // Build SEO title/description from post data
  const seoTitle = post?.title || post?.name || 'Post';
  const seoDesc = post?.description || `View this post on DeHub`;

  // Standard layout for other content types
  const isLivePost = contentType === 'live';

  const renderPostContent = () => (
    <>
      {/* Header removed — top nav bar provides chrome; no floating back-button bento on any breakpoint */}
      <div className={cn('px-2 sm:px-3', chromeClearance)}>
        <div className="w-full">
          {/* The post's bento — deliberately the same markup HomeFeed wraps every
              feed card in, className and all, so the canvas themes' shared
              [data-feed-item] glass paints it identically on both surfaces.
              It wraps the post and its poll and nothing else: the related feeds
              and the live chat below are siblings, not children, so this is one
              card's bento and not a full-height slab down the column. */}
          <div data-feed-item className="rounded-2xl border border-white/[0.12] bg-white/[0.03] p-3">
            {renderContent()}
            {!isTextPost && id && parseInt(id, 10) > 0 && <PollCard tokenId={parseInt(id, 10)} />}
          </div>
          {/* Shop rail sits between the player and the chat: close enough to the
              stream to read as part of it, above the chat so a busy room does
              not push it off screen. The host sees the manager instead — they
              are not a customer of their own broadcast. */}
          {isLivePost && id && post && (
            walletAddress && post.minter?.toLowerCase() === walletAddress.toLowerCase()
              ? <StreamShopManager tokenId={id} />
              : <StreamShopRail tokenId={id} />
          )}
          {isLivePost && id && post && (
            <LivePostChat
              streamId={id}
              isOffline={!('isLive' in post ? (post as any).isLive : true)}
              isHost={!!(walletAddress && post.minter?.toLowerCase() === walletAddress.toLowerCase())}
            />
          )}
          {showRelated && isImagePost && id && <RelatedImagesFeed currentPostId={id} />}
          {showRelated && isAudioPost && id && <RelatedVideosFeed currentVideoId={id} />}
          {showRelated && !isImagePost && !isVideoPost && !isAudioPost && !isLivePost && id && <RelatedPostsFeed currentPostId={id} />}
        </div>
      </div>
    </>
  );

  return (
    <>
      <SEOHead
        title={seoTitle}
        description={seoDesc}
        url={postSeoUrl(location.pathname, id)}
        type="article"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: seoTitle,
          description: seoDesc,
          url: postSeoUrl(location.pathname, id),
          ...(post?.minterDisplayName && { author: { '@type': 'Person', name: post.minterDisplayName } }),
          ...(post?.createdAt && { datePublished: post.createdAt }),
          publisher: { '@type': 'Organization', name: 'DeHub', url: 'https://dehub.io' },
        }}
      />
      {/* One layout for every breakpoint. `chromeClearance` is padding INSIDE the
          scrolling content (not an outer margin) so the post scrolls up UNDER the
          sticky nav pill and is swallowed at its rounded top edge on the glass
          themes, exactly like the home feed. */}
      <div
        ref={inOverlay ? undefined : postRootRef}
        data-post-page
        data-glass-page
        className={cn('flex flex-col', isLivePost && 'bg-black min-h-screen')}
      >
        {renderPostContent()}
      </div>
    </>
  );
}

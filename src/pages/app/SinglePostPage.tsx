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

import { useParams, useNavigationType, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useLayoutEffect, useEffect, useState, useRef } from 'react';
import { AlertCircle, Clock, ArrowLeft, Sparkles, MoreVertical, ListPlus, Flag, Download, Link2 } from 'lucide-react';
import { useTranslation as useI18n } from 'react-i18next';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import dehubCoin from '@/assets/dehub-coin.png';
import { getNFTInfo, getLiveStream, type DeHubNFT } from '@/lib/api/dehub';
import { useStreamLiveStatus } from '@/hooks/use-stream-live-status';

import { buildAvatarUrl, extractAvatarPath, buildImageUrl, buildFeedImageUrls, buildVideoUrl } from '@/lib/media-url';
import { PageHeader } from '@/components/app/PageHeader';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { PostCard } from '@/components/app/cards/PostCard';
import { LiveStreamCard } from '@/components/app/cards/LiveStreamCard';
import { RelatedVideosFeed } from '@/components/app/feeds/RelatedVideosFeed';
import { RelatedImagesFeed } from '@/components/app/feeds/RelatedImagesFeed';
import { RelatedPostsFeed } from '@/components/app/feeds/RelatedPostsFeed';
import { LivePostChat } from '@/components/app/cards/LivePostChat';
import { PostAIChat } from '@/components/app/cards/PostAIChat';
import { ReportModal } from '@/components/app/modals/ReportModal';
import { TipModal } from '@/components/app/modals/TipModal';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { formatTimeAgo, formatDuration, formatViews } from '@/lib/feed-utils';
import { useAuth } from '@/contexts/AuthContext';
import { VideoCardSkeleton, ImageCardSkeleton, PostCardSkeleton } from '@/components/app/feeds/FeedSkeletons';
import type { VideoItem, ImagePost, TextPost, LiveStream } from '@/types/feed.types';

/**
 * Detect content type from API response
 */
function getContentType(post: DeHubNFT): 'video' | 'image' | 'post' | 'live' {
  const postType = (post as any).postType as string | undefined;
  if (postType === 'live' || (post as any).isLive !== undefined) return 'live';
  // Audio posts render through VideoCard (which has AudioVisualizer support)
  if (postType === 'audio' || postType === 'feed-audio') return 'video';
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
  const views = formatViews(nft.views || 0).replace(' views', '');
  const title = nft.title || nft.name || '';
  const description = nft.description && nft.description !== title ? nft.description : undefined;
  const timestamp = nft.createdAt || nft.created_at || (nft as any).mintedAt || (nft as any).minted_at || (nft as any).updatedAt || (nft as any).updated_at;
  
  // Detect audio posts
  const postType = (nft as any).postType as string | undefined;
  const isAudioPost = postType === 'audio' || postType === 'feed-audio';
  
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
  
  // Build audio URL for audio posts (same logic as feed normalizer)
  const rawAudioUrl = (nft as any).audioUrl as string | undefined;
  const audioUrl = isAudioPost && rawAudioUrl
    ? (rawAudioUrl.startsWith('http') ? rawAudioUrl : `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/${rawAudioUrl}`)
    : undefined;
  
  return {
    id: String(nft.tokenId),
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
    isLiked: nft.isLiked,
    isDisliked: nft.isDisliked,
    likeCount: nft.totalVotes?.for || 0,
    dislikeCount: nft.totalVotes?.against || 0,
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
  const views = formatViews(nft.views || 0).replace(' views', '');
  
  // Canonical image resolution (matches feed normalization)
  const primaryImage = buildImageUrl(nft.tokenId, nft.imageUrl) || '/placeholder.svg';
  const feedImages = buildFeedImageUrls(nft.imageUrls);
  const imageUrls = feedImages && feedImages.length > 0 ? feedImages : [primaryImage];
  
  const title = nft.title || nft.name;
  const description = nft.description && nft.description !== title ? nft.description : undefined;
  const timestamp = nft.createdAt || nft.created_at || (nft as any).mintedAt || (nft as any).minted_at || (nft as any).updatedAt || (nft as any).updated_at;
  const streamInfo = nft.streamInfo;
  
  // Canonical avatar resolution (matches feed normalization)
  const creatorObj = (nft as any).creator;
  const ownerObj = (nft as any).owner;
  const rawAvatarPath = extractAvatarPath(nft) || extractAvatarPath(creatorObj);
  const resolvedAddress = nft.minter || creatorObj?.id || creatorObj?.address;
  const avatar = rawAvatarPath && resolvedAddress ? buildAvatarUrl(resolvedAddress, rawAvatarPath) || '/placeholder.svg' : '/placeholder.svg';
  
  return {
    id: String(nft.tokenId),
    type: 'image',
    username: nft.minterDisplayName || nft.minterUsername || nft.mintername || creatorObj?.display_name || creatorObj?.username || ownerObj?.username || 'Unknown',
    verified: false,
    avatar,
    image: primaryImage,
    imageUrls,
    title,
    description,
    likes: nft.totalVotes?.for || 0,
    caption: description || '',
    comments: nft.commentCount || nft.comment_count || 0,
    status: nft.status,
    views,
    timeAgo: formatTimeAgo(timestamp),
    creatorId: resolvedAddress,
    creatorUsername: nft.minterUsername || nft.mintername || creatorObj?.username || ownerObj?.username,
    isLiked: nft.isLiked,
    isDisliked: nft.isDisliked,
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
  };
}

/**
 * Transform API NFT data to TextPost format
 */
function toTextPost(nft: DeHubNFT): TextPost {
  const views = formatViews(nft.views || 0).replace(' views', '');
  const timestamp = nft.createdAt || nft.created_at || (nft as any).mintedAt || (nft as any).minted_at || (nft as any).updatedAt || (nft as any).updated_at;
  
  // Canonical avatar resolution (matches feed normalization)
  const creatorObj = (nft as any).creator;
  const ownerObj = (nft as any).owner;
  const rawAvatarPath = extractAvatarPath(nft) || extractAvatarPath(creatorObj);
  const resolvedAddress = nft.minter || creatorObj?.id || creatorObj?.address;
  const avatar = rawAvatarPath && resolvedAddress ? buildAvatarUrl(resolvedAddress, rawAvatarPath) || '/placeholder.svg' : '/placeholder.svg';
  
  return {
    id: String(nft.tokenId),
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
    },
    content: nft.description || nft.title || nft.name || '',
    stats: {
      comments: nft.commentCount || nft.comment_count || 0,
      reposts: (nft.totalReposts || nft.reposts || 0) + (nft.quotes || 0),
      likes: nft.totalVotes?.for || 0,
    },
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
  
  return {
    id: String(nft.tokenId),
    type: 'live',
    streamer: nft.minterDisplayName || nft.minterUsername || nft.mintername || creatorObj?.display_name || creatorObj?.username || ownerObj?.username || 'Unknown',
    avatar,
    title: nft.title || nft.name || 'Live Stream',
    game: nft.description || '',
    viewers: formatViews(nft.views || 0).replace(' views', ''),
    thumbnail: buildImageUrl(nft.tokenId, nft.imageUrl) || '/placeholder.svg',
    tags: [],
    isLive: deriveIsLive(nft),
    creatorId: resolvedAddress,
    creatorUsername: nft.minterUsername || nft.mintername || creatorObj?.username || ownerObj?.username,
    likeCount: nft.totalVotes?.for || 0,
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
  return (
    <>
      <LiveStreamCard stream={mergedStream} />
      <div className="mt-4">
        <LivePostChat streamId={liveData.id} isOffline={!mergedStream.isLive} />
      </div>
    </>
  );
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
      <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-zinc-400" />
      </div>
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
}

function ImmersiveVideoHeader({ 
  fallbackRoute = '/app',
  channel,
  channelAvatar,
  creatorUsername,
  creatorId,
  verified = false,
  showBack = true,
}: ImmersiveVideoHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(-1);
  };

  const handleProfileClick = () => {
    if (creatorUsername) {
      const cleanUsername = creatorUsername.replace('@', '');
      navigate(`/app/${cleanUsername}`);
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
 * Desktop creator info bar - shows avatar, display name, handle, and action buttons
 */
interface DesktopCreatorInfoProps {
  channel?: string;
  channelAvatar?: string;
  creatorUsername?: string;
  creatorId?: string;
  verified?: boolean;
  onAIClick?: () => void;
  onMenuClick?: () => void;
}

function DesktopCreatorInfo({
  channel,
  channelAvatar,
  creatorUsername,
  creatorId,
  verified = false,
  onAIClick,
  onMenuClick,
}: DesktopCreatorInfoProps) {
  const navigate = useNavigate();

  const handleProfileClick = () => {
    if (creatorUsername) {
      const cleanUsername = creatorUsername.replace('@', '');
      navigate(`/${cleanUsername}`);
    } else if (creatorId) {
      navigate(`/app/profile?id=${creatorId}`);
    }
  };

  const isClickable = !!(creatorId || creatorUsername);

  if (!channel) return null;

  return (
    <div className="flex items-center justify-between mb-4">
      <button
        onClick={handleProfileClick}
        disabled={!isClickable}
        className={`flex items-center gap-3 text-left ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'}`}
      >
        <div className="w-10 h-10 rounded-md shrink-0 overflow-hidden bg-zinc-700 flex items-center justify-center">
          {channelAvatar && channelAvatar !== '/placeholder.svg' ? (
            <img 
              src={channelAvatar} 
              alt={channel}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                const parent = (e.target as HTMLImageElement).parentElement;
                if (parent) {
                  const fallback = document.createElement('span');
                  fallback.className = 'text-white font-medium text-sm';
                  fallback.textContent = (channel || '?').charAt(0).toUpperCase();
                  parent.appendChild(fallback);
                }
              }}
            />
          ) : (
            <span className="text-white font-medium text-sm">{(channel || '?').charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-white text-sm truncate max-w-[160px] sm:max-w-none leading-tight">{channel}</span>
            {verified && (
              <svg className="w-4 h-4 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            )}
          </div>
          {creatorUsername && (
            <span className="text-zinc-500 text-xs truncate max-w-[160px] sm:max-w-none">@{creatorUsername.replace('@', '')}</span>
          )}
        </div>
      </button>
      
      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={onAIClick}
          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          aria-label="Ask AI about this video"
        >
          <Sparkles className="w-5 h-5" />
        </button>
        <button 
          onClick={onMenuClick}
          className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

export default function SinglePostPage() {
  const { postId, tokenId } = useParams<{ postId?: string; tokenId?: string }>();
  const { t } = useI18n();
  const id = postId || tokenId;
  const navigationType = useNavigationType();
  const location = useLocation();
  
  // Hide back button when there's no navigation history (direct URL access)
  const hasHistory = !!(location.key && location.key !== 'default');
  
  // State for desktop AI chat and options drawer
  const [showDesktopAIChat, setShowDesktopAIChat] = useState(false);
  const [showDesktopOptionsDrawer, setShowDesktopOptionsDrawer] = useState(false);
  const [showDesktopReportModal, setShowDesktopReportModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const { walletAddress } = useAuth();
  
  // Ref for mobile scroll container (needed for IntersectionObserver)
  const mobileScrollContainerRef = useRef<HTMLDivElement>(null);

  // Only scroll to top when PUSHING to the post page (not on back navigation)
  // useLayoutEffect runs before paint to prevent flash at wrong position
  useLayoutEffect(() => {
    if (navigationType === 'PUSH') {
      // Multi-target scroll for maximum cross-browser compatibility
      const scrollToTop = () => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      };
      
      scrollToTop();
      // Extra RAF attempt to override browser restoration
      requestAnimationFrame(scrollToTop);
    }
  }, [id, navigationType]);

  const { data: post, isLoading, error } = useQuery({
    queryKey: ['single-post', id],
    queryFn: async () => {
      // Try NFT info first (works for minted posts with tokenIds)
      try {
        return await getNFTInfo(id!);
      } catch {
        // Fallback: try livestream API (stream IDs from /api/live are not NFT tokenIds)
        const liveRes = await getLiveStream(id!);
        const stream: any = (liveRes as any)?.result || liveRes;
        if (!stream) throw new Error('Post not found');
        
        // Convert livestream data to DeHubNFT-like shape for unified rendering
        const account = (stream as any).account;
        return {
          tokenId: (stream as any)._id || stream.streamId || id,
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
    placeholderData: (previousData) => previousData,
  });

  // Check if we have cached data (from feed navigation) to show immediately
  const hasCachedData = !!post;
  
  // Determine content type
  const contentType = post ? getContentType(post) : null;
  const isVideoPost = contentType === 'video';
  const isImagePost = contentType === 'image';
  const isTextPost = contentType === 'post' || contentType === null;
  // Hide mobile header for video posts by adding a class to the body
  useEffect(() => {
    if (isVideoPost) {
      document.body.classList.add('immersive-video-mode');
    }
    return () => {
      document.body.classList.remove('immersive-video-mode');
    };
  }, [isVideoPost]);
  
  // Determine content type and render appropriate card
  const renderContent = () => {
    // Only show loading if we have no data at all (not even cached)
    if (isLoading && !hasCachedData) return <LoadingState />;
    if (error || !post) return <NotFoundState />;
    
    // Handle processing posts
    if (post.status === 'signed' || post.status === 'pending') {
      return <ProcessingState />;
    }

    switch (contentType) {
      case 'video':
        return <VideoCard video={toVideoItem(post)} isImmersive />;
      case 'image':
        return <ImageCard post={toImagePost(post)} />;
      case 'live': {
        const liveData = toLiveStream(post);
        return (
          <LivePostWithStatus liveData={liveData} post={post} />
        );
      }
      default:
        return <PostCard post={toTextPost(post)} />;
    }
  };

  // Immersive layout for videos - uses fixed positioning to overlay the header area on mobile/tablet
  // Desktop gets standard layout with PageHeader
  // Both include the related videos feed below the main content
  if (isVideoPost && post) {
    const videoData = toVideoItem(post);
    
    return (
      <>
        {/* Mobile/Tablet: Full immersive scrollable overlay */}
        <div 
          ref={mobileScrollContainerRef}
          className="flex flex-col fixed inset-0 z-50 bg-black lg:hidden overflow-y-auto"
        >
          <div className="relative">
            <ImmersiveVideoHeader
              channel={videoData.channel}
              channelAvatar={videoData.channelAvatar}
              creatorUsername={videoData.creatorUsername}
              creatorId={videoData.creatorId}
              verified={videoData.verified}
              showBack={hasHistory}
            />
            {renderContent()}
          </div>
          {/* Related Videos Feed */}
          {id && <RelatedVideosFeed currentVideoId={id} scrollContainerRef={mobileScrollContainerRef} />}
        </div>
        
        {/* Desktop: Standard layout with header */}
        <div className="hidden lg:flex lg:flex-col">
          <PageHeader showBack={hasHistory} />
          <div className="px-3 sm:px-4 pb-8">
            <div className="max-w-2xl mx-auto">
              {/* Creator info for desktop */}
              <DesktopCreatorInfo
                channel={videoData.channel}
                channelAvatar={videoData.channelAvatar}
                creatorUsername={videoData.creatorUsername}
                creatorId={videoData.creatorId}
                verified={videoData.verified}
                onAIClick={() => setShowDesktopAIChat(true)}
                onMenuClick={() => setShowDesktopOptionsDrawer(true)}
              />
              {renderContent()}
              {/* Related Videos Feed */}
              {id && <RelatedVideosFeed currentVideoId={id} />}
            </div>
          </div>
        </div>

        {/* Desktop AI Chat */}
        <PostAIChat
          isOpen={showDesktopAIChat}
          onClose={() => setShowDesktopAIChat(false)}
          postContext={{
            type: 'video',
            author: videoData.channel,
            title: videoData.title,
            imageUrl: videoData.thumbnail
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
                  <img src={dehubCoin} alt="DHB" className="w-5 h-5" /> {t('postOptions.sendTip')}
                </button>
              )}
              <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                <ListPlus className="w-5 h-5" /> {t('postOptions.queue')}
              </button>
              <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                <Clock className="w-5 h-5" /> {t('postOptions.watchList')}
              </button>
              <button 
                onClick={() => {
                  setShowDesktopOptionsDrawer(false);
                  setShowDesktopReportModal(true);
                }}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Flag className="w-5 h-5" /> {t('postOptions.report')}
              </button>
              {!videoData.isPPV && !videoData.isW2E && !videoData.isLocked && (
                <button className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left">
                  <Download className="w-5 h-5" /> {t('postOptions.download')}
                </button>
              )}
              <button 
                onClick={() => {
                  const url = `${window.location.origin}/app/post/${id}`;
                  navigator.clipboard.writeText(url);
                  toast.success(t('postOptions.linkCopied'));
                  setShowDesktopOptionsDrawer(false);
                }}
                className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <Link2 className="w-5 h-5" /> {t('postOptions.copyLink')}
              </button>
            </div>
          </DrawerContent>
        </Drawer>

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

  // Standard layout for other content types
  return (
    <div className="flex flex-col">
      <PageHeader showBack={hasHistory} />
      
      <div className="px-3 sm:px-4 pb-8 pt-2">
        <div className="max-w-2xl mx-auto">
          {renderContent()}
          {/* Related Images Feed - below image posts */}
          {isImagePost && id && <RelatedImagesFeed currentPostId={id} />}
          {!isImagePost && !isVideoPost && id && <RelatedPostsFeed currentPostId={id} />}
        </div>
      </div>
    </div>
  );
}

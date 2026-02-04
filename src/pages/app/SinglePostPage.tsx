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
import { useLayoutEffect, useEffect } from 'react';
import { Loader2, AlertCircle, Clock, ArrowLeft } from 'lucide-react';
import { getNFTInfo, getMediaUrl, type DeHubNFT } from '@/lib/api/dehub';
import { PageHeader } from '@/components/app/PageHeader';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { PostCard } from '@/components/app/cards/PostCard';
import { LiveStreamCard } from '@/components/app/cards/LiveStreamCard';
import { formatTimeAgo, formatDuration } from '@/lib/feed-utils';
import type { VideoItem, ImagePost, TextPost, LiveStream } from '@/types/feed.types';

/**
 * Detect content type from API response
 */
function getContentType(post: DeHubNFT): 'video' | 'image' | 'post' | 'live' {
  // Check if this is a live stream post
  if ((post as any).postType === 'live' || (post as any).isLive !== undefined) return 'live';
  if (post.postType === 'video' || post.videoUrl) return 'video';
  if (post.postType === 'image' || (post.imageUrl && !post.videoUrl)) return 'image';
  return 'post';
}

/**
 * Transform API NFT data to VideoItem format
 */
function toVideoItem(nft: DeHubNFT): VideoItem {
  const views = nft.views != null ? String(nft.views) : '0';
  const title = nft.title || nft.name || '';
  // Only use description if it's different from title (avoid duplicates)
  const description = nft.description && nft.description !== title ? nft.description : undefined;
  // API returns various timestamp fields - check all possibilities
  const timestamp = nft.createdAt || nft.created_at || (nft as any).mintedAt || (nft as any).minted_at || (nft as any).updatedAt || (nft as any).updated_at;
  
  return {
    id: String(nft.tokenId),
    type: 'video',
    thumbnail: getMediaUrl(nft.imageUrl) || '/placeholder.svg',
    videoUrl: getMediaUrl(nft.videoUrl),
    duration: formatDuration(nft.videoDuration || nft.duration),
    title,
    description,
    channel: nft.minterDisplayName || nft.mintername || 'Unknown',
    channelAvatar: getMediaUrl(nft.minterAvatarUrl) || '/placeholder.svg',
    verified: false,
    views,
    uploadedAgo: formatTimeAgo(timestamp),
    status: nft.status,
    stakedAmount: undefined,
    creatorId: nft.minter,
    creatorUsername: nft.mintername,
    isLiked: nft.isLiked,
    isDisliked: nft.isDisliked,
    likeCount: nft.totalVotes?.for || 0,
    dislikeCount: nft.totalVotes?.against || 0,
    commentCount: nft.commentCount || nft.comment_count || 0,
    isPPV: nft.is_ppv,
    ppvPrice: nft.ppv_price,
    ppvCurrency: nft.ppv_currency,
    isW2E: nft.is_w2e,
    isLocked: nft.is_locked,
    lockedPrice: nft.locked_price,
    lockedCurrency: nft.locked_currency,
  };
}

/**
 * Transform API NFT data to ImagePost format
 */
function toImagePost(nft: DeHubNFT): ImagePost {
  const views = nft.views != null ? String(nft.views) : '0';
  const imageUrls = nft.imageUrls?.map(url => getMediaUrl(url) || '') || [];
  const primaryImage = getMediaUrl(nft.imageUrl) || '/placeholder.svg';
  
  const title = nft.title || nft.name;
  // Only use description if it's different from title (avoid duplicates)
  const description = nft.description && nft.description !== title ? nft.description : undefined;
  // API returns various timestamp fields - check all possibilities
  const timestamp = nft.createdAt || nft.created_at || (nft as any).mintedAt || (nft as any).minted_at || (nft as any).updatedAt || (nft as any).updated_at;
  
  return {
    id: String(nft.tokenId),
    type: 'image',
    username: nft.minterDisplayName || nft.mintername || 'Unknown',
    verified: false,
    avatar: getMediaUrl(nft.minterAvatarUrl) || '/placeholder.svg',
    image: primaryImage,
    imageUrls: imageUrls.length > 0 ? imageUrls : [primaryImage],
    title,
    description,
    likes: nft.totalVotes?.for || 0,
    caption: description || '',
    comments: nft.commentCount || nft.comment_count || 0,
    status: nft.status,
    stakedAmount: undefined,
    views,
    timeAgo: formatTimeAgo(timestamp),
    creatorId: nft.minter,
    creatorUsername: nft.mintername,
    isLiked: nft.isLiked,
    isDisliked: nft.isDisliked,
  };
}

/**
 * Transform API NFT data to TextPost format
 */
function toTextPost(nft: DeHubNFT): TextPost {
  const views = nft.views != null ? String(nft.views) : '0';
  // API returns various timestamp fields - check all possibilities
  const timestamp = nft.createdAt || nft.created_at || (nft as any).mintedAt || (nft as any).minted_at || (nft as any).updatedAt || (nft as any).updated_at;
  
  return {
    id: String(nft.tokenId),
    type: 'post',
    createdAt: formatTimeAgo(timestamp),
    views,
    status: nft.status,
    author: {
      id: nft.minter,
      name: nft.minterDisplayName || nft.mintername || 'Unknown',
      handle: nft.mintername || nft.minter?.slice(0, 8) || 'anonymous',
      avatarSeed: getMediaUrl(nft.minterAvatarUrl) || '/placeholder.svg',
      verified: false,
      stakedAmount: undefined,
    },
    content: nft.description || nft.title || nft.name || '',
    stats: {
      comments: nft.commentCount || nft.comment_count || 0,
      reposts: 0,
      likes: nft.totalVotes?.for || 0,
    },
  };
}

/**
 * Transform API NFT data to LiveStream format
 */
function toLiveStream(nft: DeHubNFT): LiveStream {
  return {
    id: String(nft.tokenId),
    type: 'live',
    streamer: nft.minterDisplayName || nft.mintername || 'Unknown',
    avatar: getMediaUrl(nft.minterAvatarUrl) || '/placeholder.svg',
    title: nft.title || nft.name || 'Live Stream',
    game: nft.description || '',
    viewers: String(nft.views || 0),
    thumbnail: getMediaUrl(nft.imageUrl) || '/placeholder.svg',
    tags: [],
    isLive: (nft as any).isLive ?? false, // Default to not live (stream ended)
    creatorId: nft.minter,
    creatorUsername: nft.mintername,
    likeCount: nft.totalVotes?.for || 0,
    commentCount: nft.commentCount || nft.comment_count || 0,
  };
}

/**
 * Processing state component for posts still being minted
 */
function ProcessingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
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
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
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
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-8 h-8 text-white animate-spin" />
    </div>
  );
}

/**
 * Immersive back button for video posts - floats on top of the video
 */
function ImmersiveBackButton({ fallbackRoute = '/app' }: { fallbackRoute?: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (location.key && location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(fallbackRoute, { replace: true });
    }
  };

  return (
    <button
      onClick={handleBack}
      className="absolute top-3 left-3 z-20 p-2 rounded-xl bg-black/60 backdrop-blur-sm border border-white/10 hover:bg-black/80 transition-colors"
      aria-label="Go back"
    >
      <ArrowLeft className="w-5 h-5 text-white" />
    </button>
  );
}

export default function SinglePostPage() {
  const { postId, tokenId } = useParams<{ postId?: string; tokenId?: string }>();
  const id = postId || tokenId;
  const navigationType = useNavigationType();

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
    queryFn: () => getNFTInfo(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    // Use cached data from feed navigation as placeholder for instant display
    // This allows background refetch while showing content immediately
    placeholderData: (previousData) => previousData,
  });

  // Check if we have cached data (from feed navigation) to show immediately
  const hasCachedData = !!post;
  
  // Determine content type
  const contentType = post ? getContentType(post) : null;
  const isVideoPost = contentType === 'video';
  
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
      case 'live':
        return <LiveStreamCard stream={toLiveStream(post)} />;
      default:
        return <PostCard post={toTextPost(post)} />;
    }
  };

  // Immersive layout for videos
  if (isVideoPost) {
    return (
      <div className="flex flex-col -mt-11 lg:mt-0">
        <div className="relative">
          <ImmersiveBackButton />
          {renderContent()}
        </div>
      </div>
    );
  }

  // Standard layout for other content types
  return (
    <div className="flex flex-col">
      <PageHeader showBack />
      
      <div className="px-3 sm:px-4 pb-8">
        <div className="max-w-2xl mx-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

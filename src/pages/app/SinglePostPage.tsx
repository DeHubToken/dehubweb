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

import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, Clock } from 'lucide-react';
import { getNFTInfo, getMediaUrl, type DeHubNFT } from '@/lib/api/dehub';
import { PageHeader } from '@/components/app/PageHeader';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { PostCard } from '@/components/app/cards/PostCard';
import { formatTimeAgo, getViewCount, formatDuration } from '@/lib/feed-utils';
import type { VideoItem, ImagePost, TextPost } from '@/types/feed.types';

/**
 * Detect content type from API response
 */
function getContentType(post: DeHubNFT): 'video' | 'image' | 'post' {
  if (post.postType === 'video' || post.videoUrl) return 'video';
  if (post.postType === 'image' || (post.imageUrl && !post.videoUrl)) return 'image';
  return 'post';
}

/**
 * Transform API NFT data to VideoItem format
 */
function toVideoItem(nft: DeHubNFT): VideoItem {
  const views = nft.views != null ? String(nft.views) : getViewCount(String(nft.tokenId));
  
  return {
    id: String(nft.tokenId),
    type: 'video',
    thumbnail: getMediaUrl(nft.imageUrl) || '/placeholder.svg',
    videoUrl: getMediaUrl(nft.videoUrl),
    duration: formatDuration(nft.videoDuration || nft.duration),
    title: nft.title || nft.name || '',
    channel: nft.minterDisplayName || nft.mintername || 'Unknown',
    channelAvatar: getMediaUrl(nft.minterAvatarUrl) || '/placeholder.svg',
    verified: false,
    views,
    uploadedAgo: formatTimeAgo(nft.createdAt),
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
  const views = nft.views != null ? String(nft.views) : getViewCount(String(nft.tokenId));
  const imageUrls = nft.imageUrls?.map(url => getMediaUrl(url) || '') || [];
  const primaryImage = getMediaUrl(nft.imageUrl) || '/placeholder.svg';
  
  return {
    id: String(nft.tokenId),
    type: 'image',
    username: nft.minterDisplayName || nft.mintername || 'Unknown',
    verified: false,
    avatar: getMediaUrl(nft.minterAvatarUrl) || '/placeholder.svg',
    image: primaryImage,
    imageUrls: imageUrls.length > 0 ? imageUrls : [primaryImage],
    title: nft.title || nft.name,
    description: nft.description,
    likes: nft.totalVotes?.for || 0,
    caption: nft.description || '',
    comments: nft.commentCount || nft.comment_count || 0,
    status: nft.status,
    stakedAmount: undefined,
    views,
    timeAgo: formatTimeAgo(nft.createdAt),
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
  const views = nft.views != null ? String(nft.views) : getViewCount(String(nft.tokenId));
  
  return {
    id: String(nft.tokenId),
    type: 'post',
    createdAt: formatTimeAgo(nft.createdAt),
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

export default function SinglePostPage() {
  const { postId, tokenId } = useParams<{ postId?: string; tokenId?: string }>();
  const id = postId || tokenId;

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
  
  // Determine content type and render appropriate card
  const renderContent = () => {
    // Only show loading if we have no data at all (not even cached)
    if (isLoading && !hasCachedData) return <LoadingState />;
    if (error || !post) return <NotFoundState />;
    
    // Handle processing posts
    if (post.status === 'signed' || post.status === 'pending') {
      return <ProcessingState />;
    }

    const contentType = getContentType(post);

    switch (contentType) {
      case 'video':
        return <VideoCard video={toVideoItem(post)} />;
      case 'image':
        return <ImageCard post={toImagePost(post)} />;
      default:
        return <PostCard post={toTextPost(post)} />;
    }
  };

  return (
    <div className="min-h-screen">
      <PageHeader showBack />
      
      <div className="px-3 sm:px-4 pb-8">
        <div className="max-w-2xl mx-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

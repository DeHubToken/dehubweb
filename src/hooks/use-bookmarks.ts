import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSavedPosts, getLikedPosts, getWatchHistory, toggleSavePost, DeHubNFT, getMediaUrl } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { buildAvatarUrl, buildImageUrl, buildVideoUrl, buildFeedImageUrls } from '@/lib/media-url';
import { formatDuration, formatViews, formatTimeAgo } from '@/lib/feed-utils';
import type { VideoItem, ImagePost, TextPost, FeedItem } from '@/types/feed.types';

export type BookmarkType = 'all' | 'liked' | 'history' | 'recent' | 'images' | 'videos' | 'text';

const PAGE_SIZE = 20;

// Helper functions (formatDuration, formatViews, formatTimeAgo) are now imported from @/lib/feed-utils

// ============================================================================
// MAPPERS - Convert DeHubNFT to feed card types
// ============================================================================

function detectPostType(nft: DeHubNFT): 'video' | 'image' | 'text' {
  const postType = nft.postType || nft.media_type;
  
  if (postType === 'video' || nft.videoUrl) {
    return 'video';
  }
  if (postType === 'image' || nft.imageUrl || nft.imageUrls?.length) {
    return 'image';
  }
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
    videoUrl: videoUrl || nft.videoUrl,
    duration: formatDuration(nft.videoDuration || nft.duration),
    title: nft.name || nft.title || 'Untitled',
    channel: nft.minterDisplayName || nft.mintername || 'Unknown Creator',
    channelAvatar,
    verified: false,
    views: formatViews(nft.views || nft.view_count),
    uploadedAgo: formatTimeAgo(nft.createdAt || nft.created_at),
    creatorId: nft.minter,
    creatorUsername: nft.mintername,
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
    username: nft.mintername || nft.minterDisplayName || 'unknown',
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
    creatorUsername: nft.mintername,
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
      name: nft.minterDisplayName || nft.mintername || 'Unknown',
      handle: nft.mintername || nft.minter,
      avatarSeed: avatarUrl,
      verified: false,
    },
    content: nft.description || nft.name || '',
    createdAt: formatTimeAgo(nft.createdAt || nft.created_at),
    views: formatViews(nft.views || nft.view_count).replace(' views', ''),
    stats: {
      comments: nft.commentCount || nft.comment_count || 0,
      reposts: 0,
      likes: nft.totalVotes?.for || nft.like_count || 0,
    },
  };
}

function mapNFTToFeedItem(nft: DeHubNFT): FeedItem {
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

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useBookmarks(type: BookmarkType = 'all', searchQuery: string = '') {
  const { isAuthenticated, walletAddress } = useAuth();
  const queryClient = useQueryClient();

  // Saved posts query with infinite scroll
  const savedQuery = useInfiniteQuery({
    queryKey: ['bookmarks', 'saved', type],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await getSavedPosts(pageParam, PAGE_SIZE);
      const data = response.result || [];
      const hasMore = response.pagination?.hasMore ?? data.length >= PAGE_SIZE;
      return {
        items: data,
        nextPage: hasMore ? pageParam + 1 : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: isAuthenticated && type !== 'liked' && type !== 'history',
    staleTime: 2 * 60 * 1000,
  });

  // Watch history query with infinite scroll
  const historyQuery = useInfiniteQuery({
    queryKey: ['bookmarks', 'history'],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await getWatchHistory(pageParam, PAGE_SIZE, walletAddress || undefined);
      const data = response.result || [];
      return {
        items: data,
        nextPage: data.length >= PAGE_SIZE ? pageParam + 1 : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: isAuthenticated && type === 'history',
    staleTime: 2 * 60 * 1000,
  });

  // Liked posts query with infinite scroll
  const likedQuery = useInfiniteQuery({
    queryKey: ['bookmarks', 'liked'],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await getLikedPosts(pageParam, PAGE_SIZE);
      const items = response.result || [];
      const hasMore = response.pagination?.hasMore ?? items.length >= PAGE_SIZE;
      const totalCount = response.pagination?.totalCount ?? items.length;
      return {
        items,
        nextPage: hasMore ? pageParam + 1 : undefined,
        totalCount,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: isAuthenticated && type === 'liked',
    staleTime: 2 * 60 * 1000,
  });

  // Use the appropriate query based on type
  const activeQuery = type === 'liked' ? likedQuery : type === 'history' ? historyQuery : savedQuery;
  
  // Flatten all pages into a single array
  const allNFTs = activeQuery.data?.pages.flatMap(page => page.items) || [];
  
  // Map to feed items
  let feedItems = allNFTs.map(mapNFTToFeedItem);
  
  // Apply type filtering
  if (type === 'images') {
    feedItems = feedItems.filter(item => item.type === 'image');
  } else if (type === 'videos') {
    feedItems = feedItems.filter(item => item.type === 'video');
  } else if (type === 'text') {
    feedItems = feedItems.filter(item => item.type === 'post');
  } else if (type === 'recent') {
    // Sort by createdAt for recent
    feedItems = [...feedItems].sort((a, b) => {
      const dateA = 'createdAt' in a ? new Date(a.createdAt || 0).getTime() : 0;
      const dateB = 'createdAt' in b ? new Date(b.createdAt || 0).getTime() : 0;
      return dateB - dateA;
    });
  }
  
  // Apply search filter
  if (searchQuery.trim()) {
    const lowerQuery = searchQuery.toLowerCase();
    feedItems = feedItems.filter(item => {
      if (item.type === 'video') {
        return item.title.toLowerCase().includes(lowerQuery) ||
               item.channel.toLowerCase().includes(lowerQuery);
      }
      if (item.type === 'image') {
        return item.title?.toLowerCase().includes(lowerQuery) ||
               item.description?.toLowerCase().includes(lowerQuery) ||
               item.username.toLowerCase().includes(lowerQuery);
      }
      if (item.type === 'post') {
        return item.content.toLowerCase().includes(lowerQuery) ||
               item.author.name.toLowerCase().includes(lowerQuery);
      }
      return false;
    });
  }

  return {
    bookmarks: feedItems,
    totalCount: allNFTs.length,
    isLoading: activeQuery.isLoading,
    isError: activeQuery.isError,
    error: activeQuery.error,
    refetch: activeQuery.refetch,
    fetchNextPage: activeQuery.fetchNextPage,
    hasNextPage: activeQuery.hasNextPage,
    isFetchingNextPage: activeQuery.isFetchingNextPage,
  };
}

/**
 * Hook to manage bookmark state for a single post
 */
export function useBookmarkPost(tokenId: string | number) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  
  // Check if this post is in the bookmarks
  const { data: savedPages } = useInfiniteQuery({
    queryKey: ['bookmarks', 'saved', 'all'],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await getSavedPosts(pageParam, PAGE_SIZE);
      return {
        items: response.result || [],
        nextPage: (response.pagination?.hasMore ?? (response.result?.length || 0) >= PAGE_SIZE) ? pageParam + 1 : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });

  const allSaved = savedPages?.pages.flatMap(page => page.items) || [];
  const isBookmarked = allSaved.some(
    (nft) => String(nft.tokenId) === String(tokenId)
  );

  const toggleMutation = useMutation({
    mutationFn: () => toggleSavePost(tokenId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      // API returns message: "Feed saved" or "Feed unsaved"
      const wasSaved = data.message?.toLowerCase().includes('unsaved') === false;
      if (wasSaved) {
        toast.success('Saved to bookmarks');
      } else {
        toast.success('Removed from bookmarks');
      }
    },
    onError: () => {
      toast.error('Failed to update bookmark');
    },
  });

  const toggleBookmark = () => {
    if (!isAuthenticated) {
      toast.error('Please log in to bookmark');
      return;
    }
    
    toggleMutation.mutate();
  };

  return {
    isBookmarked,
    isLoading: toggleMutation.isPending,
    toggleBookmark,
  };
}

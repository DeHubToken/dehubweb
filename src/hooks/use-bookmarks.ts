import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSavedPosts, getLikedPosts, toggleSavePost, DeHubNFT, getMediaUrl } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type BookmarkType = 'all' | 'liked' | 'recent' | 'images' | 'videos' | 'text';

export interface BookmarkItem {
  id: string;
  tokenId: number;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  type: 'image' | 'video' | 'text';
  creatorUsername?: string;
  creatorDisplayName?: string;
  creatorAvatar?: string;
  createdAt: string;
  views?: number;
  likes?: number;
}

function mapNFTToBookmark(nft: DeHubNFT): BookmarkItem {
  const postType = nft.postType || nft.media_type || 'image';
  
  return {
    id: nft.id || String(nft.tokenId),
    tokenId: nft.tokenId,
    title: nft.name || nft.title || 'Untitled',
    description: nft.description,
    thumbnailUrl: getMediaUrl(nft.imageUrl || nft.thumbnail_url),
    mediaUrl: getMediaUrl(nft.videoUrl || nft.media_url || nft.imageUrl),
    type: postType === 'video' ? 'video' : postType === 'audio' ? 'video' : 'image',
    creatorUsername: nft.mintername || nft.creator?.username || undefined,
    creatorDisplayName: nft.minterDisplayName || nft.creator?.displayName || undefined,
    creatorAvatar: getMediaUrl(nft.minterAvatarUrl || nft.creator?.avatarImageUrl || undefined),
    createdAt: nft.createdAt || nft.created_at || new Date().toISOString(),
    views: nft.views || nft.view_count,
    likes: nft.totalVotes?.for || nft.like_count,
  };
}

function filterByType(bookmarks: BookmarkItem[], type: BookmarkType): BookmarkItem[] {
  switch (type) {
    case 'images':
      return bookmarks.filter(b => b.type === 'image');
    case 'videos':
      return bookmarks.filter(b => b.type === 'video');
    case 'text':
      return bookmarks.filter(b => !b.mediaUrl && !b.thumbnailUrl);
    case 'recent':
      // Sort by date, most recent first (already sorted by API typically)
      return [...bookmarks].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case 'liked':
      // Liked posts are fetched separately, so return as-is
      return bookmarks;
    default:
      return bookmarks;
  }
}

function filterBySearch(bookmarks: BookmarkItem[], query: string): BookmarkItem[] {
  if (!query.trim()) return bookmarks;
  
  const lowerQuery = query.toLowerCase();
  return bookmarks.filter(b => 
    b.title.toLowerCase().includes(lowerQuery) ||
    b.description?.toLowerCase().includes(lowerQuery) ||
    b.creatorUsername?.toLowerCase().includes(lowerQuery) ||
    b.creatorDisplayName?.toLowerCase().includes(lowerQuery)
  );
}

export function useBookmarks(type: BookmarkType = 'all', searchQuery: string = '') {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Saved posts query (for all, recent, images, videos, text)
  const savedQuery = useQuery({
    queryKey: ['bookmarks', 'saved'],
    queryFn: async () => {
      const response = await getSavedPosts(0, 100);
      const data = response.result || [];
      return data.map(mapNFTToBookmark);
    },
    enabled: isAuthenticated && type !== 'liked',
    staleTime: 2 * 60 * 1000,
  });

  // Liked posts query (for liked tab only)
  const likedQuery = useQuery({
    queryKey: ['bookmarks', 'liked'],
    queryFn: async () => {
      const response = await getLikedPosts(1, 100, 'all');
      const items = response.result?.items || [];
      return items.map(mapNFTToBookmark);
    },
    enabled: isAuthenticated && type === 'liked',
    staleTime: 2 * 60 * 1000,
  });

  // Use the appropriate data based on type
  const baseData = type === 'liked' ? likedQuery.data : savedQuery.data;
  const isLoading = type === 'liked' ? likedQuery.isLoading : savedQuery.isLoading;
  const isError = type === 'liked' ? likedQuery.isError : savedQuery.isError;
  const error = type === 'liked' ? likedQuery.error : savedQuery.error;

  // Apply client-side filtering
  const filteredBookmarks = baseData 
    ? filterBySearch(filterByType(baseData, type), searchQuery)
    : [];

  const refetch = () => {
    if (type === 'liked') {
      likedQuery.refetch();
    } else {
      savedQuery.refetch();
    }
  };

  return {
    bookmarks: filteredBookmarks,
    totalCount: baseData?.length || 0,
    isLoading,
    isError,
    error,
    refetch,
  };
}

/**
 * Hook to manage bookmark state for a single post
 */
export function useBookmarkPost(tokenId: string | number) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  
  // Check if this post is in the bookmarks
  const { data: bookmarks } = useQuery({
    queryKey: ['bookmarks', 'saved'],
    queryFn: async () => {
      const response = await getSavedPosts(0, 100);
      return response.result || [];
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });

  const isBookmarked = bookmarks?.some(
    (nft) => String(nft.tokenId) === String(tokenId)
  ) ?? false;

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
      toast.error('Please connect your wallet to bookmark');
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

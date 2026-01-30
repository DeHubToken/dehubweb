import { useQuery } from '@tanstack/react-query';
import { getSavedPosts, DeHubNFT, getMediaUrl } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';

export type BookmarkType = 'all' | 'recent' | 'images' | 'videos' | 'text';

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

  const query = useQuery({
    queryKey: ['bookmarks'],
    queryFn: async () => {
      const response = await getSavedPosts(1, 100);
      
      // Handle the API response - may be wrapped in result
      const data = (response as { result?: DeHubNFT[] }).result || response.data || [];
      return data.map(mapNFTToBookmark);
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Apply client-side filtering
  const filteredBookmarks = query.data 
    ? filterBySearch(filterByType(query.data, type), searchQuery)
    : [];

  return {
    bookmarks: filteredBookmarks,
    totalCount: query.data?.length || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

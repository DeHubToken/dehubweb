import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Bookmark, LayoutGrid, Clock, Image, Video, FileText, RefreshCw, ThumbsUp, Loader2, History, Ticket } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { useBookmarks, BookmarkType } from '@/hooks/use-bookmarks';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { PostCard } from '@/components/app/cards/PostCard';
import type { FeedItem } from '@/types/feed.types';
import bookmark3dIcon from '@/assets/icons/bookmark-3d-icon.png';

const tabs = [
  { label: 'All', value: 'all' as BookmarkType, icon: LayoutGrid },
  { label: 'Liked', value: 'liked' as BookmarkType, icon: ThumbsUp },
  { label: 'History', value: 'history' as BookmarkType, icon: History },
  { label: 'Recent', value: 'recent' as BookmarkType, icon: Clock },
  { label: 'Paid PPV', value: 'ppv' as BookmarkType, icon: Ticket },
  { label: 'Images', value: 'images' as BookmarkType, icon: Image },
  { label: 'Videos', value: 'videos' as BookmarkType, icon: Video },
  { label: 'Text Posts', value: 'text' as BookmarkType, icon: FileText },
];

function FeedItemRenderer({ item }: { item: FeedItem }) {
  switch (item.type) {
    case 'video':
      return <VideoCard video={item} />;
    case 'image':
      return <ImageCard post={item} />;
    case 'post':
      return <PostCard post={item} />;
    default:
      return null;
  }
}

function BookmarksSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
          <div className="pb-3 flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-md" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-1/3 bg-white/[0.06]" />
              <Skeleton className="h-3 w-1/4 bg-white/[0.06]" />
            </div>
          </div>
          <Skeleton className="aspect-video w-full rounded-lg bg-white/[0.06]" />
          <div className="pt-3 space-y-2">
            <Skeleton className="h-4 w-3/4 bg-white/[0.06]" />
            <Skeleton className="h-3 w-1/2 bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BookmarksPage() {
  const [activeTab, setActiveTab] = useState<BookmarkType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { isAuthenticated } = useAuth();
  const { 
    bookmarks, 
    totalCount, 
    isLoading, 
    isError, 
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useBookmarks(activeTab, searchQuery);

  // Infinite scroll observer
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchingRef.current) {
      isFetchingRef.current = true;
      fetchNextPage().finally(() => {
        isFetchingRef.current = false;
      });
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [handleLoadMore]);

  // Block access for unauthenticated users
  if (!isAuthenticated) {
    return (
      <AuthGate description="Log in to view and manage your saved bookmarks." />
    );
  }

  return (
    <div className="min-h-screen p-3 sm:p-4">
      {/* Header */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <img src={bookmark3dIcon} alt="Bookmarks" className="w-[52px] h-[52px] object-contain" />
            <div>
              <h1 className="text-xl font-bold text-white">Your Bookmarks</h1>
              <p className="text-zinc-500 text-sm">
                {totalCount} saved {totalCount === 1 ? 'post' : 'posts'}
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => refetch()}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
            title="Refresh bookmarks"
          >
            <RefreshCw className={`w-4 h-4 text-zinc-400 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search bookmarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.value
                    ? 'bg-white text-black'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <BookmarksSkeleton />
      ) : isError ? (
        <div className="bg-zinc-900 rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-xl flex items-center justify-center mx-auto mb-6">
              <Bookmark className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">Failed to load bookmarks</h2>
            <p className="text-zinc-500 max-w-sm mb-4">
              There was an error loading your bookmarks. Please try again.
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] hover:from-white/30 hover:via-white/15 hover:to-white/10 rounded-lg font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      ) : bookmarks.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 bg-zinc-800 rounded-xl flex items-center justify-center mx-auto mb-6">
              <Bookmark className="w-8 h-8 text-zinc-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">
              {searchQuery ? 'No matching bookmarks' : 'No bookmarks yet'}
            </h2>
            <p className="text-zinc-500 max-w-sm">
              {searchQuery 
                ? `No bookmarks match "${searchQuery}". Try a different search.`
                : 'Start saving posts by tapping the bookmark icon on any post you want to save.'
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {bookmarks.map((item) => (
            <FeedItemRenderer key={item.id} item={item} />
          ))}
          
          {/* Infinite scroll trigger */}
          <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
            {isFetchingNextPage && (
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            )}
          </div>
          
          {/* End of list indicator */}
          {!hasNextPage && bookmarks.length > 0 && (
            <div className="py-8 text-center text-zinc-500 text-sm">
              You've reached the end of your bookmarks
            </div>
          )}
        </div>
      )}
    </div>
  );
}

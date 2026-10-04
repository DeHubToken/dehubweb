import { BrandIcon, ThemedIcon } from '@/components/app/war/WarHudIcon';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, LayoutGrid, Clock, Image, Video, FileText, RefreshCw, ThumbsUp, Loader2, History, Ticket, Trash2, FolderOpen } from 'lucide-react';
import { BookmarksEmptyContent } from '@/components/app/bookmarks/BookmarksEmptyContent';
import { BookmarkFoldersPanel } from '@/components/app/bookmarks/BookmarkFoldersPanel';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { useBookmarks, useClearWatchHistory, BookmarkType } from '@/hooks/use-bookmarks';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { PostCard } from '@/components/app/cards/PostCard';
import type { FeedItem } from '@/types/feed.types';
import bookmark3dIcon from '@/assets/icons/bookmark-3d-icon.webp';
import { useTranslation } from 'react-i18next';
import { SEOHead } from '@/components/SEOHead';
import { IslandAction, PageBody, PageIsland, PageTabs } from '@/components/app/page-kit/PageKit';

const tabKeys = [
  { labelKey: 'bookmarks.all', value: 'all' as BookmarkType, icon: LayoutGrid },
  { labelKey: 'bookmarks.liked', value: 'liked' as BookmarkType, icon: ThumbsUp },
  { labelKey: 'bookmarks.history', value: 'history' as BookmarkType, icon: History },
  { labelKey: 'bookmarks.folders', value: 'folders' as BookmarkType, icon: FolderOpen },
  { labelKey: 'bookmarks.recent', value: 'recent' as BookmarkType, icon: Clock },
  { labelKey: 'bookmarks.paidPpv', value: 'ppv' as BookmarkType, icon: Ticket },
  { labelKey: 'bookmarks.images', value: 'images' as BookmarkType, icon: Image },
  { labelKey: 'bookmarks.videos', value: 'videos' as BookmarkType, icon: Video },
  { labelKey: 'bookmarks.textPosts', value: 'text' as BookmarkType, icon: FileText },
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
        <div key={i} className="rounded-xl border border-white/[0.12] bg-white/[0.03] p-3">
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
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<BookmarkType>('all');
  const clearHistory = useClearWatchHistory();
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
      <AuthGate description={t('bookmarks.loginDescription')} />
    );
  }

  return (
    <div className="min-h-screen">
      <SEOHead title="Bookmarks — Your Saved Content" description="Access your saved posts, liked content, watch history and pay-per-view purchases all in one place on DeHub. Never lose track of content you love." url="https://dehub.io/app/bookmarks" />
      <h1 className="sr-only">DeHub Bookmarks — Decentralised Social Media, Censorship Resistant & Freedom of Speech</h1>
      <PageIsland
        icon={<BrandIcon src={bookmark3dIcon} alt={t('nav.bookmarks')} className="h-8 w-8 object-contain" />}
        title={t('bookmarks.title')}
        subtitle={totalCount === 1 ? t('bookmarks.savedCount', { count: totalCount }) : t('bookmarks.savedCountPlural', { count: totalCount })}
        actions={
          <>
            {activeTab === 'history' && (
              <IslandAction
                label="Clear history"
                onClick={() => {
                  if (confirm('Clear all watch history?')) clearHistory.mutate();
                }}
                disabled={clearHistory.isPending}
              >
                <Trash2 className={`h-[18px] w-[18px] ${clearHistory.isPending ? 'opacity-50' : ''}`} />
              </IslandAction>
            )}
            <IslandAction label={t('bookmarks.refresh')} onClick={() => refetch()}>
              <RefreshCw className={`h-[18px] w-[18px] ${isLoading ? 'animate-spin' : ''}`} />
            </IslandAction>
          </>
        }
        tabs={
          <PageTabs
            value={activeTab}
            onChange={setActiveTab}
            tabs={tabKeys.map((tab) => {
              const Icon = tab.icon;
              return { id: tab.value, label: t(tab.labelKey), icon: <Icon className="h-4 w-4" /> };
            })}
          />
        }
      >
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder={t('bookmarks.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>
      </PageIsland>

      {/* Content Area */}
      <PageBody>
      {activeTab === 'folders' ? (
        <div data-page-bento data-kit-section className="bg-zinc-900 p-3 sm:p-4">
          <BookmarkFoldersPanel />
        </div>
      ) : isLoading ? (
        <BookmarksSkeleton />
      ) : isError ? (
        <div data-page-bento data-kit-section className="bg-zinc-900 p-8 sm:p-12 flex flex-col items-center justify-center min-h-[400px]">
          <div className="text-center">
            <ThemedIcon icon="bookmarks" alt="" className="w-16 h-16 object-contain mx-auto mb-6 opacity-80" />
            <h2 className="text-xl font-bold text-white mb-3">{t('bookmarks.failedToLoad')}</h2>
            <p className="text-zinc-500 max-w-sm mb-4">
              {t('bookmarks.errorMessage')}
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 text-white shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)] hover:from-white/30 hover:via-white/15 hover:to-white/10 rounded-lg font-medium transition-colors"
            >
              {t('bookmarks.tryAgain')}
            </button>
          </div>
        </div>
      ) : bookmarks.length === 0 ? (
        <div data-page-bento data-kit-section className="bg-zinc-900 p-8 sm:p-12 flex flex-col items-center justify-center min-h-[400px]">
          <BookmarksEmptyContent activeTab={activeTab} searchQuery={searchQuery} />
        </div>
      ) : (
        <div data-kit-flat-skip className="space-y-4">
          {bookmarks.map((item, index) => (
            // Below-fold cards skip layout/paint until scrolled near
            <div
              key={item.id}
              style={index < 3 ? undefined : { contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
            >
              <FeedItemRenderer item={item} />
            </div>
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
              {t('bookmarks.reachedEnd')}
            </div>
          )}
        </div>
      )}
      </PageBody>
    </div>
  );
}

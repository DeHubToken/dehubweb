import { useState } from 'react';
import { Search, Bookmark, LayoutGrid, Clock, Image, Video, FileText, Play, Eye, Heart, RefreshCw, ThumbsUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
import { useBookmarks, BookmarkType } from '@/hooks/use-bookmarks';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

const tabs = [
  { label: 'All', value: 'all' as BookmarkType, icon: LayoutGrid },
  { label: 'Liked', value: 'liked' as BookmarkType, icon: ThumbsUp },
  { label: 'Recent', value: 'recent' as BookmarkType, icon: Clock },
  { label: 'Images', value: 'images' as BookmarkType, icon: Image },
  { label: 'Videos', value: 'videos' as BookmarkType, icon: Video },
  { label: 'Text Posts', value: 'text' as BookmarkType, icon: FileText },
];

function BookmarkCard({ bookmark }: { bookmark: ReturnType<typeof useBookmarks>['bookmarks'][0] }) {
  return (
    <Link 
      to={`/app/post/${bookmark.tokenId}`}
      className="group bg-zinc-800/50 rounded-xl overflow-hidden hover:bg-zinc-800 transition-colors"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-zinc-900">
        {bookmark.thumbnailUrl ? (
          <img 
            src={bookmark.thumbnailUrl} 
            alt={bookmark.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileText className="w-8 h-8 text-zinc-600" />
          </div>
        )}
        
        {/* Video overlay */}
        {bookmark.type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span className={`px-2 py-0.5 text-[10px] font-medium uppercase rounded ${
            bookmark.type === 'video' 
              ? 'bg-red-500/80 text-white' 
              : 'bg-blue-500/80 text-white'
          }`}>
            {bookmark.type}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-white line-clamp-2 mb-1">
          {bookmark.title}
        </h3>
        
        {bookmark.creatorUsername && (
          <p className="text-xs text-zinc-500 mb-2">
            @{bookmark.creatorUsername}
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {bookmark.views !== undefined && (
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {bookmark.views.toLocaleString()}
            </span>
          )}
          {bookmark.likes !== undefined && (
            <span className="flex items-center gap-1">
              <Heart className="w-3 h-3" />
              {bookmark.likes.toLocaleString()}
            </span>
          )}
          <span className="ml-auto">
            {formatDistanceToNow(new Date(bookmark.createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    </Link>
  );
}

function BookmarksSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-zinc-800/50 rounded-xl overflow-hidden">
          <Skeleton className="aspect-video w-full" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
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
  const { bookmarks, totalCount, isLoading, isError, refetch } = useBookmarks(activeTab, searchQuery);

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
            <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center">
              <Bookmark className="w-6 h-6 text-zinc-400" />
            </div>
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
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Bookmark className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">Failed to load bookmarks</h2>
            <p className="text-zinc-500 max-w-sm mb-4">
              There was an error loading your bookmarks. Please try again.
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-white text-black rounded-lg font-medium hover:bg-zinc-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      ) : bookmarks.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {bookmarks.map((bookmark) => (
            <BookmarkCard key={bookmark.id} bookmark={bookmark} />
          ))}
        </div>
      )}
    </div>
  );
}

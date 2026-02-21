import { useState, useMemo, useCallback, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { UserPlus, Loader2, ChevronRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getSuggestedAccounts, followUser, type SuggestedAccount } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { toast } from 'sonner';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';

const BATCH_SIZE = 10;
const MAX_PAGES = 10;

export function MobileWhoToFollowCarousel() {
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress } = useAuth();
  const { handleApiError } = useReauthHandler();
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [loadingUsers, setLoadingUsers] = useState<Set<string>>(new Set());

  const {
    data,
    isLoading,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['suggested-accounts', walletAddress],
    queryFn: ({ pageParam = 1 }) => getSuggestedAccounts(BATCH_SIZE, pageParam),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      if (allPages.length >= MAX_PAGES) return undefined;
      const allPreviousAddresses = new Set(
        allPages.slice(0, -1).flatMap(p => p.items.map(i => i.address))
      );
      const newItems = lastPage.items.filter(i => !allPreviousAddresses.has(i.address));
      if (newItems.length === 0) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const allSuggestions = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.items);
  }, [data]);

  const filteredSuggestions = useMemo(() => {
    const seen = new Set<string>();
    return allSuggestions.filter(user => {
      if (followedUsers.has(user.address) || seen.has(user.address)) return false;
      seen.add(user.address);
      return true;
    });
  }, [allSuggestions, followedUsers]);

  // Load more when user scrolls near the end of the carousel
  const carouselRef = useRef<HTMLDivElement>(null);
  const handleScroll = useCallback(() => {
    const el = carouselRef.current;
    if (!el || isFetchingNextPage || !hasNextPage) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    if (scrollWidth - scrollLeft - clientWidth < 300) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const getAvatarUrl = (user: SuggestedAccount) => {
    const avatarPath = user.avatarImageUrl || user.avatarUrl;
    if (avatarPath && user.address) {
      return buildAvatarUrl(user.address, avatarPath);
    }
    return undefined;
  };

  const getDisplayName = (user: SuggestedAccount) => {
    return user.displayName || user.username || `${user.address.slice(0, 6)}...`;
  };

  const handleUserClick = (user: SuggestedAccount) => {
    const target = user.username || user.address;
    if (target) {
      navigate(`/${target}`);
    }
  };

  const handleFollow = async (e: React.MouseEvent, user: SuggestedAccount) => {
    e.stopPropagation();

    if (!isAuthenticated) {
      toast.error('Please log in to follow users');
      return;
    }

    if (loadingUsers.has(user.address) || followedUsers.has(user.address)) {
      return;
    }

    setLoadingUsers(prev => new Set(prev).add(user.address));

    try {
      await followUser(user.address);
      setFollowedUsers(prev => new Set(prev).add(user.address));
      toast.success(`Following ${getDisplayName(user)}!`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('already') || errorMessage.toLowerCase().includes('following')) {
        toast.info(`You're already following ${getDisplayName(user)}`);
        setFollowedUsers(prev => new Set(prev).add(user.address));
      } else {
        handleApiError(error, 'Failed to follow user');
      }
    } finally {
      setLoadingUsers(prev => {
        const next = new Set(prev);
        next.delete(user.address);
        return next;
      });
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="lg:hidden py-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (filteredSuggestions.length === 0) {
    return (
      <div className="lg:hidden py-4 border-y border-zinc-800/50">
        <div className="flex flex-col items-center justify-center gap-3 py-6">
          <UserPlus className="w-5 h-5 text-zinc-500" />
          <span className="text-sm text-zinc-500">No follow suggestions yet</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 px-4 text-xs font-semibold rounded-xl border-zinc-700 text-white hover:bg-zinc-800 bg-transparent"
          >
            {isFetching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            )}
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:hidden py-4 border-y border-zinc-800/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 mb-3">
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-semibold text-white">Follow Suggestions</span>
        </div>
        <button 
          onClick={() => navigate('/app/explore')}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          See All
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Horizontal Carousel */}
      <SwipeableCarousel
        ref={carouselRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-2 snap-x snap-mandatory"
        onScroll={handleScroll}
      >
        {filteredSuggestions.map((user) => (
          <div
            key={user.address}
            onClick={() => handleUserClick(user)}
            className="flex-shrink-0 w-[104px] bg-zinc-900 rounded-xl p-1 cursor-pointer hover:bg-zinc-800/80 transition-colors snap-start"
          >
            <div className="flex flex-col items-center text-center">
              <Avatar className="w-24 h-24 mb-2">
                {getAvatarUrl(user) && <AvatarImage src={getAvatarUrl(user)} />}
                <AvatarFallback className="bg-zinc-700 text-white font-medium text-xl">
                  {getDisplayName(user).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex items-center justify-center w-full mb-2">
                <span className="font-semibold text-white text-xs truncate">
                  {getDisplayName(user)}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => handleFollow(e, user)}
                disabled={loadingUsers.has(user.address)}
                className="w-24 h-7 text-[10px] font-semibold rounded-lg border-zinc-700 text-white hover:bg-zinc-800 bg-transparent flex items-center justify-center"
              >
                {loadingUsers.has(user.address) ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  'Follow'
                )}
              </Button>
            </div>
          </div>
        ))}
        {isFetchingNextPage && (
          <div className="flex-shrink-0 w-[104px] flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
          </div>
        )}
      </SwipeableCarousel>
    </div>
  );
}

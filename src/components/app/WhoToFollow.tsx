import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { UserPlus, Loader2, RefreshCw, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getSuggestedAccounts, followUser, type SuggestedAccount } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { useFollowedSuggestions } from '@/hooks/use-followed-suggestions';
import { toast } from 'sonner';

const BATCH_SIZE = 10;
const MAX_PAGES = 10;

export function WhoToFollow() {
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress, openLoginModal } = useAuth();
  const { handleApiError } = useReauthHandler();
  const { followedUsers, markFollowed } = useFollowedSuggestions();
  const [loadingUsers, setLoadingUsers] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['suggested-accounts', walletAddress],
    queryFn: ({ pageParam = 1 }) => getSuggestedAccounts(BATCH_SIZE, pageParam),
    getNextPageParam: (lastPage, allPages) => {
      // Stop if API says no more
      if (!lastPage.hasMore) return undefined;
      // Stop if we've hit max pages
      if (allPages.length >= MAX_PAGES) return undefined;
      // Stop if the last page returned all duplicates (API is recycling)
      const allPreviousAddresses = new Set(
        allPages.slice(0, -1).flatMap(p => p.items.map(i => i.address))
      );
      const newItems = lastPage.items.filter(i => !allPreviousAddresses.has(i.address));
      if (newItems.length === 0) return undefined;
      return allPages.length + 1;
    },
    initialPageParam: 1,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });

  const allSuggestions = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.items);
  }, [data]);

  const filteredSuggestions = useMemo(() => {
    // Deduplicate by address, remove users followed during this session
    const seen = new Set<string>();
    return allSuggestions.filter(user => {
      if (followedUsers.has(user.address) || seen.has(user.address)) return false;
      seen.add(user.address);
      return true;
    });
  }, [allSuggestions, followedUsers]);

  const isAlreadyFollowed = useCallback((user: SuggestedAccount) => {
    return user.isFollowing === true;
  }, []);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isFetchingNextPage || !hasNextPage) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Auto-fetch next page when filtered suggestions run low (only after user follows someone)
  const prevFilteredCount = useRef(filteredSuggestions.length);
  useEffect(() => {
    if (
      filteredSuggestions.length < 3 &&
      filteredSuggestions.length < prevFilteredCount.current &&
      !isLoading && !error
    ) {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }
    prevFilteredCount.current = filteredSuggestions.length;
  }, [filteredSuggestions.length, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage, error]);

  if (error) {
    console.warn('[WhoToFollow] Query error:', error);
  }

  const getAvatarUrl = (user: SuggestedAccount) => {
    const avatarPath = user.avatarImageUrl || user.avatarUrl;
    if (avatarPath && user.address) {
      return buildAvatarUrl(user.address, avatarPath);
    }
    return undefined;
  };

  const getDisplayName = (user: SuggestedAccount) => {
    return user.displayName || user.username || `${user.address.slice(0, 6)}...${user.address.slice(-4)}`;
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
      openLoginModal();
      return;
    }

    if (loadingUsers.has(user.address) || followedUsers.has(user.address)) {
      return;
    }

    setLoadingUsers(prev => new Set(prev).add(user.address));

    try {
      await followUser(user.address);
      markFollowed(user.address);
      toast.success(`Following ${getDisplayName(user)}!`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes('already') || errorMessage.toLowerCase().includes('following')) {
        toast.info(`You're already following ${getDisplayName(user)}`);
        markFollowed(user.address);
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


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (filteredSuggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
          <UserPlus className="w-6 h-6 text-zinc-500" />
        </div>
        <p className="text-zinc-400 text-sm mb-3">{error ? 'Failed to load suggestions' : 'No suggestions yet'}</p>
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
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden space-y-1 pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
      >
        {filteredSuggestions.map((user) => (
          <div
            key={user.address}
            onClick={() => handleUserClick(user)}
            className="flex items-center gap-3 py-2 px-4 hover:bg-zinc-800/50 transition-colors cursor-pointer"
          >
            <Avatar className="w-10 h-10">
              {getAvatarUrl(user) && <AvatarImage src={getAvatarUrl(user)} />}
              <AvatarFallback className="bg-zinc-700 text-white font-medium">
                {getDisplayName(user).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-white text-sm truncate block">{getDisplayName(user)}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => handleFollow(e, user)}
              disabled={loadingUsers.has(user.address) || isAlreadyFollowed(user)}
              className={`h-8 w-[82px] text-xs font-semibold rounded-xl flex items-center justify-center ${
                isAlreadyFollowed(user)
                  ? 'border-zinc-600 text-zinc-400 bg-transparent cursor-default'
                  : 'border-zinc-700 text-white hover:bg-zinc-800 bg-transparent'
              }`}
            >
              {loadingUsers.has(user.address) ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : isAlreadyFollowed(user) ? (
                'Following'
              ) : (
                'Follow'
              )}
            </Button>
          </div>
        ))}
        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
          </div>
        )}
      </div>

      <div className="relative">
        <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

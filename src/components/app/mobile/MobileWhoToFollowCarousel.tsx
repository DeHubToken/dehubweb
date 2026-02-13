import { useState, useMemo, useRef, useCallback } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { UserPlus, Loader2, ChevronRight, RefreshCw, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { searchNFTs, followUser, getAccountInfo } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { toast } from 'sonner';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';

interface UniqueUser {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

const PAGE_SIZE = 100;
const PAGES_PER_BATCH = 2;
const VISIBLE_INCREMENT = 15;

async function fetchSuggestionsBatch(batchIndex: number): Promise<{ users: UniqueUser[]; hasMore: boolean }> {
  const startPage = batchIndex * PAGES_PER_BATCH;
  const seenAddresses = new Set<string>();
  const uniqueUsers: UniqueUser[] = [];

  const pagePromises = [];
  for (let page = startPage; page < startPage + PAGES_PER_BATCH; page++) {
    pagePromises.push(searchNFTs({ sortMode: 'new', unit: PAGE_SIZE, page }));
  }

  const results = await Promise.all(pagePromises);

  let totalItems = 0;
  for (const response of results) {
    const items = response.data || [];
    totalItems += items.length;
    for (const nft of items) {
      const address = nft.minter;
      if (!address || seenAddresses.has(address)) continue;
      seenAddresses.add(address);
      uniqueUsers.push({
        address,
        username: nft.mintername,
        displayName: nft.minterDisplayName,
        avatarUrl: nft.minterAvatarUrl,
      });
    }
  }

  const hasMore = totalItems >= PAGES_PER_BATCH * PAGE_SIZE * 0.5;
  return { users: uniqueUsers, hasMore };
}

export function MobileWhoToFollowCarousel() {
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress } = useAuth();
  const { handleApiError } = useReauthHandler();
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [loadingUsers, setLoadingUsers] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(VISIBLE_INCREMENT);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch current user's following list
  const { data: currentUserData, isLoading: isLoadingFollowings } = useQuery({
    queryKey: ['current-user-followings', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      return getAccountInfo(walletAddress);
    },
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });

  // Infinite query for suggestions
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isFetching } = useInfiniteQuery({
    queryKey: ['mobile-suggestions'],
    queryFn: ({ pageParam = 0 }) => fetchSuggestionsBatch(pageParam),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length;
    },
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });

  // Get following list as a Set
  const followingSet = useMemo(() => {
    const followings = currentUserData?.followings;
    if (!followings || !Array.isArray(followings)) return new Set<string>();
    return new Set(followings.map(addr => addr.toLowerCase()));
  }, [currentUserData?.followings]);

  // Accumulate all unique users across pages
  const allUsers = useMemo(() => {
    if (!data?.pages) return [];
    const seenAddresses = new Set<string>();
    const users: UniqueUser[] = [];
    for (const page of data.pages) {
      for (const user of page.users) {
        if (!seenAddresses.has(user.address)) {
          seenAddresses.add(user.address);
          users.push(user);
        }
      }
    }
    return users;
  }, [data?.pages]);

  // Filter suggestions (no hard cap — visibleCount controls display)
  const suggestions = useMemo(() => {
    return allUsers.filter(user => {
      const addressLower = user.address.toLowerCase();
      if (walletAddress && addressLower === walletAddress.toLowerCase()) return false;
      if (followingSet.has(addressLower)) return false;
      if (followedUsers.has(user.address)) return false;
      if (!user.avatarUrl) return false;
      return true;
    });
  }, [allUsers, walletAddress, followingSet, followedUsers]);

  const visibleSuggestions = suggestions.slice(0, visibleCount);
  const hasMoreToShow = visibleCount < suggestions.length || hasNextPage;

  const handleLoadMore = useCallback(() => {
    if (visibleCount < suggestions.length) {
      // Reveal more from the already-fetched pool
      setVisibleCount(prev => prev + VISIBLE_INCREMENT);
    } else if (hasNextPage && !isFetchingNextPage) {
      // Fetch more from API, then reveal
      fetchNextPage().then(() => {
        setVisibleCount(prev => prev + VISIBLE_INCREMENT);
      });
    }
  }, [visibleCount, suggestions.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Auto-trigger load more when user scrolls near end
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 150;
    if (nearEnd && hasMoreToShow && !isFetchingNextPage) {
      handleLoadMore();
    }
  }, [hasMoreToShow, isFetchingNextPage, handleLoadMore]);

  const getAvatarUrl = (user: UniqueUser) => {
    if (user.avatarUrl && user.address) {
      return buildAvatarUrl(user.address, user.avatarUrl);
    }
    return undefined;
  };

  const getDisplayName = (user: UniqueUser) => {
    return user.displayName || user.username || `${user.address.slice(0, 6)}...`;
  };

  const handleUserClick = (user: UniqueUser) => {
    if (user.username) {
      navigate(`/${user.username}`);
    }
  };

  const handleFollow = async (e: React.MouseEvent, user: UniqueUser) => {
    e.stopPropagation();

    if (!isAuthenticated) {
      toast.error('Please connect your wallet to follow users');
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

  // Wait for both suggestions and followings to load before showing
  if (isLoading || (isAuthenticated && isLoadingFollowings)) {
    return (
      <div className="lg:hidden py-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
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

      {/* Horizontal Carousel with infinite scroll */}
      <SwipeableCarousel
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-2 snap-x snap-mandatory"
      >
        {visibleSuggestions.map((user) => (
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

        {/* Load More card */}
        {hasMoreToShow && (
          <div
            onClick={handleLoadMore}
            className="flex-shrink-0 w-[104px] bg-zinc-900 rounded-xl p-1 cursor-pointer hover:bg-zinc-800/80 transition-colors snap-start flex items-center justify-center"
          >
            <div className="flex flex-col items-center justify-center gap-2 py-6">
              {isFetchingNextPage ? (
                <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
              ) : (
                <>
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-zinc-400" />
                  </div>
                  <span className="text-[10px] text-zinc-400 font-medium">More</span>
                </>
              )}
            </div>
          </div>
        )}
      </SwipeableCarousel>
    </div>
  );
}

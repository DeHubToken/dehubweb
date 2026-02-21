import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { UserPlus, Loader2, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { searchNFTs, followUser, getAccountInfo } from '@/lib/api/dehub';
import { unfollowUser } from '@/lib/api/dehub/social';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface UniqueUser {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

const PAGE_SIZE = 100;
const PAGES_PER_BATCH = 2;
const VISIBLE_INCREMENT = 15;

// Fetch a batch of pages and extract unique users
async function fetchUserBatch(batchIndex: number): Promise<{ users: UniqueUser[]; hasMore: boolean }> {
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

export function WhoToFollow() {
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress } = useAuth();
  const { handleApiError } = useReauthHandler();
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [loadingUsers, setLoadingUsers] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(VISIBLE_INCREMENT);
  const loaderRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  // Fetch current user's following list
  const { data: currentUserData, isLoading: isLoadingFollowings } = useQuery({
    queryKey: ['current-user-followings', walletAddress],
    queryFn: async () => {
      if (!walletAddress) return null;
      return getAccountInfo(walletAddress);
    },
    enabled: !!walletAddress && isAuthenticated,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Get following list as a Set for O(1) lookups
  const followingSet = useMemo(() => {
    const followings = currentUserData?.followingsList || currentUserData?.followings;
    if (!followings || !Array.isArray(followings)) {
      return new Set<string>();
    }
    return new Set(followings.map((addr: string) => addr.toLowerCase()));
  }, [currentUserData?.followingsList, currentUserData?.followings]);

  // Infinite query for user suggestions
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingInitial,
  } = useInfiniteQuery({
    queryKey: ['suggestions-infinite'],
    queryFn: ({ pageParam = 0 }) => fetchUserBatch(pageParam),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.length;
    },
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

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

  // Filter out users that are already followed, the current user, and newly followed users
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

  // Auto-fetch more batches if suggestions are sparse after filtering
  useEffect(() => {
    const pagesLoaded = data?.pages?.length ?? 0;
    const MAX_AUTO_BATCHES = 5;
    const MIN_SUGGESTIONS = 5;

    if (
      suggestions.length < MIN_SUGGESTIONS &&
      hasNextPage &&
      !isFetchingNextPage &&
      pagesLoaded < MAX_AUTO_BATCHES &&
      !isLoadingInitial
    ) {
      fetchNextPage();
    }
  }, [suggestions.length, hasNextPage, isFetchingNextPage, data?.pages?.length, isLoadingInitial, fetchNextPage]);

  const visibleSuggestions = suggestions.slice(0, visibleCount);
  const hasMoreToShow = visibleCount < suggestions.length || hasNextPage;

  // Intersection observer: reveal more from pool first, then fetch
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [entry] = entries;
    if (!entry.isIntersecting || isFetchingRef.current) return;

    if (visibleCount < suggestions.length) {
      // Reveal more from already-fetched pool (instant)
      setVisibleCount(prev => prev + VISIBLE_INCREMENT);
    } else if (hasNextPage) {
      // Fetch more from API
      isFetchingRef.current = true;
      fetchNextPage().then(() => {
        setVisibleCount(prev => prev + VISIBLE_INCREMENT);
      }).finally(() => {
        isFetchingRef.current = false;
      });
    }
  }, [visibleCount, suggestions.length, hasNextPage, fetchNextPage]);

  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader) return;

    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '100px',
      threshold: 0,
    });

    observer.observe(loader);
    return () => observer.disconnect();
  }, [handleObserver]);

  const getAvatarUrl = (user: UniqueUser) => {
    if (user.avatarUrl && user.address) {
      return buildAvatarUrl(user.address, user.avatarUrl);
    }
    return undefined;
  };

  const getDisplayName = (user: UniqueUser) => {
    return user.displayName || user.username || `${user.address.slice(0, 6)}...${user.address.slice(-4)}`;
  };

  const handleUserClick = (user: UniqueUser) => {
    const target = user.username || user.address;
    if (target) {
      navigate(`/${target}`);
    }
  };

  // Unfollow confirmation state
  const [unfollowTarget, setUnfollowTarget] = useState<UniqueUser | null>(null);

  const handleFollow = async (e: React.MouseEvent, user: UniqueUser) => {
    e.stopPropagation();

    if (!isAuthenticated) {
      toast.error('Please log in to follow users');
      return;
    }

    // If already followed, show unfollow confirmation
    if (followedUsers.has(user.address)) {
      setUnfollowTarget(user);
      return;
    }

    if (loadingUsers.has(user.address)) {
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

  const handleUnfollowConfirm = async () => {
    if (!unfollowTarget) return;
    const user = unfollowTarget;
    setUnfollowTarget(null);
    setLoadingUsers(prev => new Set(prev).add(user.address));

    try {
      await unfollowUser(user.address);
      setFollowedUsers(prev => {
        const next = new Set(prev);
        next.delete(user.address);
        return next;
      });
      toast.success(`Unfollowed ${getDisplayName(user)}`);
    } catch (error) {
      handleApiError(error, 'Failed to unfollow user');
    } finally {
      setLoadingUsers(prev => {
        const next = new Set(prev);
        next.delete(user.address);
        return next;
      });
    }
  };

  // Show loading while fetching initial data OR while fetching followings for authenticated user
  if (isLoadingInitial || (isAuthenticated && isLoadingFollowings)) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  const pagesLoaded = data?.pages?.length ?? 0;
  const stillAutoFetching = hasNextPage && pagesLoaded < 5;

  if (suggestions.length === 0 && (isFetchingNextPage || stillAutoFetching)) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
          <UserPlus className="w-6 h-6 text-zinc-500" />
        </div>
        <p className="text-zinc-400 text-sm">No suggestions yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-1 pr-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {visibleSuggestions.map((user) => (
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
              disabled={loadingUsers.has(user.address)}
              className={`h-8 w-[82px] text-xs font-semibold rounded-xl flex items-center justify-center gap-1 ${
                followedUsers.has(user.address)
                  ? 'border-zinc-600 text-zinc-300 hover:border-red-500/50 hover:text-red-400 bg-transparent'
                  : 'border-zinc-700 text-white hover:bg-zinc-800 bg-transparent'
              }`}
            >
              {loadingUsers.has(user.address) ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : followedUsers.has(user.address) ? (
                <>
                  <Check className="w-3 h-3" />
                  Following
                </>
              ) : (
                'Follow'
              )}
            </Button>
          </div>
        ))}
        
        {/* Infinite scroll loader sentinel */}
        {hasMoreToShow && (
          <div ref={loaderRef} className="flex justify-center py-4">
            {isFetchingNextPage && (
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <div className="absolute -top-8 left-0 right-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none" />
      </div>

      {/* Unfollow confirmation dialog */}
      <AlertDialog open={!!unfollowTarget} onOpenChange={(open) => !open && setUnfollowTarget(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Unfollow {unfollowTarget ? getDisplayName(unfollowTarget) : ''}?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Their posts will no longer show up in your Following feed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnfollowConfirm} className="bg-red-500 text-white hover:bg-red-600">Unfollow</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

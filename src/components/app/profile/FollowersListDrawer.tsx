import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users, UserPlus, UserMinus, Search, ArrowUpDown, X } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { getFollowList, followUser, unfollowUser, isFollowing as checkIsFollowing, type FollowListItem } from '@/lib/api/dehub';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MAX_PAGES = 3;
const PAGE_SIZE = 30;

type SortOption = 'newest' | 'earliest';
const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest',
  earliest: 'Earliest',
};

/** Truncate a hex address to 0x1234…abcd */
function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface UserListItem {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  isFollowing?: boolean;
  followsYou?: boolean;
}

interface FollowersListDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileAddress: string;
  title: 'Followers' | 'Following';
}

/**
 * Map API follow list item to local UserListItem format.
 * The API now returns full user objects — no enrichment needed.
 */
function mapFollowListItem(item: FollowListItem): UserListItem {
  return {
    address: item.address,
    username: item.username,
    displayName: item.displayName || item.username,
    avatarUrl: buildAvatarUrl(item.address, item.avatarImageUrl || item.avatarUrl),
    isVerified: item.isVerified,
    isFollowing: item.isFollowing,
    followsYou: item.followsYou,
  };
}

export function FollowersListDrawer({
  open,
  onOpenChange,
  profileAddress,
  title,
}: FollowersListDrawerProps) {
  const navigate = useNavigate();
  const { walletAddress: currentUserAddress, isAuthenticated } = useAuth();
  const { handleApiError } = useReauthHandler();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFollows, setLoadingFollows] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch initial page when drawer opens or search/sort changes
  useEffect(() => {
    if (!open || !profileAddress) return;

    const fetchInitialPage = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const type = title === 'Followers' ? 'followers' : 'following';

        // Fetch the list
        const { items, pagination } = await getFollowList(profileAddress, type, {
          page: 1,
          limit: PAGE_SIZE,
          sortBy: 'createdAt',
          sortOrder: sortOption === 'newest' ? 'desc' : 'asc',
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        });

        const processed = items.map(mapFollowListItem);

        // Check isFollowing status for each user in parallel
        const isOwnFollowingList =
          title === 'Following' &&
          currentUserAddress &&
          profileAddress.toLowerCase() === currentUserAddress.toLowerCase();

        let finalUsers: UserListItem[];
        if (isOwnFollowingList) {
          finalUsers = processed.map(u => ({ ...u, isFollowing: true }));
        } else if (isAuthenticated && currentUserAddress && processed.length > 0) {
          const followStatuses = await Promise.all(
            processed.map(u =>
              u.isFollowing !== undefined
                ? Promise.resolve(u.isFollowing)
                : checkIsFollowing(u.address).catch(() => false)
            )
          );
          finalUsers = processed.map((u, i) => ({ ...u, isFollowing: followStatuses[i] }));
        } else {
          finalUsers = processed;
        }

        setUsers(finalUsers);
        setCurrentPage(1);
        setHasMore(pagination?.hasMore ?? false);
        setTotalCount(pagination?.totalCount ?? null);
      } catch (err: any) {
        console.error('Error fetching follow list:', err);
        const msg = err?.message || '';
        if (msg.toLowerCase().includes('hidden')) {
          setError('This user has hidden their followers/following list.');
        } else if (msg.toLowerCase().includes('authentication required')) {
          setError('This list is private.');
          toast.error('This user\'s followers list is private');
        } else {
          setError('Failed to load list. Please try again.');
          toast.error('Failed to load follow list');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialPage();
  }, [open, profileAddress, title, currentUserAddress, isAuthenticated, sortOption, debouncedSearch]);

  // Load more pages
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || currentPage >= MAX_PAGES) return;

    setIsLoadingMore(true);
    try {
      const type = title === 'Followers' ? 'followers' : 'following';
      const nextPage = currentPage + 1;
      const { items, pagination } = await getFollowList(profileAddress, type, {
        page: nextPage,
        limit: PAGE_SIZE,
        sortBy: 'createdAt',
        sortOrder: sortOption === 'newest' ? 'desc' : 'asc',
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });

      const processed = items.map(mapFollowListItem);

      const isOwnFollowingList =
        title === 'Following' &&
        currentUserAddress &&
        profileAddress.toLowerCase() === currentUserAddress.toLowerCase();

      let finalItems: UserListItem[];
      if (isOwnFollowingList) {
        finalItems = processed.map(u => ({ ...u, isFollowing: true }));
      } else if (isAuthenticated && currentUserAddress && processed.length > 0) {
        const followStatuses = await Promise.all(
          processed.map(u =>
            u.isFollowing !== undefined
              ? Promise.resolve(u.isFollowing)
              : checkIsFollowing(u.address).catch(() => false)
          )
        );
        finalItems = processed.map((u, i) => ({ ...u, isFollowing: followStatuses[i] }));
      } else {
        finalItems = processed;
      }

      setUsers(prev => [...prev, ...finalItems]);
      setCurrentPage(nextPage);
      setHasMore(pagination?.hasMore ?? false);
    } catch (err) {
      console.warn('Failed to load more followers:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, currentPage, title, profileAddress, currentUserAddress, isAuthenticated, sortOption, debouncedSearch]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!open) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, loadMore]);

  // Reset state when drawer closes
  useEffect(() => {
    if (!open) {
      setUsers([]);
      setError(null);
      setCurrentPage(1);
      setHasMore(false);
      setTotalCount(null);
      setSearchQuery('');
      setDebouncedSearch('');
      setSortOption('newest');
    }
  }, [open]);

  const toggleSort = () => {
    setSortOption(prev => prev === 'newest' ? 'earliest' : 'newest');
  };

  const handleUserClick = (user: UserListItem) => {
    onOpenChange(false);
    if (user.username) {
      navigate(`/app/${user.username}`);
    } else {
      navigate(`/app/profile?id=${user.address}`);
    }
  };

  const handleFollowToggle = async (user: UserListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!isAuthenticated) {
      toast.error('Please log in first');
      return;
    }

    setLoadingFollows(prev => new Set(prev).add(user.address));

    try {
      if (user.isFollowing) {
        await unfollowUser(user.address);
        setUsers(prev => prev.map(u => 
          u.address === user.address ? { ...u, isFollowing: false } : u
        ));
        toast.success(`Unfollowed ${user.displayName || user.username || 'user'}`);
      } else {
        await followUser(user.address);
        setUsers(prev => prev.map(u => 
          u.address === user.address ? { ...u, isFollowing: true } : u
        ));
        toast.success(`Following ${user.displayName || user.username || 'user'}`);
      }
    } catch (error) {
      handleApiError(error, 'Failed to update follow status');
    } finally {
      setLoadingFollows(prev => {
        const next = new Set(prev);
        next.delete(user.address);
        return next;
      });
    }
  };

  const isCurrentUser = (address: string) => 
    currentUserAddress?.toLowerCase() === address.toLowerCase();

  const titleWithCount = totalCount !== null && totalCount > 0
    ? `${title} (${totalCount})`
    : title;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="max-h-[85vh]" hideHandle>
        <DrawerHeader className="px-4 pb-2">
          <DrawerTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            {titleWithCount}
          </DrawerTitle>
        </DrawerHeader>

        {/* Search & Sort Controls */}
        <div className="px-4 pb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full h-9 pl-9 pr-8 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleSort}
            className="shrink-0 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white text-xs gap-1.5"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            {SORT_LABELS[sortOption]}
          </Button>
        </div>

        <div className="flex-1 px-4 pb-6 overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(85vh - 140px)', WebkitOverflowScrolling: 'touch' }}>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                  <Skeleton className="w-12 h-12 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-zinc-600 mb-3" />
              <p className="text-zinc-400 text-lg font-medium">Error Loading</p>
              <p className="text-zinc-500 text-sm mt-1">{error}</p>
              <Button
                variant="glass"
                className="mt-4"
                onClick={() => {
                  onOpenChange(false);
                  setTimeout(() => onOpenChange(true), 100);
                }}
              >
                Try Again
              </Button>
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-zinc-600 mb-3" />
              <p className="text-zinc-400 text-lg font-medium">
                {debouncedSearch
                  ? 'No results found'
                  : title === 'Followers' ? 'No followers yet' : 'Not following anyone'}
              </p>
              <p className="text-zinc-500 text-sm mt-1">
                {debouncedSearch
                  ? `No matches for "${debouncedSearch}"`
                  : title === 'Followers' 
                    ? 'Followers will appear here'
                    : 'Follow users to see them here'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <button
                  key={user.address}
                  onClick={() => handleUserClick(user)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
                >
                  <Avatar className="w-12 h-12 rounded-lg">
                    {user.avatarUrl ? (
                      <AvatarImage src={user.avatarUrl} alt={user.displayName || 'User'} />
                    ) : null}
                    <AvatarFallback className="bg-zinc-800 text-white rounded-lg">
                      {(user.displayName || user.username || '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-white truncate">
                        {user.displayName || user.username || truncateAddress(user.address)}
                      </span>
                      {user.isVerified && <VerifiedBadge className="w-4 h-4 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2">
                      {user.username ? (
                        <span className="text-zinc-500 text-sm truncate">@{user.username.replace('@', '')}</span>
                      ) : (
                        <span className="text-zinc-600 text-sm truncate font-mono">{truncateAddress(user.address)}</span>
                      )}
                      {user.followsYou && !isCurrentUser(user.address) && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                          Follows you
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Follow/Unfollow button - hide for self */}
                  {!isCurrentUser(user.address) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => handleFollowToggle(user, e)}
                      disabled={loadingFollows.has(user.address)}
                      className={cn(
                        "shrink-0 rounded-lg",
                        user.isFollowing
                          ? "bg-zinc-800 text-white hover:bg-red-500/20 hover:text-red-400"
                          : "bg-white/10 text-white hover:bg-white/20"
                      )}
                    >
                      {loadingFollows.has(user.address) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : user.isFollowing ? (
                        <>
                          <UserMinus className="w-4 h-4 mr-1" />
                          Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 mr-1" />
                          Follow
                        </>
                      )}
                    </Button>
                  )}
                </button>
              ))}

              {/* Loading more spinner */}
              {isLoadingMore && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                </div>
              )}

              {/* Sentinel for IntersectionObserver */}
              {hasMore && currentPage < MAX_PAGES && (
                <div ref={sentinelRef} className="h-1" />
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

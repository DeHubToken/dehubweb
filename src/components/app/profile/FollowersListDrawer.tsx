import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Users, UserPlus, UserMinus, Search, ArrowUpDown, X, Clock, FolderPlus } from 'lucide-react';
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
import { getFollowList, followUser, isFollowing as checkIsFollowing, type FollowListItem } from '@/lib/api/dehub';
import { useFollowOverrides, toggleFollowFor } from '@/hooks/use-follow';
import { buildAvatarUrl } from '@/lib/media-url';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { useFollowGroups, MAX_GROUPS, MAX_GROUP_NAME } from '@/hooks/use-follow-groups';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AppState } from '@/components/app/AppState';

const MAX_PAGES = 3;
const PAGE_SIZE = 30;
const FOLLOWING_CACHE_PAGE_SIZE = 100; // API caps at 100 per page regardless of requested limit
const FOLLOW_BACK_ALL_REVEAL_THRESHOLD = 2;
const BULK_FOLLOW_CONCURRENCY = 4;

type SortOption = 'newest' | 'earliest';
const SORT_LABEL_KEYS: Record<SortOption, string> = {
  newest: 'follow.sortNewest',
  earliest: 'follow.sortEarliest',
};

/** Truncate a hex address to 0x1234…abcd */
function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const value = error as { message?: unknown; error?: unknown };
    if (typeof value.message === 'string') return value.message;
    if (typeof value.error === 'string') return value.error;
  }
  return String(error);
}

interface UserListItem {
  address: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  isFollowing?: boolean;
  followsYou?: boolean;
  isPrivate?: boolean;
  isPending?: boolean;
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
function mapFollowListItem(item: FollowListItem & { isPrivate?: boolean }): UserListItem {
  return {
    address: item.address,
    username: item.username,
    displayName: item.displayName || item.username,
    avatarUrl: buildAvatarUrl(item.address, item.avatarImageUrl || item.avatarUrl),
    isVerified: item.isVerified,
    isFollowing: item.isFollowing,
    followsYou: item.followsYou,
    isPrivate: item.isPrivate,
  };
}

export function FollowersListDrawer({
  open,
  onOpenChange,
  profileAddress,
  title,
}: FollowersListDrawerProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { walletAddress: currentUserAddress, isAuthenticated } = useAuth();
  const { handleApiError } = useReauthHandler();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolvingStatus, setIsResolvingStatus] = useState(false);
  const followOverrides = useFollowOverrides();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFollowBackAll, setShowFollowBackAll] = useState(false);
  const [isFollowingBackAll, setIsFollowingBackAll] = useState(false);
  const [bulkFollowProgress, setBulkFollowProgress] = useState({ completed: 0, total: 0 });
  

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Group assignment — only on your own Following list; there is nothing to
  // file on someone else's, and none of it is visible to them either way.
  const canGroup =
    title === 'Following' &&
    !!currentUserAddress &&
    profileAddress.toLowerCase() === currentUserAddress.toLowerCase();
  const canFollowBackAll =
    title === 'Followers' &&
    !!currentUserAddress &&
    profileAddress.toLowerCase() === currentUserAddress.toLowerCase();
  const { groups, createGroup, toggleMember } = useFollowGroups();
  const [groupingAddress, setGroupingAddress] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');

  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const followingSetRef = useRef<Set<string> | null>(null);
  const followersSetRef = useRef<Set<string> | null>(null);
  const followBackStreakRef = useRef(0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset the following cache when the drawer opens so it's always fresh
  useEffect(() => {
    if (open) {
      followingSetRef.current = null;
      followersSetRef.current = null;
    }
  }, [open]);

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

        const isOwnFollowingList =
          title === 'Following' &&
          currentUserAddress &&
          profileAddress.toLowerCase() === currentUserAddress.toLowerCase();

        const isOwnFollowersList =
          title === 'Followers' &&
          currentUserAddress &&
          profileAddress.toLowerCase() === currentUserAddress.toLowerCase();

        // Phase 1: Show list immediately with basic info
        const initialUsers: UserListItem[] = isOwnFollowingList
          ? processed.map(u => ({ ...u, isFollowing: true }))
          : isOwnFollowersList
            ? processed.map(u => ({ ...u, followsYou: true }))
            : processed;

        setUsers(initialUsers);
        setCurrentPage(1);
        setHasMore(pagination?.hasMore ?? false);
        setTotalCount(pagination?.totalCount ?? null);
        setIsLoading(false);

        // Phase 2: resolve follow statuses in the background — but only when
        // the API did not already answer with them. It stamps isFollowing and
        // followsYou on every row for an authenticated viewer, which makes the
        // walk below (up to ten requests of a hundred, to label twenty rows)
        // dead weight. Own row is skipped: it never carries flags, and has no
        // button either.
        const serverResolved = processed
          .filter(u => u.address?.toLowerCase() !== currentUserAddress?.toLowerCase())
          .every(u => typeof u.isFollowing === 'boolean' && typeof u.followsYou === 'boolean');
        const needsFollowingCache = !serverResolved && !isOwnFollowingList && isAuthenticated && currentUserAddress && !followingSetRef.current;
        const needsFollowersCache = !serverResolved && isOwnFollowingList && isAuthenticated && currentUserAddress && !followersSetRef.current;

        if (needsFollowingCache || needsFollowersCache) {
          setIsResolvingStatus(true);
          try {
            const buildCache = async (cacheType: 'following' | 'followers'): Promise<Set<string>> => {
              const all: string[] = [];
              let pg = 1;
              let more = true;
              while (more) {
                const res = await getFollowList(currentUserAddress!, cacheType, { page: pg, limit: FOLLOWING_CACHE_PAGE_SIZE });
                all.push(...res.items.map(f => (f.address || '').toLowerCase()));
                more = res.pagination?.hasMore ?? false;
                pg++;
                if (pg > 10) break;
              }
              return new Set(all);
            };

            if (needsFollowingCache) {
              try { followingSetRef.current = await buildCache('following'); }
              catch { followingSetRef.current = new Set(); }
            }
            if (needsFollowersCache) {
              try { followersSetRef.current = await buildCache('followers'); }
              catch { followersSetRef.current = new Set(); }
            }

            // Patch users with resolved statuses
            const followingSet = followingSetRef.current;
            const followersSet = followersSetRef.current;
            setUsers(prev => prev.map(u => {
              if (isOwnFollowingList) {
                return { ...u, isFollowing: true, followsYou: followersSet ? followersSet.has(u.address.toLowerCase()) : false };
              }
              return {
                ...u,
                isFollowing: followingSet ? followingSet.has(u.address.toLowerCase()) : u.isFollowing,
                followsYou: isOwnFollowersList ? true : u.followsYou,
              };
            }));
          } finally {
            setIsResolvingStatus(false);
          }
        }
      } catch (err: unknown) {
        console.error('Error fetching follow list:', err);
        const msg = getErrorMessage(err);
        if (msg.toLowerCase().includes('hidden')) {
          setError(t('follow.errHidden'));
        } else if (msg.toLowerCase().includes('authentication required')) {
          setError(t('follow.errPrivate'));
          toast.error(t('follow.errPrivateToast'));
        } else {
          setError(t('follow.errLoad'));
          toast.error(t('follow.errLoadToast'));
        }
        setIsLoading(false);
      }
    };

    fetchInitialPage();
  }, [open, profileAddress, title, currentUserAddress, isAuthenticated, sortOption, debouncedSearch, t]);

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

      const isOwnFollowersList =
        title === 'Followers' &&
        currentUserAddress &&
        profileAddress.toLowerCase() === currentUserAddress.toLowerCase();

      const followingSet = followingSetRef.current;
      const followersSet = followersSetRef.current;
      // A server-sent flag wins over the cache; the cache is only there for
      // API builds that answer without them.
      const finalItems: UserListItem[] = isOwnFollowingList
        ? processed.map(u => ({
            ...u,
            isFollowing: true,
            followsYou: typeof u.followsYou === 'boolean'
              ? u.followsYou
              : followersSet ? followersSet.has(u.address.toLowerCase()) : false,
          }))
        : processed.map(u => ({
            ...u,
            isFollowing: typeof u.isFollowing === 'boolean'
              ? u.isFollowing
              : followingSet ? followingSet.has(u.address.toLowerCase()) : false,
            followsYou: isOwnFollowersList ? true : u.followsYou,
          }));

      setUsers(prev => [...prev, ...finalItems]);
      setCurrentPage(nextPage);
      setHasMore(pagination?.hasMore ?? false);
    } catch (err) {
      console.warn('Failed to load more followers:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, currentPage, title, profileAddress, currentUserAddress, sortOption, debouncedSearch]);

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
      followBackStreakRef.current = 0;
      setShowFollowBackAll(false);
      setIsFollowingBackAll(false);
      setBulkFollowProgress({ completed: 0, total: 0 });
      followingSetRef.current = null;
    }
  }, [open]);

  const toggleSort = () => {
    setSortOption(prev => prev === 'newest' ? 'earliest' : 'newest');
  };

  const handleUserClick = (user: UserListItem) => {
    onOpenChange(false);
    if (user.username) {
      navigate(`/${user.username}`);
    } else {
      navigate(`/profile?id=${user.address}`);
    }
  };

  const recordFollowBack = useCallback(() => {
    followBackStreakRef.current += 1;
    if (followBackStreakRef.current >= FOLLOW_BACK_ALL_REVEAL_THRESHOLD) {
      setShowFollowBackAll(true);
    }
  }, []);

  const handleFollowToggle = (user: UserListItem, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isAuthenticated) {
      toast.error(t('follow.logInFirst'));
      return;
    }

    const name = user.displayName || user.username || t('follow.someone');

    // Private account (not yet followed): follow becomes a request — show
    // "Requested" instantly, revert on error. Pending is not a boolean follow
    // state, so it stays out of the shared override store.
    if (!user.isFollowing && user.isPrivate) {
      setUsers(prev => prev.map(u =>
        u.address === user.address ? { ...u, isPending: true } : u
      ));
      followUser(user.address)
        .then(() => {
          if (canFollowBackAll && user.followsYou) recordFollowBack();
          else followBackStreakRef.current = 0;
          toast.success(t('follow.requestSentTo', { name }));
        })
        .catch((error: unknown) => {
          followBackStreakRef.current = 0;
          const msgLower = getErrorMessage(error).toLowerCase();
          if (msgLower.includes('already pending')) {
            toast.info(t('follow.requestAlreadyPending'));
          } else if (msgLower.includes('already') || msgLower.includes('following')) {
            followingSetRef.current?.add(user.address.toLowerCase());
            setUsers(prev => prev.map(u =>
              u.address === user.address ? { ...u, isPending: false, isFollowing: true } : u
            ));
            toast.info(t('follow.alreadyFollowing', { name }));
          } else {
            setUsers(prev => prev.map(u =>
              u.address === user.address ? { ...u, isPending: false } : u
            ));
            handleApiError(error, t('follow.updateFailed'));
          }
        });
      return;
    }

    // Optimistic flip via the shared store + local list state (instant, no spinner)
    const wasFollowing = user.isFollowing === true;
    const isFollowBack = canFollowBackAll && user.followsYou && !wasFollowing;
    if (!isFollowBack) followBackStreakRef.current = 0;
    if (wasFollowing) followingSetRef.current?.delete(user.address.toLowerCase());
    else followingSetRef.current?.add(user.address.toLowerCase());
    setUsers(prev => prev.map(u =>
      u.address === user.address ? { ...u, isFollowing: !wasFollowing } : u
    ));
    void toggleFollowFor(queryClient, user.address, wasFollowing, {
      name,
      onError: (error) => {
        if (isFollowBack) followBackStreakRef.current = 0;
        if (wasFollowing) followingSetRef.current?.add(user.address.toLowerCase());
        else followingSetRef.current?.delete(user.address.toLowerCase());
        setUsers(prev => prev.map(u =>
          u.address === user.address ? { ...u, isFollowing: wasFollowing } : u
        ));
        handleApiError(error, t('follow.updateFailed'));
      },
      onSuccess: () => {
        if (isFollowBack) recordFollowBack();
      },
    });
  };

  const isCurrentUser = useCallback((address: string) =>
    currentUserAddress?.toLowerCase() === address.toLowerCase(), [currentUserAddress]);

  // Cross-surface follow overrides win over the fetched list state
  const displayUsers = useMemo(() => users.map(u => {
    const override = followOverrides.get(u.address.toLowerCase());
    return override === undefined ? u : { ...u, isFollowing: override };
  }), [users, followOverrides]);

  const hasVisibleFollowBacks = displayUsers.some(user =>
    !isCurrentUser(user.address) && user.followsYou && !user.isFollowing && !user.isPending
  );

  const getEveryFollowListItem = useCallback(async (type: 'followers' | 'following') => {
    const items: UserListItem[] = [];
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const response = await getFollowList(currentUserAddress!, type, {
        page,
        limit: FOLLOWING_CACHE_PAGE_SIZE,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      items.push(...response.items.map(mapFollowListItem));
      hasNextPage = response.items.length > 0 && (response.pagination?.hasMore ?? false);
      page += 1;
    }

    return items;
  }, [currentUserAddress]);

  const handleFollowBackAll = useCallback(async () => {
    if (!canFollowBackAll || !currentUserAddress || isFollowingBackAll) return;

    setIsFollowingBackAll(true);
    setBulkFollowProgress({ completed: 0, total: 0 });

    try {
      const [allFollowers, allFollowing] = await Promise.all([
        getEveryFollowListItem('followers'),
        getEveryFollowListItem('following'),
      ]);
      const followingAddresses = new Set(allFollowing.map(user => user.address.toLowerCase()));
      followingSetRef.current?.forEach(address => followingAddresses.add(address));
      followOverrides.forEach((isFollowing, address) => {
        if (isFollowing) followingAddresses.add(address);
      });
      const pendingAddresses = new Set(
        users.filter(user => user.isPending).map(user => user.address.toLowerCase()),
      );
      const candidates = Array.from(
        new Map(
          allFollowers
            .filter(user =>
              !isCurrentUser(user.address) &&
              !followingAddresses.has(user.address.toLowerCase()) &&
              !pendingAddresses.has(user.address.toLowerCase())
            )
            .map(user => [user.address.toLowerCase(), user]),
        ).values(),
      );
      followingSetRef.current ??= followingAddresses;

      setBulkFollowProgress({ completed: 0, total: candidates.length });
      if (candidates.length === 0) {
        toast.info(t('follow.everyoneFollowedBack', 'You already follow back everyone'));
        return;
      }

      let nextIndex = 0;
      let completed = 0;
      let failed = 0;

      const worker = async () => {
        while (nextIndex < candidates.length) {
          const user = candidates[nextIndex++];
          let succeeded = false;

          if (user.isPrivate) {
            try {
              await followUser(user.address);
              succeeded = true;
              setUsers(current => current.map(item =>
                item.address.toLowerCase() === user.address.toLowerCase()
                  ? { ...item, isPending: true }
                  : item
              ));
            } catch (error) {
              const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
              if (message.includes('already pending')) {
                succeeded = true;
                setUsers(current => current.map(item =>
                  item.address.toLowerCase() === user.address.toLowerCase()
                    ? { ...item, isPending: true }
                    : item
                ));
              } else {
                failed += 1;
              }
            }
          } else {
            succeeded = await toggleFollowFor(queryClient, user.address, false, {
              silent: true,
              onError: () => {},
            });
            if (!succeeded) failed += 1;
          }

          if (succeeded) followingSetRef.current?.add(user.address.toLowerCase());
          completed += 1;
          setBulkFollowProgress({ completed, total: candidates.length });
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(BULK_FOLLOW_CONCURRENCY, candidates.length) }, () => worker()),
      );

      const followed = candidates.length - failed;
      if (failed === 0) {
        toast.success(t('follow.followedBackAll', 'Followed back everyone'));
      } else if (followed > 0) {
        toast.warning(t('follow.followedBackSome', {
          defaultValue: 'Followed back {{followed}} people; {{failed}} failed',
          followed,
          failed,
        }));
      } else {
        toast.error(t('follow.followBackAllFailed', 'Could not follow anyone back'));
      }
    } catch (error) {
      handleApiError(error, t('follow.followBackAllFailed', 'Could not follow everyone back'));
    } finally {
      setIsFollowingBackAll(false);
    }
  }, [canFollowBackAll, currentUserAddress, followOverrides, getEveryFollowListItem, handleApiError, isCurrentUser, isFollowingBackAll, queryClient, t, users]);

  const heading = title === 'Followers' ? t('follow.followers') : t('follow.following');
  const titleWithCount = totalCount !== null && totalCount > 0
    ? `${heading} (${totalCount})`
    : heading;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass className="max-h-[85dvh]" hideHandle>
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
              placeholder={t('follow.searchPlaceholder')}
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
            {t(SORT_LABEL_KEYS[sortOption])}
          </Button>
        </div>

        {canFollowBackAll && showFollowBackAll && (hasVisibleFollowBacks || isFollowingBackAll) && (
          <div className="px-4 pb-3">
            <Button
              onClick={handleFollowBackAll}
              disabled={isFollowingBackAll}
              className="w-full h-10 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 disabled:bg-white/15 disabled:text-zinc-400"
            >
              {isFollowingBackAll ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {bulkFollowProgress.total > 0
                    ? t('follow.followingBackProgress', {
                        defaultValue: 'Following back {{completed}} of {{total}}',
                        completed: bulkFollowProgress.completed,
                        total: bulkFollowProgress.total,
                      })
                    : t('follow.findingFollowers', 'Finding followers...')}
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  {t('follow.followBackAll', 'Follow back all')}
                </>
              )}
            </Button>
          </div>
        )}

        <div className="flex-1 px-4 pb-6 overflow-y-auto overscroll-contain" style={{ maxHeight: 'calc(85vh - 140px)', WebkitOverflowScrolling: 'touch' }}>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                  <Skeleton className="w-[4.25rem] h-[4.25rem] rounded-xl" />
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
              <p className="text-zinc-400 text-lg font-medium">{t('follow.errorTitle')}</p>
              <p className="text-zinc-500 text-sm mt-1">{error}</p>
              <Button
                variant="glass"
                className="mt-4"
                onClick={() => {
                  onOpenChange(false);
                  setTimeout(() => onOpenChange(true), 100);
                }}
              >
                {t('follow.tryAgain')}
              </Button>
            </div>
          ) : users.length === 0 ? (
            <AppState
              icon={debouncedSearch ? 'search' : 'accounts'}
              title={debouncedSearch
                ? t('follow.noResults')
                : title === 'Followers' ? t('follow.noFollowersYet') : t('follow.notFollowingAnyone')}
              description={debouncedSearch
                ? t('follow.noMatches', { query: debouncedSearch })
                : title === 'Followers' ? t('follow.followersAppearHere') : t('follow.followToSeeThem')}
              kind={debouncedSearch ? 'search-empty' : 'empty'}
              size="drawer"
            />
          ) : (
            <div className="space-y-2">
              {displayUsers.map((user) => (
                <div key={user.address}>
                <button
                  onClick={() => handleUserClick(user)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors text-left"
                >
                  <Avatar className="w-[4.25rem] h-[4.25rem] rounded-xl shrink-0 self-start">
                    {user.avatarUrl ? (
                      <AvatarImage src={user.avatarUrl} alt={user.displayName || 'User'} />
                    ) : null}
                    <AvatarFallback className="bg-zinc-800 text-white rounded-xl text-lg">
                      {(user.displayName || user.username || '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  
                  {/* Name, handle and relationship get a line each. The handle
                      used to share its row with the Follows you chip, and both
                      were truncated, so an ordinary username was cut in half to
                      make room for a badge. */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-1.5">
                      <span className="font-semibold text-white break-words line-clamp-2">
                        {user.displayName || user.username || truncateAddress(user.address)}
                      </span>
                      {user.isVerified && <VerifiedBadge className="w-4 h-4 shrink-0 mt-1" />}
                    </div>
                    {user.username ? (
                      <div className="text-zinc-500 text-sm break-all">@{user.username.replace('@', '')}</div>
                    ) : (
                      <div className="text-zinc-600 text-sm break-all font-mono">{truncateAddress(user.address)}</div>
                    )}
                    {user.followsYou && !isCurrentUser(user.address) && (
                      <div className="mt-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          {t('follow.followsYou')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Group filing. Sits before the follow button so the
                      destructive-ish action stays where the thumb expects it. */}
                  {canGroup && !isCurrentUser(user.address) && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={t('follow.addToGroup', { name: user.displayName || user.username || t('follow.someone') })}
                      onClick={(e) => {
                        e.stopPropagation();
                        setGroupingAddress(prev => (prev === user.address ? null : user.address));
                        setNewGroupName('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        e.stopPropagation();
                        setGroupingAddress(prev => (prev === user.address ? null : user.address));
                      }}
                      className={cn(
                        'shrink-0 flex items-center justify-center w-9 h-9 rounded-lg transition-colors cursor-pointer',
                        groups.some(g => g.members.includes(user.address.toLowerCase()))
                          ? 'bg-white/15 text-white'
                          : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white',
                      )}
                    >
                      <FolderPlus className="w-4 h-4" />
                    </span>
                  )}

                  {/* Follow/Unfollow button - hide for self */}
                  {!isCurrentUser(user.address) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => handleFollowToggle(user, e)}
                      disabled={user.isPending || isResolvingStatus}
                      className={cn(
                        "shrink-0 rounded-lg",
                        user.isFollowing
                          ? "bg-zinc-800 text-white hover:bg-red-500/20 hover:text-red-400"
                          : user.isPending
                            ? "bg-zinc-800 text-zinc-400 cursor-default"
                            : "bg-white/10 text-white hover:bg-white/20"
                      )}
                    >
                      {user.isFollowing ? (
                        <>
                          <UserMinus className="w-4 h-4 mr-1" />
                          {t('follow.following')}
                        </>
                      ) : user.isPending ? (
                        <>
                          <Clock className="w-4 h-4 mr-1" />
                          {t('follow.requested')}
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 mr-1" />
                          {user.followsYou ? t('follow.followBack') : t('follow.follow')}
                        </>
                      )}
                    </Button>
                  )}
                </button>

                {/* Group picker, inline under the row. Deliberately not a
                    nested drawer: a vaul Root inside an open Root fights the
                    parent for focus and drag. */}
                {canGroup && groupingAddress === user.address && (
                  <div className="mt-1 rounded-xl border border-white/10 bg-white/[0.04] p-3 space-y-2">
                    {groups.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {groups.map((group) => {
                          const isMember = group.members.includes(user.address.toLowerCase());
                          return (
                            <button
                              key={group.id}
                              onClick={() => toggleMember(group.id, user.address)}
                              className={cn(
                                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                                isMember
                                  ? 'bg-white/20 text-white border border-white/30'
                                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
                              )}
                            >
                              {group.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          if (createGroup(newGroupName, user.address)) setNewGroupName('');
                        }}
                        maxLength={MAX_GROUP_NAME}
                        placeholder={groups.length >= MAX_GROUPS ? t('follow.groupLimitReached') : t('follow.newGroupName')}
                        disabled={groups.length >= MAX_GROUPS}
                        className="flex-1 h-8 px-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!newGroupName.trim() || groups.length >= MAX_GROUPS}
                        onClick={() => { if (createGroup(newGroupName, user.address)) setNewGroupName(''); }}
                        className="h-8 shrink-0 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
                      >
                        {t('follow.createGroup')}
                      </Button>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      {t('follow.groupsHint')}
                    </p>
                  </div>
                )}
                </div>
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

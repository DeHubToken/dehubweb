import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Follow Suggestions Carousel
 * ===========================
 * The feed's "who to follow" row — accounts you do not follow yet, one tap to
 * follow, the suggestion disappearing the moment you do.
 *
 * Named "Mobile" and carrying `lg:hidden` from the day it was written, on the
 * reasoning that desktop had the right rail's follow tab. Both are gone now:
 * the rail's panel opens on Leaderboard and gained a fourth tab, so on a
 * desktop feed there was nothing suggesting anybody to follow at all, and the
 * feed's multi-column path — which is what a wide window gets — never carried
 * this row either. It runs at every width now, in both feed paths.
 *
 * @module components/app/mobile/MobileWhoToFollowCarousel
 */

import { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from "lucide-react";
import ChevronRight from "@/components/ui/cut-icons/next";

import { useNavigate } from 'react-router-dom';
import { AppState } from '@/components/app/AppState';
import { FollowCoverCard, suggestionName } from '@/components/app/FollowCoverCard';
import { getSuggestedAccounts, getCachedSuggestedProfiles, type SuggestedAccount } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { useFollowedSuggestions } from '@/hooks/use-followed-suggestions';
import { useFollowOverrides, toggleFollowFor } from '@/hooks/use-follow';
import { toast } from 'sonner';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';

const BATCH_SIZE = 10;
const MAX_PAGES = 10;
/** How long a followed card shows "Following" before it leaves the row. */
const FOLLOWED_LINGER_MS = 700;

interface MobileWhoToFollowCarouselProps {
  /** Explore lists it among its sections: no empty state there, no "See all" back to Explore. */
  surface?: 'feed' | 'explore';
}

export function MobileWhoToFollowCarousel({ surface = 'feed' }: MobileWhoToFollowCarouselProps = {}) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const { isAuthenticated, walletAddress } = useAuth();
  const { handleApiError } = useReauthHandler();
  const { followedUsers, markFollowed, unmarkFollowed } = useFollowedSuggestions();
  const followOverrides = useFollowOverrides();
  const queryClient = useQueryClient();
  const [justFollowed, setJustFollowed] = useState<Set<string>>(() => new Set());
  const lingerTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = lingerTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const {
    data,
    isLoading,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: isAuthenticated ? ['suggested-accounts', walletAddress] : ['cached-suggested-profiles'],
    queryFn: ({ pageParam = 1 }) => {
      if (!isAuthenticated) {
        const offset = (pageParam - 1) * BATCH_SIZE;
        return getCachedSuggestedProfiles(BATCH_SIZE, offset);
      }
      return getSuggestedAccounts(BATCH_SIZE, pageParam);
    },
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
    staleTime: isAuthenticated ? 5 * 60 * 1000 : 30 * 60 * 1000,
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

  // Auto-fetch more when filtered list drops below 3
  const prevFilteredCount = useRef(filteredSuggestions.length);
  useEffect(() => {
    if (
      filteredSuggestions.length < 3 &&
      filteredSuggestions.length < prevFilteredCount.current &&
      hasNextPage && !isFetchingNextPage
    ) {
      fetchNextPage();
    }
    prevFilteredCount.current = filteredSuggestions.length;
  }, [filteredSuggestions.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

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

  const handleUserClick = useCallback((user: SuggestedAccount) => {
    const target = user.username || user.address;
    if (target) {
      navigate(`/${target}`);
    }
  }, [navigate]);

  const setFollowedFlag = useCallback((address: string, on: boolean) => {
    setJustFollowed((prev) => {
      if (prev.has(address) === on) return prev;
      const next = new Set(prev);
      if (on) next.add(address); else next.delete(address);
      return next;
    });
  }, []);

  const handleDismiss = useCallback((user: SuggestedAccount) => {
    markFollowed(user.address);
  }, [markFollowed]);

  const handleFollow = (user: SuggestedAccount) => {
    if (!isAuthenticated) {
      toast.error(_copy("copy.404bd6545a07", { defaultValue: "Please log in to follow users" }));
      return;
    }

    if (followedUsers.has(user.address) || followOverrides.get(user.address.toLowerCase())) {
      return;
    }

    if (justFollowed.has(user.address)) return;

    // Optimistic: the card says Following straight away, then leaves the row;
    // a failed call puts it back as it was.
    setFollowedFlag(user.address, true);
    lingerTimers.current.set(user.address, setTimeout(() => {
      lingerTimers.current.delete(user.address);
      markFollowed(user.address);
      setFollowedFlag(user.address, false);
    }, FOLLOWED_LINGER_MS));
    toggleFollowFor(queryClient, user.address, false, {
      name: suggestionName(user),
      onError: (error, info) => {
        const timer = lingerTimers.current.get(user.address);
        if (timer) clearTimeout(timer);
        lingerTimers.current.delete(user.address);
        setFollowedFlag(user.address, false);
        unmarkFollowed(user.address);
        if (!info.handled) handleApiError(error, 'Failed to follow user');
      },
    });
  };

  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    if (surface === 'explore') return null;
    return (
      <div data-discovery-section className="py-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (filteredSuggestions.length === 0) {
    if (surface === 'explore') return null;
    return (
      <div data-discovery-section data-who-to-follow data-no-swipe className="py-4 border-b border-zinc-800/50">
        <AppState
          icon="subscriptions"
          title={_copy("copy.f45e06965f93", { defaultValue: "No follow suggestions yet" })}
          description={_copy("copy.34f5da2599fa", { defaultValue: "New account suggestions will appear here." })}
          size="compact"
          primaryAction={{ label: _copy("copy.0e9161011702", { defaultValue: "Refresh" }), onClick: () => refetch(), disabled: isFetching, loading: isFetching }}
        />
      </div>
    );
  }

  return (
    // No data-discovery-section here: glass dresses that as a bento, and the
    // cards already carry the theme's surface.
    <section
      data-who-to-follow
      data-follow-cards
      data-follow-surface={surface}
      data-no-swipe
      className={surface === 'feed' ? 'py-4 border-b border-zinc-800/50' : 'py-1'}
    >
      <div data-fc-head>
        <h2 data-fc-title>{_copy("copy.036cfd952896", { defaultValue: "Who to follow" })}</h2>
        {surface === 'feed' && (
          <button type="button" data-fc-see-all onClick={() => navigate('/app/explore')}>
            {_copy("copy.44c9d36485b7", { defaultValue: "See All" })}<ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <SwipeableCarousel
        ref={carouselRef}
        fadeEdges
        className="fc-rail flex overflow-x-auto overscroll-x-contain scrollbar-hide px-4 pb-2 snap-x snap-mandatory scroll-px-4"
        onScroll={handleScroll}
      >
        {filteredSuggestions.map((user) => (
          <FollowCoverCard
            key={user.address}
            user={user}
            followed={justFollowed.has(user.address)}
            onOpen={handleUserClick}
            onFollow={handleFollow}
            onDismiss={handleDismiss}
          />
        ))}
        {isFetchingNextPage && (
          <div className="flex-shrink-0 w-16 flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
          </div>
        )}
      </SwipeableCarousel>
    </section>
  );
}

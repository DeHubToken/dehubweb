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
 * It never runs dry: the feed pages through everyone ranked by activity and
 * profile completeness, Explore by newest sign-up, empty profiles last, and
 * keeps loading as you follow, skip or scroll until nobody is left.
 *
 * Follow is built for following a run of people in a row: the button says
 * Following the instant it is tapped, the card folds away a beat later and the
 * next one slides into its place, while the request runs behind it without a
 * toast. A failed request retries on its own; only if it still fails does the
 * card come back, with a quiet "Retry" on the notice.
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
import { AuthenticationError, getSuggestedAccounts, getRankedSuggestions, type SuggestedAccount } from '@/lib/api/dehub';
import { useAuth } from '@/contexts/AuthContext';
import { useReauthHandler } from '@/hooks/use-reauth-handler';
import { useFollowedSuggestions } from '@/hooks/use-followed-suggestions';
import { useFollowOverrides, toggleFollowFor } from '@/hooks/use-follow';
import { toast } from 'sonner';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';

const BATCH_SIZE = 10;
/** How long a followed card shows "Following" before it folds away. */
const FOLLOWED_LINGER_MS = 320;
/** The fold itself (follow-cards.css, [data-leaving]). */
const LEAVE_MS = 280;
/** Background attempts after the first before a follow is given up on. */
const FOLLOW_RETRIES = 3;

type CardPhase = 'following' | 'leaving';

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
  const [phases, setPhases] = useState<ReadonlyMap<string, CardPhase>>(() => new Map());
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
    queryKey: ['suggested-accounts', walletAddress, surface],
    queryFn: async ({ pageParam }) => {
      const sort = surface === 'explore' ? 'newest' : 'active';
      try {
        return await getRankedSuggestions(sort, pageParam, BATCH_SIZE);
      } catch (error) {
        // A server without the ranked list yet still gets the old ten picks.
        if (pageParam) throw error;
        const legacy = await getSuggestedAccounts(BATCH_SIZE, 1);
        return { items: legacy.items, nextCursor: null };
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as string | null,
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

  // Keep a few cards ahead: following or skipping pulls the next page in.
  useEffect(() => {
    if (filteredSuggestions.length < 5 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
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

  const setPhase = useCallback((address: string, phase: CardPhase | null) => {
    setPhases((prev) => {
      if ((prev.get(address) ?? null) === phase) return prev;
      const next = new Map(prev);
      if (phase) next.set(address, phase); else next.delete(address);
      return next;
    });
  }, []);

  const clearTimer = useCallback((address: string) => {
    const timer = lingerTimers.current.get(address);
    if (timer) clearTimeout(timer);
    lingerTimers.current.delete(address);
  }, []);

  /** Fold the card shut, then drop it from the row. */
  const leave = useCallback((address: string, after: number) => {
    clearTimer(address);
    lingerTimers.current.set(address, setTimeout(() => {
      setPhase(address, 'leaving');
      lingerTimers.current.set(address, setTimeout(() => {
        lingerTimers.current.delete(address);
        markFollowed(address);
        setPhase(address, null);
      }, LEAVE_MS));
    }, after));
  }, [clearTimer, markFollowed, setPhase]);

  const handleDismiss = useCallback((user: SuggestedAccount) => {
    leave(user.address, 0);
  }, [leave]);

  const handleFollow = useCallback((user: SuggestedAccount) => {
    if (!isAuthenticated) {
      toast.error(_copy("copy.404bd6545a07", { defaultValue: "Please log in to follow users" }));
      return;
    }

    if (followedUsers.has(user.address) || followOverrides.get(user.address.toLowerCase())) {
      return;
    }

    if (phases.has(user.address)) return;

    // Optimistic: Following straight away, then the card folds and the next
    // slides in. The request retries quietly; only a final failure brings the
    // card back, with Retry on the notice.
    setPhase(user.address, 'following');
    leave(user.address, FOLLOWED_LINGER_MS);
    const name = suggestionName(user);
    toggleFollowFor(queryClient, user.address, false, {
      name,
      silent: true,
      retries: FOLLOW_RETRIES,
      onError: (error) => {
        clearTimer(user.address);
        setPhase(user.address, null);
        unmarkFollowed(user.address);
        if (error instanceof AuthenticationError) {
          handleApiError(error, _copy("copy.f5a7643bdaac", { defaultValue: "Failed to follow user" }));
          return;
        }
        toast.error(_copy("copy.f5a7643bdaac", { defaultValue: "Failed to follow user" }), {
          id: `follow-retry-${user.address}`,
          description: name,
          action: {
            label: _copy("common.retry", { defaultValue: "Retry" }),
            onClick: () => retryRef.current(user),
          },
        });
      },
    });
  }, [isAuthenticated, followedUsers, followOverrides, phases, setPhase, leave, clearTimer, queryClient, unmarkFollowed, handleApiError, _copy]);
  const retryRef = useRef(handleFollow);
  retryRef.current = handleFollow;

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
            phase={phases.get(user.address)}
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

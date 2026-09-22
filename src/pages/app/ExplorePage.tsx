import { BrandIcon, ThemedIcon } from '@/components/app/war/WarHudIcon';
import { AppState } from '@/components/app/AppState';
import { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect, memo, startTransition, type CSSProperties } from 'react';
import { getDocumentScrollTop } from '@/lib/document-scroll';
import { useDragTabIndicator } from '@/hooks/use-drag-tab-indicator';
import { SEOHead } from '@/components/SEOHead';
import { BadgedName } from '@/components/app/BadgedName';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { WhatsHappening } from '@/components/app/WhatsHappening';
import { NewMembersBento } from '@/components/app/NewMembersBento';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTranslation } from 'react-i18next';
import searchIcon from '@/assets/icons/search-icon.png';
import search3dIcon from '@/assets/icons/search-3d-icon.png';
import trendingFireIcon from '@/assets/icons/trending-fire-icon.png';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, X, Loader2, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { EXPLORE_TABS } from '@/constants/app.constants';
import {
  SearchFilterPanel,
  DEFAULT_SEARCH_FILTERS,
  countActiveSearchFilters,
  type SearchFilterState,
} from '@/components/app/search/SearchFilterPanel';
import { applySorting, filterByDate, filterByContentType } from '@/lib/feed-utils';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { AuthGate } from '@/components/app/AuthGate';
import { 
  useDeHubSearch, 
  useSearchAnalytics,
  getTypeForTab,
  getPostTypeForTab, 
  extractUniqueCreators,
  mapAccountToCreator,
  flattenSearchAccounts,
  flattenSearchVideos,
  type SearchCreator 
} from '@/hooks/use-dehub-search';
import { useSearchHistory } from '@/hooks/use-search-history';
import { useDeHubUserSearch } from '@/hooks/use-dehub-user-search';
import { useFollow } from '@/hooks/use-follow';

// content-visibility for below-fold result cards — browser skips their
// layout/paint until they approach the viewport (matches HomeFeed's pattern).
const OFFSCREEN_RESULT_STYLE: CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 320px',
};
import { buildAvatarUrl } from '@/lib/media-url';
import { getMediaUrl, getCategories, searchNFTs, type DeHubNFT, type DeHubCategory } from '@/lib/api/dehub';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { VideoCard } from '@/components/app/cards/VideoCard';
import { ImageCard } from '@/components/app/cards/ImageCard';
import { PostCard } from '@/components/app/cards/PostCard';
import { mapNFTToVideoItem, mapNFTToImagePost, getContentType } from '@/hooks/use-dehub-feed';
import { useDexScreenerSearchMulti } from '@/hooks/use-dexscreener';
import { useContractToTicker } from '@/hooks/use-contract-to-ticker';
import { useCmcMarketCap } from '@/hooks/use-cmc-market-cap';
import { CashtagPriceCard } from '@/components/app/CashtagPriceCard';
import { useStockQuote } from '@/hooks/use-stock-quote';
import { StockPriceCard } from '@/components/app/StockPriceCard';
import { CashtagResultSwitcher } from '@/components/app/CashtagResultSwitcher';
import type { VideoItem, ImagePost } from '@/types/feed.types';
import { recordTickerSearch } from '@/lib/ticker-search-tracker';
import { scrollDocumentTo } from '@/lib/document-scroll';

// Brand-related search terms where @d should be pinned first
const BRAND_QUERIES = ['d', 'de', 'deh', 'dehu', 'dehub'];

// User result card
const UserResultCard = ({ 
  user, 
  onProfileClick 
}: { 
  user: SearchCreator; 
  onProfileClick?: (handle: string) => void;
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { walletAddress } = useAuth();
  const [localFollowing, setLocalFollowing] = useState(user.isFollowing ?? false);
  // Shared optimistic override wins so this card agrees with every other surface
  const { isFollowing: followOverride, toggleFollow } = useFollow(user.id);

  // Resolve follow status when not provided by search results (e.g. creators
  // from video/ticker results). Cached query (was a raw per-card fetch that
  // refired for every card instance on every search render).
  const followStatusHandle = user.handle.replace('@', '');
  const { data: resolvedFollowStatus } = useQuery({
    queryKey: ['user-follow-status', followStatusHandle, walletAddress?.toLowerCase()],
    queryFn: async () => {
      const { getAccountByUsername } = await import('@/lib/api/dehub');
      const info = await getAccountByUsername(followStatusHandle);
      return !!info?.isFollowing;
    },
    enabled:
      user.isFollowing === undefined &&
      !!walletAddress &&
      !!user.id &&
      !!followStatusHandle &&
      !followStatusHandle.startsWith('0x'),
    staleTime: 5 * 60_000,
    retry: false,
  });
  useEffect(() => {
    if (resolvedFollowStatus) setLocalFollowing(true);
  }, [resolvedFollowStatus]);
  const isFollowing = followOverride ?? localFollowing;
  
  // user.avatar is already a fully built URL from mapAccountToCreator/extractUniqueCreators
  const avatarUrl = user.avatar;
  
  const handleClick = () => {
    const cleanHandle = user.handle.replace('@', '');
    onProfileClick?.(cleanHandle);
    navigate(`/${cleanHandle}`);
  };

  const handleFollow = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!walletAddress) {
      // Could show login modal here
      return;
    }
    if (!user.id) return;

    // Optimistic: the button flips instantly; rollback + toast on failure.
    toggleFollow(isFollowing, { name: user.name });
  };
  
  return (
    <div 
      className="flex items-center justify-between cursor-pointer hover:bg-zinc-800/50 rounded-lg p-2 -mx-2 transition-colors"
      onClick={handleClick}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Avatar className="w-10 h-10 rounded-xl flex-shrink-0">
          {avatarUrl && <AvatarImage src={avatarUrl} className="object-cover rounded-xl" />}
          <AvatarFallback className="bg-zinc-700 rounded-xl">{user.name[0]}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-white font-medium flex items-center gap-1.5 truncate">
              <BadgedName
                badgeBalance={user.badgeBalance}
                badgeLock={user.badgeLock}
                username={user.badgeUsername}
                className="truncate"
              >
                {user.name}
              </BadgedName>
              {user.verified && <VerifiedBadge className="w-3.5 h-3.5 flex-shrink-0" />}
            </p>
            <span className="text-zinc-500 font-normal text-sm truncate">
              {user.handle.replace('@', '').startsWith('0x') && user.handle.length > 14
                ? `@${user.handle.replace('@', '').slice(0, 6)}...${user.handle.replace('@', '').slice(-4)}`
                : user.handle}
            </span>
          </div>
          {user.bio && (
            <p className="text-zinc-400 text-xs line-clamp-1 mt-0.5 hidden md:block">{user.bio}</p>
          )}
        </div>
      </div>
      {walletAddress?.toLowerCase() !== user.id?.toLowerCase() && (
        <button
          onClick={handleFollow}
          disabled={isFollowing || !walletAddress}
          className={`h-6 min-w-0 w-auto px-2.5 text-[11px] font-semibold rounded-lg flex items-center justify-center transition-all duration-150 flex-shrink-0 ml-2 ${
            isFollowing
              ? 'bg-white/10 text-white/40 cursor-default'
              : 'bg-gradient-to-br from-white/15 via-white/8 to-white/4 backdrop-blur-xl border border-white/20 text-white/70 hover:from-white/25 hover:via-white/15 hover:to-white/10 hover:border-white/40 hover:text-white shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]'
          }`}
        >
          {isFollowing ? (
            'Following'
          ) : (
            user.followsYou ? t('explorePage.followBack', 'Follow Back') : t('explorePage.follow')
          )}
        </button>
      )}
    </div>
  );
};

/**
 * Search input isolated from the page: it owns the text locally so each
 * keystroke re-renders only this tiny component, and pushes the value up
 * inside startTransition — the full-page derived re-render becomes
 * interruptible instead of blocking typing on mid-range devices.
 */
const ExploreSearchInput = memo(function ExploreSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  const [local, setLocal] = useState(value);
  const lastPushedRef = useRef(value);

  // Adopt external changes (URL ?q= init, programmatic clears) without
  // fighting our own in-flight transition pushes.
  useEffect(() => {
    if (value !== lastPushedRef.current) {
      setLocal(value);
      lastPushedRef.current = value;
    }
  }, [value]);

  const push = (next: string) => {
    setLocal(next);
    lastPushedRef.current = next;
    startTransition(() => onChange(next));
  };

  return (
    <div className="relative flex-1">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
      <Input
        value={local}
        onChange={(e) => push(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full pl-12 pr-4 h-[48px] bg-zinc-800 border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:border-zinc-600 text-sm sm:text-base"
      />
      {local && (
        <button
          onClick={() => push('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
});

export default function ExplorePage() {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const isLightTheme = theme === 'light';
  const [searchParams, setSearchParams] = useSearchParams();
  const { walletAddress, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [activeTab, setActiveTab] = useState('all');
  const [enableExploreTransition, setEnableExploreTransition] = useState(false);
  const exploreIsDraggingRef = useRef(false);
  const { layerRef: exploreTabLayerRef, setRef: setExploreTabRef, rect: exploreTabRect } = useTabIndicator(activeTab, undefined, exploreIsDraggingRef);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [exploreCategoryId, setExploreCategoryId] = useState<string | null>(null);
  const [filters, setFilters] = useState<SearchFilterState>(DEFAULT_SEARCH_FILTERS);

  // Fetch categories for the carousel
  const { data: exploreCategories = [] } = useQuery({
    queryKey: ['dehub-categories'],
    queryFn: getCategories,
    staleTime: 5 * 60 * 1000,
  });

  // Category browse feed (when a category is selected, not searching)
  const categoryBrowseFeed = useInfiniteQuery({
    queryKey: ['explore-category-feed', exploreCategoryId],
    queryFn: async ({ pageParam = 0 }) => {
      const result = await searchNFTs({
        page: pageParam,
        unit: 15,
        category: exploreCategoryId || undefined,
        sortMode: 'new',
        status: 'minted',
      });
      return {
        items: result.data || [],
        page: pageParam,
        hasMore: result.has_more,
      };
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialPageParam: 0,
    enabled: !!exploreCategoryId && !searchQuery.trim(),
    staleTime: 1000 * 60 * 2,
  });

  const categoryFeedItems = useMemo(() => {
    if (!categoryBrowseFeed.data?.pages) return [];
    const allNfts = categoryBrowseFeed.data.pages.flatMap(p => p.items || []);
    return allNfts.map((nft, index) => {
      const contentType = getContentType(nft);
      if (contentType === 'video' || contentType === 'audio') {
        return { type: 'video' as const, item: mapNFTToVideoItem(nft, index) };
      } else {
        return { type: 'image' as const, item: mapNFTToImagePost(nft, index) };
      }
    });
  }, [categoryBrowseFeed.data]);

  // Infinite scroll for category browse
  const categoryLoaderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exploreCategoryId || searchQuery.trim()) return;
    const el = categoryLoaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && categoryBrowseFeed.hasNextPage && !categoryBrowseFeed.isFetchingNextPage) {
          categoryBrowseFeed.fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [exploreCategoryId, searchQuery, categoryBrowseFeed.hasNextPage, categoryBrowseFeed.isFetchingNextPage, categoryBrowseFeed.fetchNextPage]);

  // Search history hook
  const { recentSearches, addToHistory, removeFromHistory, clearHistory } = useSearchHistory();
  
  // Search analytics mutation
  const { mutate: logSearch } = useSearchAnalytics();

  // Scroll to top on mount unless there's an active search with cached scroll
  // CRITICAL: Use useLayoutEffect to reset scroll BEFORE browser paints (prevents flash of wrong position)
  useLayoutEffect(() => {
    // A section hash (`#new-members`) names its own scroll target; the effect
    // further down settles on it once the section exists, so neither restoring
    // nor resetting the position applies here.
    if (location.hash) return;
    const urlQuery = searchParams.get('q') || '';
    const cachedScroll = sessionStorage.getItem('EXPLORE_SCROLL_POSITION');
    
    // Helper to reset all scroll contexts
    const scrollTo = (value: number) => {
      window.scrollTo(0, value);
      document.documentElement.scrollTop = value;
      document.body.scrollTop = value;
    };
    
    if (urlQuery && cachedScroll) {
      // Restore scroll only if there's an active search query
      const scrollY = parseInt(cachedScroll, 10);
      scrollTo(scrollY);
      // Extra attempt after paint for lazy content
      requestAnimationFrame(() => scrollTo(scrollY));
    } else {
      // Always start at top when no search query
      scrollTo(0);
      sessionStorage.removeItem('EXPLORE_SCROLL_POSITION');
      // Extra attempts to fight browser restoration
      requestAnimationFrame(() => scrollTo(0));
      setTimeout(() => scrollTo(0), 0);
    }
  }, []); // Only run on mount

  // Sync search query FROM URL only on mount / back-navigation
  // (not on every searchParams change, which causes circular updates)
  const initializedFromUrl = useRef(false);
  useEffect(() => {
    if (!initializedFromUrl.current) {
      initializedFromUrl.current = true;
      return; // Already set in useState initializer
    }
    // Skip if we triggered this URL change ourselves
    if (weSetParams.current) {
      weSetParams.current = false;
      return;
    }
    // Handle browser back/forward navigation
    const urlQuery = searchParams.get('q') || '';
    if (urlQuery !== searchQuery) {
      setSearchQuery(urlQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Update URL when search query changes (one-way: state → URL)
  const prevUrlQuery = useRef(searchParams.get('q') || '');
  const weSetParams = useRef(false);
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length >= 3) {
      if (prevUrlQuery.current !== trimmed) {
        prevUrlQuery.current = trimmed;
        weSetParams.current = true;
        setSearchParams({ q: trimmed }, { replace: true });
      }
    } else if (prevUrlQuery.current) {
      prevUrlQuery.current = '';
      weSetParams.current = true;
      setSearchParams({}, { replace: true });
    }
  }, [searchQuery, setSearchParams]);

  // Add to history and log analytics only after 1.5 seconds of inactivity (complete words)
  const stableQuery = useDebouncedValue(searchQuery, 1500);
  const hasLoggedRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (stableQuery.trim().length >= 3 && hasLoggedRef.current !== stableQuery.trim()) {
      hasLoggedRef.current = stableQuery.trim();
      // Add to local history
      addToHistory(stableQuery.trim());
      // Log analytics (fire and forget)
      logSearch({ 
        query: stableQuery.trim(), 
        type: getTypeForTab(activeTab) || 'all',
      });
    }
  }, [stableQuery, activeTab, addToHistory, logSearch]);

  // Debounced query for short searches (1 second wait for 1-2 chars)
  const debouncedShortQuery = useDebouncedValue(searchQuery, 1000);
  // Debounced query for full searches (300ms) — single source of truth for all hooks
  const debouncedFullQuery = useDebouncedValue(searchQuery, 300);
  
  // Determine search mode based on query length
  const trimmedQuery = searchQuery.trim();
  const isCashtagQuery = trimmedQuery.startsWith('$');
  const minSearchLength = isCashtagQuery ? 2 : 3;
  const isShortSearch = !isCashtagQuery && trimmedQuery.length >= 1 && trimmedQuery.length <= 2 && debouncedShortQuery.trim().length >= 1;
  const isFullSearch = trimmedQuery.length >= minSearchLength;
  const isSearching = isFullSearch || isShortSearch;
  
  // For short queries (1-2 chars), only search people
  const effectiveSearchType = isShortSearch ? 'accounts' : getTypeForTab(activeTab);
  // CRITICAL: Use debounced values for ALL hooks to prevent race conditions
  // Previously, raw searchQuery was passed to some hooks while useDeHubSearch debounced internally,
  // causing results from different hooks to be out of sync (flashing between old/new results)
  const baseEffectiveQuery = isShortSearch ? debouncedShortQuery : debouncedFullQuery;

  // Resolve contract addresses (0x...) to ticker symbols via DexScreener
  const { resolvedTicker, isResolving: isResolvingContract } = useContractToTicker(baseEffectiveQuery);
  
  // If a contract address resolved to a ticker, use that instead
  const effectiveQuery = resolvedTicker || baseEffectiveQuery;

  // Save scroll position only when there's an active search
  useEffect(() => {
    if (!isSearching) {
      sessionStorage.removeItem('EXPLORE_SCROLL_POSITION');
      return;
    }

    // Both halves of this used to be no-ops, which is why returning to a
    // search always landed at the top however far you had scrolled.
    // `window.scrollY` is permanently 0 here — body is the scrolling element —
    // so the position written was always "0"; and a scroll on body does not
    // bubble, so the window listener that wrote it never ran either. The
    // capture listener on document sees the event whatever element scrolled.
    const handleScroll = () => {
      sessionStorage.setItem('EXPLORE_SCROLL_POSITION', String(getDocumentScrollTop()));
    };

    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => document.removeEventListener('scroll', handleScroll, { capture: true });
  }, [isSearching]);

  // `/app/explore#new-members` is where the Live Stats heading sends people.
  // The browser's own anchor jump never happens here: this page is a cached
  // instance that does not remount on a client-side navigation, and the bento
  // only exists once the roster has loaded, so the id is not in the document
  // when the URL changes. Poll briefly for it, then settle it just under the
  // sticky search bento; when nobody joined recently it never renders and this
  // gives up quietly. Keyed on the navigation entry so clearing a search later
  // does not jump back to it — one navigation, one scroll.
  const settledHashKey = useRef<string | null>(null);
  useEffect(() => {
    if (location.hash !== '#new-members' || !/^\/(app\/)?explore\/?$/.test(location.pathname)) return;
    if (isSearching || settledHashKey.current === location.key) return;
    settledHashKey.current = location.key;
    let attempts = 0;
    let timer: number | undefined;
    const settle = () => {
      const el = document.getElementById('new-members');
      if (!el) {
        if (attempts++ < 20) timer = window.setTimeout(settle, 150);
        return;
      }
      const nav = document.querySelector<HTMLElement>('[data-explore-page] [data-feed-nav-outer]');
      const stuckTop = nav ? parseFloat(getComputedStyle(nav).top) || 0 : 0;
      el.style.scrollMarginTop = `${nav ? stuckTop + nav.offsetHeight + 8 : 0}px`;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    settle();
    return () => window.clearTimeout(timer);
  }, [location.hash, location.key, location.pathname, isSearching]);

  // API search hook - using new universal search
  const {
    data: searchData,
    isLoading: isSearchLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    error: searchError,
  } = useDeHubSearch({
    query: effectiveQuery,
    type: effectiveSearchType,
    postType: isShortSearch ? undefined : getPostTypeForTab(activeTab),
    address: walletAddress || undefined,
    enabled: isSearching,
    minQueryLength: isShortSearch ? 1 : 3,
  });

  // Additional account search specifically for "All" tab
  // The main search above only returns content when type is undefined (All tab)
  // This parallel search fetches accounts to merge into results
  const {
    data: allTabAccountData,
  } = useDeHubSearch({
    query: effectiveQuery,
    type: 'accounts',
    address: walletAddress || undefined,
    enabled: isSearching && activeTab === 'all' && !isShortSearch,
    minQueryLength: 3,
  });

  // Exact username lookup - always try exact match to prioritize @username
  const {
    data: exactUser,
    isLoading: isUserLoading,
    isUsernameQuery,
  } = useDeHubUserSearch({
    query: effectiveQuery,
    enabled: isSearching && (activeTab === 'all' || activeTab === 'people'),
    forceExactLookup: true, // Always try exact lookup to surface @username matches first
  });

  // Check if this is a brand-related search term
  const isBrandQuery = BRAND_QUERIES.includes(effectiveQuery.trim().toLowerCase());

  // DexScreener cashtag price lookup
  const { data: dexPairs = [], isLoading: isDexLoading } = useDexScreenerSearchMulti(effectiveQuery, isSearching);
  
  // CoinMarketCap market cap (overrides DexScreener when available)
  const { data: cmcData } = useCmcMarketCap(effectiveQuery, isSearching);

  // Stock quote lookup (stocks first priority)
  const { data: stockData, isLoading: isStockLoading } = useStockQuote(effectiveQuery, isSearching);

  // Always fetch @d specifically for brand queries (d, de, deh, dehu, dehub)
  const {
    data: brandUser,
  } = useDeHubUserSearch({
    query: 'd', // Always look up the actual @d account
    enabled: isSearching && isBrandQuery && (activeTab === 'all' || activeTab === 'people'),
    forceExactLookup: true,
  });

  // Process search results from the new universal search API
  const searchResults = useMemo(() => {
    // Get accounts directly from universal search (People tab or when type=accounts)
    const accounts = flattenSearchAccounts(searchData) || [];
    
    // Get accounts from the dedicated All-tab account search
    const allTabAccounts = flattenSearchAccounts(allTabAccountData) || [];
    
    // For short search, don't include video results
    const videos = isShortSearch ? [] : (flattenSearchVideos(searchData) || []);
    
    // Map both account sources to SearchCreator format
    const accountCreators = accounts.map(mapAccountToCreator);
    const allTabAccountCreators = allTabAccounts.map(mapAccountToCreator);
    
    // Also extract creators from video results for backwards compatibility (not for short search)
    const videoCreators = isShortSearch ? [] : extractUniqueCreators(videos) || [];
    
    // Combine and dedupe users by ID AND handle (same user may have different IDs from different sources)
    const userMap = new Map<string, SearchCreator>();
    const seenHandles = new Set<string>();
    
    const addUser = (u: SearchCreator) => {
      if (!u || !u.id) return;
      const handleLower = u.handle.toLowerCase();
      // Skip if we already have this user by ID or handle
      if (userMap.has(u.id) || seenHandles.has(handleLower)) return;
      userMap.set(u.id, u);
      seenHandles.add(handleLower);
    };
    
    accountCreators.forEach(addUser);
    allTabAccountCreators.forEach(addUser);
    videoCreators.forEach(addUser);
    
    // Add exact user match if found
    if (exactUser) {
      addUser(exactUser);
    }
    
    // Check if this is a brand-related search
    const queryLower = effectiveQuery.trim().toLowerCase();
    const isBrandQueryLocal = BRAND_QUERIES.includes(queryLower);
    
    // For brand queries, ensure the real @d (from brandUser lookup) is in the map
    if (isBrandQueryLocal && brandUser && brandUser.id) {
      const handleLower = brandUser.handle.toLowerCase();
      // Remove any existing entry with the same handle but different ID
      if (seenHandles.has(handleLower) && !userMap.has(brandUser.id)) {
        for (const [id, u] of userMap) {
          if (u.handle.toLowerCase() === handleLower) {
            userMap.delete(id);
            break;
          }
        }
      }
      userMap.set(brandUser.id, brandUser);
      seenHandles.add(handleLower);
    }
    
    // Convert to array and sort
    let peopleResults = Array.from(userMap.values());
    
    // For brand queries, pin @d at the top
    if (isBrandQueryLocal && brandUser && brandUser.id) {
      peopleResults = peopleResults.filter(u => u.id !== brandUser.id);
      peopleResults = [brandUser, ...peopleResults];
    } else {
      // Normal sorting: exact username match first
      peopleResults.sort((a, b) => {
        const aHandle = a.handle.replace('@', '').toLowerCase();
        const bHandle = b.handle.replace('@', '').toLowerCase();
        // Exact match goes first
        if (aHandle === queryLower && bHandle !== queryLower) return -1;
        if (bHandle === queryLower && aHandle !== queryLower) return 1;
        // Then by handle starting with query
        if (aHandle.startsWith(queryLower) && !bHandle.startsWith(queryLower)) return -1;
        if (bHandle.startsWith(queryLower) && !aHandle.startsWith(queryLower)) return 1;
        return 0;
      });
    }
    
    // Narrow and order the posts with the same helpers the feeds use, so a
    // filter row means the same thing here as it does on Home.
    let filteredPosts = videos.filter(p => p && (p.id || p.tokenId));

    if (filters.category) {
      const wanted = filters.category.toLowerCase();
      filteredPosts = filteredPosts.filter(nft => {
        const cat = nft.category;
        if (!cat) return false;
        const list = Array.isArray(cat) ? cat : [cat];
        return list.some(c => String(c).toLowerCase() === wanted);
      });
    }

    filteredPosts = filterByContentType(filteredPosts, {
      ppv: filters.ppv,
      w2e: filters.w2e,
      locked: filters.locked,
    });
    filteredPosts = filterByDate(filteredPosts, filters.date);

    // Search comes back in relevance order; the page reads chronologically
    // unless someone picks another sort.
    filteredPosts = applySorting(filteredPosts, filters.sort);

    return {
      users: peopleResults.filter(u => u && u.id),
      posts: filteredPosts,
      total: searchData?.pages?.[0]?.total || 0,
    };
  }, [searchData, allTabAccountData, exactUser, brandUser, isShortSearch, effectiveQuery, filters]);

  const activeFilterCount = countActiveSearchFilters(filters);

  const resetFilters = () => setFilters(DEFAULT_SEARCH_FILTERS);

  // Infinite scroll ref
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  // Infinite scroll observer
  useEffect(() => {
    if (!isSearching || activeTab === 'people') return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasNextPage && !isFetchingRef.current) {
          isFetchingRef.current = true;
          fetchNextPage().finally(() => {
            isFetchingRef.current = false;
          });
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, [isSearching, activeTab, hasNextPage, fetchNextPage]);

  // Map NFTs to feed items
  const mappedFeedItems = useMemo(() => {
    return searchResults.posts.map((nft, index) => {
      const contentType = getContentType(nft);
      if (contentType === 'video' || contentType === 'audio') {
        return { type: 'video' as const, item: mapNFTToVideoItem(nft, index) };
      } else {
        return { type: 'image' as const, item: mapNFTToImagePost(nft, index) };
      }
    });
  }, [searchResults.posts]);

  const showLoading = isSearchLoading || isUserLoading;
  const showResults = isSearching && !showLoading && (searchResults.users.length > 0 || searchResults.posts.length > 0);
  const showNoResults = isSearching && !showLoading && searchResults.users.length === 0 && searchResults.posts.length === 0;

  // Track ticker searches when cashtag results appear
  const trackedTickerRef = useRef<string>('');
  useEffect(() => {
    const sym = effectiveQuery.trim();
    if (sym.startsWith('$') && sym.length >= 2 && (stockData?.found || dexPairs.length > 0)) {
      const clean = sym.replace(/^\$/, '').toUpperCase();
      if (clean !== trackedTickerRef.current) {
        trackedTickerRef.current = clean;
        recordTickerSearch(clean);
      }
    }
  }, [effectiveQuery, stockData, dexPairs]);

  // Swallow the results/discover feed at the sticky search bento's top edge
  // under the glass themes, exactly like the home feed cuts at its nav pill.
  const exploreContentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(exploreContentRef, '[data-feed-nav-outer] > [data-page-bento]');

  // Drag-to-swipe for explore tab indicator (after all hooks to avoid TDZ)
  const exploreTabPositions = useRef<Partial<Record<string, HTMLElement | null>>>({});

  const { isDragging: isExploreDragging, indicatorRef: exploreIndicatorRef, handleDragStart: handleExploreDragStart, handleDragMove: handleExploreDragMove, handleDragEnd: handleExploreDragEnd } = useDragTabIndicator({
    tabRect: exploreTabRect,
    tabLayerRef: exploreTabLayerRef,
    tabButtonPositions: exploreTabPositions,
    tabValues: EXPLORE_TABS.map(t => t.value),
    activeTab,
    onTabChange: setActiveTab,
    isDraggingRef: exploreIsDraggingRef,
    indicatorFixedHeightPx: 35,
  });

  return (
    <div className="min-h-screen" data-explore-page>
      <SEOHead title="Explore - Trending Creators, Posts & Topics" description="Discover trending posts, top creators and popular topics on DeHub — open source, user owned, censorship resistant social media." url="https://dehub.io/app/explore" jsonLd={{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Explore DeHub', url: 'https://dehub.io/app/explore', description: 'Discover trending content, creators and topics on DeHub.', isPartOf: { '@type': 'WebSite', name: 'DeHub', url: 'https://dehub.io' } }} />
      <h1 className="sr-only">Explore DeHub — Decentralised Social Media, Censorship Resistant & Freedom of Speech</h1>
      {/* Search Header - Bento Style.

          `data-nav-hide="pin"` keeps this one on screen when the rest of the
          mobile chrome slides away on a scroll-down: it is the search box, and
          scrolling a few results down is exactly when someone reaches back for
          it to change the query. It still moves — up by the header's height,
          so it lands flush at the top rather than hanging in the gap the
          header left. See the "Mobile chrome" block in index.css. */}
      <div data-feed-nav-outer data-nav-hide="pin" className="sticky top-11 lg:top-0 bg-black z-50 px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2 space-y-2 sm:space-y-3">
        {/* Search Input Bento */}
        <div data-page-bento className="bg-zinc-900 rounded-2xl p-3 sm:p-4">
          <div className="relative flex gap-2">
            <ExploreSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('explorePage.searchPlaceholder')}
            />
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'relative flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-colors',
                showFilters || activeFilterCount > 0
                  ? 'text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              )}
            >
              {(showFilters || activeFilterCount > 0) && (
                <div className={cn(
                  "absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30",
                  isLightTheme
                    ? "shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-1px_0_rgba(255,255,255,0.05)]"
                    : "shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]"
                )} />
              )}
              <SlidersHorizontal className="relative z-10 w-5 h-5" />
              {activeFilterCount > 0 && (
                <span className="relative z-10 text-sm font-medium">{activeFilterCount}</span>
              )}
            </button>
          </div>
          
          {/* Filter panel — the sliders button's payload. Collapsed by
              default; it lives inside the sticky bento so the rows stay
              reachable while the results scroll underneath. */}
          <AnimatePresence initial={false}>
            {showFilters && (
              <motion.div
                key="search-filters"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <SearchFilterPanel
                  filters={filters}
                  onChange={setFilters}
                  onReset={resetFilters}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tabs - toggle bar (flush with search bar above; no horizontal
              overhang so active indicator's drop shadow isn't clipped) */}
          <div className="mt-3">
            <div className="rounded-xl" style={{ overflow: 'visible' }}>
              <div ref={exploreTabLayerRef} className="relative overflow-visible">
                <GlassIndicator ref={exploreIndicatorRef} rect={exploreTabRect} borderRadius="0.75rem" layoutKey={`explore-nav-${activeTab}`} enableTransition={!isExploreDragging && enableExploreTransition} fixedHeightPx={35} />
                {exploreTabRect.ready && (
                  <div
                    className="absolute z-30 cursor-grab active:cursor-grabbing"
                    style={{
                      transform: `translate(${exploreTabRect.x}px, ${exploreTabRect.y}px)`,
                      width: exploreTabRect.width,
                      height: exploreTabRect.height,
                    }}
                    onPointerDown={handleExploreDragStart}
                    onPointerMove={handleExploreDragMove}
                    onPointerUp={handleExploreDragEnd}
                    onPointerCancel={handleExploreDragEnd}
                  />
                )}
                <div className="relative z-20 flex w-full">
                  {EXPLORE_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      ref={(el) => {
                        setExploreTabRef(tab.value)(el);
                        exploreTabPositions.current[tab.value] = el;
                      }}
                      onClick={() => {
                        if (tab.value !== activeTab) {
                          setEnableExploreTransition(true);
                          setTimeout(() => setEnableExploreTransition(false), 450);
                        }
                        setActiveTab(tab.value);
                      }}
                      className={cn(
                        'relative z-40 flex-1 flex items-center justify-center px-2 py-2.5 rounded-xl transition-colors',
                        activeTab === tab.value
                          ? 'text-white'
                          : 'text-zinc-400 hover:text-white'
                      )}
                    >
                      <span className="relative z-10">
                        <tab.icon className="w-4 h-4" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div ref={exploreContentRef} className="px-2 sm:px-3 pb-2 sm:pb-3 pt-2 space-y-2">
        <AnimatePresence mode="wait">
          {isSearching ? (
            <motion.div
              key="search-results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              {/* Search Results Header */}
              <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white break-all">
                      {t('explorePage.resultsFor', { query: searchQuery })}
                    </h2>
                    {!showLoading && searchResults.total > 0 && (
                      <p className="text-zinc-500 text-sm mt-1">
                        {t('explorePage.resultsFound', { count: String(searchResults.total.toLocaleString()) } as Record<string, string>)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-zinc-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Contract address resolving indicator */}
                {isResolvingContract && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-zinc-900/80 border border-zinc-800/50 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Resolving contract address…</span>
                  </div>
                )}

                {/* Resolved ticker badge */}
                {resolvedTicker && !isResolvingContract && /^0x[a-f0-9]{40}$/i.test(baseEffectiveQuery.trim()) && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800/60 border border-zinc-700/40 text-xs text-muted-foreground mb-1">
                    <span className="truncate max-w-[120px] font-mono">{baseEffectiveQuery.trim().slice(0, 6)}…{baseEffectiveQuery.trim().slice(-4)}</span>
                    <span>→</span>
                    <span className="font-semibold text-foreground">{resolvedTicker}</span>
                  </div>
                )}

                {/* Stock / Crypto Cashtag Result Switcher */}
                {(stockData?.found || dexPairs.length > 0) && (
                  <CashtagResultSwitcher
                    stockData={stockData ?? null}
                    dexPairs={dexPairs}
                    cmcData={cmcData}
                    symbol={effectiveQuery.trim()}
                  />
                )}

                {/* Loading State */}
                {showLoading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-3 text-zinc-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{t('explorePage.searching')}</span>
                    </div>
                  </div>
                )}

                {/* Error State */}
                {searchError && (
                  <div className="text-center py-8">
                    <p className="text-red-400">{t('explorePage.searchError')}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 border-zinc-700 text-white hover:bg-zinc-800"
                      onClick={() => window.location.reload()}
                    >
                      {t('explorePage.retry')}
                    </Button>
                  </div>
                )}

                {/* People Results */}
                {showResults && (activeTab === 'all' || activeTab === 'people') && searchResults.users.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
                      {t('explorePage.people')} ({searchResults.users.length})
                    </h3>
                    <div className="space-y-1">
                      {searchResults.users.slice(0, activeTab === 'people' ? undefined : 5).map((user, idx) => (
                        <UserResultCard 
                          key={user.id || `user-${idx}`} 
                          user={user} 
                          onProfileClick={(handle) => addToHistory(`@${handle}`, 'user')}
                        />
                      ))}
                    </div>
                    {activeTab === 'all' && searchResults.users.length > 5 && (
                      <button
                        onClick={() => setActiveTab('people')}
                        className="text-white text-sm mt-3 hover:underline"
                      >
                        {t('explorePage.viewAllPeople', { count: searchResults.users.length })}
                      </button>
                    )}
                  </div>
                )}

                {/* Content Results - Using Feed Cards */}
                {showResults && activeTab !== 'people' && mappedFeedItems.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
                      {activeTab === 'all' ? t('explorePage.content') : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} ({mappedFeedItems.length}{hasNextPage ? '+' : ''})
                    </h3>
                    
                    {/* Feed Cards */}
                    <div className="space-y-4">
                      {mappedFeedItems.map((feedItem, index) => {
                        // Off-screen results skip layout/paint until scrolled
                        // near (same technique as the home feed).
                        const cvStyle = index < 3 ? undefined : OFFSCREEN_RESULT_STYLE;
                        if (feedItem.type === 'video') {
                          const video = feedItem.item as VideoItem;
                          return (
                            <div key={video.id} style={cvStyle}>
                              <VideoCard video={video} />
                            </div>
                          );
                        } else {
                          const image = feedItem.item as ImagePost;
                          return (
                            <div key={image.id} style={cvStyle}>
                              <ImageCard post={image} />
                            </div>
                          );
                        }
                      })}
                    </div>

                    {/* Infinite scroll trigger */}
                    <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
                      {isFetchingNextPage && (
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">{t('explorePage.loadingMore')}</span>
                        </div>
                      )}
                      {!hasNextPage && mappedFeedItems.length > 0 && (
                        <p className="text-zinc-500 text-sm">{t('explorePage.noMoreResults')}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* No Results */}
                {showNoResults && (
                  <div className="text-center py-8">
                    <p className="text-zinc-400">{t('explorePage.noResultsFor', { query: searchQuery })}</p>
                    <p className="text-zinc-500 text-sm mt-1">{t('explorePage.tryDifferent')}</p>
                    {isUsernameQuery && (
                      <p className="text-zinc-500 text-sm mt-2">
                        {t('explorePage.tipRemoveAt')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="default-content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              {/* Category Carousel */}
              {exploreCategories.length > 0 && (
                <div data-page-bento className="bg-zinc-900 rounded-2xl p-3 sm:p-4">
                  <div data-fade-edges>
                  <SwipeableCarousel className="flex gap-2 overflow-x-auto scrollbar-hide">
                    <button
                      onClick={() => setExploreCategoryId(null)}
                      className={cn(
                        'flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
                        !exploreCategoryId
                          ? cn(
                              'text-white bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30',
                              isLightTheme
                                ? 'shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2)]'
                                : 'shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4)]'
                            )
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                      )}
                    >
                      All
                    </button>
                    {exploreCategories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setExploreCategoryId(cat.id);
                          scrollDocumentTo(0);
                        }}
                        className={cn(
                          'flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
                          exploreCategoryId === cat.id
                            ? cn(
                                'text-white bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30',
                                isLightTheme
                                  ? 'shadow-[0_2px_8px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2)]'
                                  : 'shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4)]'
                              )
                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                        )}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </SwipeableCarousel>
                  </div>
                </div>
              )}

              {/* Category Browse Feed */}
              {exploreCategoryId ? (
                <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
                  <h2 className="text-lg sm:text-xl font-bold text-white mb-4">
                    {exploreCategories.find(c => c.id === exploreCategoryId)?.name || exploreCategoryId}
                  </h2>
                  
                  {categoryBrowseFeed.isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="flex items-center gap-3 text-zinc-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>{t('explorePage.searching')}</span>
                      </div>
                    </div>
                  ) : categoryFeedItems.length === 0 ? (
                    <AppState
                      icon="search"
                      title="No content found in this category"
                      description="Try another category or check back later."
                      kind="search-empty"
                      size="section"
                    />
                  ) : (
                    <div className="space-y-4">
                      {categoryFeedItems.map((feedItem, index) => {
                        const cvStyle = index < 3 ? undefined : OFFSCREEN_RESULT_STYLE;
                        if (feedItem.type === 'video') {
                          const video = feedItem.item as VideoItem;
                          return <div key={video.id} style={cvStyle}><VideoCard video={video} /></div>;
                        } else {
                          const image = feedItem.item as ImagePost;
                          return <div key={image.id} style={cvStyle}><ImageCard post={image} /></div>;
                        }
                      })}
                      <div ref={categoryLoaderRef} className="h-10 flex items-center justify-center">
                        {categoryBrowseFeed.isFetchingNextPage && (
                          <div className="flex items-center gap-2 text-zinc-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">{t('explorePage.loadingMore')}</span>
                          </div>
                        )}
                        {!categoryBrowseFeed.hasNextPage && categoryFeedItems.length > 0 && (
                          <p className="text-zinc-500 text-sm">{t('explorePage.noMoreResults')}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Recent Searches Bento */}
                  <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                        <BrandIcon src={search3dIcon} alt="Search explore icon" className="w-8 h-8 sm:w-9 sm:h-9 object-contain" />
                        {t('explorePage.searchHistory')}
                      </h2>
                      {recentSearches.length > 0 && (
                        <button
                          onClick={clearHistory}
                          className="text-zinc-500 hover:text-white text-sm flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          {t('explorePage.clearHistory')}
                        </button>
                      )}
                    </div>
                    {recentSearches.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {recentSearches.map((term) => (
                          <div
                            key={term}
                            className="group flex items-center bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors max-w-full"
                          >
                            <button
                              onClick={() => setSearchQuery(term)}
                              className="px-3 sm:px-4 py-2 text-white text-sm text-left break-all"
                            >
                              {term}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromHistory(term);
                              }}
                              className="pr-3 pl-1 py-2 text-zinc-500 hover:text-white transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-zinc-500 text-sm">{t('explorePage.noRecentSearches')}</p>
                    )}
                  </div>

                  {/* Trending Bento — same component as sidebar */}
                  <WhatsHappening showCountrySelector />

                  {/* New members, last on the page: it is the one bento here
                      whose contents change by the day, so it is worth scrolling
                      to and worth coming back for. Renders nothing when nobody
                      joined recently. */}
                  <NewMembersBento />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

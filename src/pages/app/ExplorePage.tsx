import { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useTabIndicator } from '@/hooks/use-tab-indicator';
import { GlassIndicator } from '@/components/app/feeds/GlassIndicator';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTranslation } from 'react-i18next';
import searchIcon from '@/assets/icons/search-icon.png';
import search3dIcon from '@/assets/icons/search-3d-icon.png';
import trendingFireIcon from '@/assets/icons/trending-fire-icon.png';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, X, ChevronDown, Loader2, Check, Clock, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { EXPLORE_TABS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
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
import { buildAvatarUrl } from '@/lib/media-url';
import { getMediaUrl, type DeHubNFT } from '@/lib/api/dehub';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { VideoCard, ImageCard, PostCard } from '@/components/app/cards';
import { mapNFTToVideoItem, mapNFTToImagePost, getContentType } from '@/hooks/use-dehub-feed';
import type { VideoItem, ImagePost } from '@/types/feed.types';

const DATE_OPTION_KEYS = ['anyTime', 'today', 'thisWeek', 'thisMonth', 'thisYear'] as const;
const DATE_OPTIONS_RAW = ['Any time', 'Today', 'This week', 'This month', 'This year'];
const ENGAGEMENT_OPTIONS = ['Any', '100+', '1K+', '10K+', '100K+', '1M+'];
const SEARCH_CATEGORY_KEYS = ['all', 'gaming', 'music', 'art', 'programming', 'crypto', 'entertainment'] as const;
const SEARCH_CATEGORIES_RAW = ['All', 'Gaming', 'Music', 'Art', 'Programming', 'Crypto', 'Entertainment'];
const COUNTRY_OPTIONS = [
  'Global',
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cambodia', 'Cameroon', 'Canada', 'Cape Verde', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
  'Democratic Republic of the Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'East Timor', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast',
  'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan',
  'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman',
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
  'Qatar',
  'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam',
  'Yemen',
  'Zambia', 'Zimbabwe',
];

// Brand-related search terms where @d should be pinned first
const BRAND_QUERIES = ['d', 'de', 'deh', 'dehu', 'dehub'];

type FilterState = {
  w2e: boolean;
  ppv: boolean;
  gated: boolean;
  date: string;
  likes: string;
  shares: string;
  comments: string;
};

const FilterPill = ({ 
  label, 
  active, 
  onClick,
}: { 
  label: string; 
  active: boolean; 
  onClick: () => void;
  layoutId?: string;
}) => (
  <button
    onClick={onClick}
    className={cn(
      'relative px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
      active
        ? 'text-white'
        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
    )}
  >
    {active ? (
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]" />
    ) : null}
    <span className="relative z-10">{label}</span>
  </button>
);

const FilterDropdown = ({
  label,
  value,
  options,
  onChange,
  displayValue,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  displayValue?: string;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
          value !== options[0]
            ? 'bg-white text-black'
            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
        )}
      >
        <span>{label}: {displayValue || value}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent glass className="max-h-[70vh]">
          <DrawerHeader className="border-b border-white/10">
            <DrawerTitle className="text-white">{t('explorePage.selectLabel', { label })}</DrawerTitle>
          </DrawerHeader>
          
          {/* Search input */}
          <div className="p-4 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder={t('explorePage.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          
          {/* Options list */}
          <div className="flex-1 overflow-y-auto max-h-[50vh] pb-safe">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                    setSearchQuery('');
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
                >
                  <span className={cn(
                    'text-sm',
                    value === option ? 'text-white font-medium' : 'text-zinc-400'
                  )}>
                    {option}
                  </span>
                  {value === option && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-zinc-500">{t('explorePage.noFilterResults')}</div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};

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
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // user.avatar is already a fully built URL from mapAccountToCreator/extractUniqueCreators
  const avatarUrl = user.avatar;
  
  const handleClick = () => {
    const cleanHandle = user.handle.replace('@', '');
    onProfileClick?.(cleanHandle);
    navigate(`/${cleanHandle}`);
  };

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!walletAddress) {
      // Could show login modal here
      return;
    }

    if (!user.id || isLoading) return;

    setIsLoading(true);
    try {
      const { followUser } = await import('@/lib/api/dehub');
      await followUser(user.id);
      setIsFollowing(true);
    } catch (error) {
      console.error('Failed to follow:', error);
    } finally {
      setIsLoading(false);
    }
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
              <span className="truncate">{user.name}</span>
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
      {!isFollowing && (
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl border-zinc-700 text-white hover:bg-zinc-800 bg-transparent flex-shrink-0 ml-2"
          onClick={handleFollow}
          disabled={isLoading || !walletAddress}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('explorePage.follow')}
        </Button>
      )}
    </div>
  );
};

export default function ExplorePage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { walletAddress, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('all');
  const { layerRef: exploreTabLayerRef, setRef: setExploreTabRef, rect: exploreTabRect } = useTabIndicator(activeTab);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [filters, setFilters] = useState<FilterState>({
    w2e: false,
    ppv: false,
    gated: false,
    date: 'Any time',
    likes: 'Any',
    shares: 'Any',
    comments: 'Any',
  });
  const [selectedCountry, setSelectedCountry] = useState('Global');

  // Search history hook
  const { recentSearches, addToHistory, removeFromHistory, clearHistory } = useSearchHistory();
  
  // Search analytics mutation
  const { mutate: logSearch } = useSearchAnalytics();

  // Scroll to top on mount unless there's an active search with cached scroll
  // CRITICAL: Use useLayoutEffect to reset scroll BEFORE browser paints (prevents flash of wrong position)
  useLayoutEffect(() => {
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

  // Sync search query with URL
  useEffect(() => {
    const urlQuery = searchParams.get('q') || '';
    if (urlQuery && urlQuery !== searchQuery) {
      setSearchQuery(urlQuery);
    }
  }, [searchParams]);

  // Update URL when search query changes and log to history
  useEffect(() => {
    if (searchQuery.trim().length >= 3) {
      setSearchParams({ q: searchQuery.trim() }, { replace: true });
    } else if (searchParams.has('q')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchQuery, setSearchParams, searchParams]);

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
  
  // Determine search mode based on query length
  const trimmedQuery = searchQuery.trim();
  const isShortSearch = trimmedQuery.length >= 1 && trimmedQuery.length <= 2 && debouncedShortQuery.trim().length >= 1;
  const isFullSearch = trimmedQuery.length >= 3;
  const isSearching = isFullSearch || isShortSearch;
  
  // For short queries (1-2 chars), only search people
  const effectiveSearchType = isShortSearch ? 'accounts' : getTypeForTab(activeTab);
  const effectiveQuery = isShortSearch ? debouncedShortQuery : searchQuery;

  // Save scroll position only when there's an active search
  useEffect(() => {
    if (!isSearching) {
      sessionStorage.removeItem('EXPLORE_SCROLL_POSITION');
      return;
    }

    const handleScroll = () => {
      sessionStorage.setItem('EXPLORE_SCROLL_POSITION', String(window.scrollY));
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isSearching]);

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
      // Override with brandUser data if present (force add even if duplicate)
      const handleLower = brandUser.handle.toLowerCase();
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
    
    // Apply content type filters on posts
    let filteredPosts = videos.filter(p => p && (p.id || p.tokenId));
    
    const hasContentFilter = filters.w2e || filters.ppv || filters.gated;
    if (hasContentFilter) {
      filteredPosts = filteredPosts.filter(nft => {
        if (filters.w2e && nft.is_w2e) return true;
        if (filters.ppv && nft.is_ppv) return true;
        if (filters.gated && nft.is_locked) return true;
        return false;
      });
    }

    // Apply date filter
    if (filters.date !== 'Any time') {
      const now = new Date();
      let cutoff: Date;
      switch (filters.date) {
        case 'Today': cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
        case 'This week': cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
        case 'This month': cutoff = new Date(now.getFullYear(), now.getMonth(), 1); break;
        case 'This year': cutoff = new Date(now.getFullYear(), 0, 1); break;
        default: cutoff = new Date(0);
      }
      filteredPosts = filteredPosts.filter(nft => {
        const created = nft.createdAt || nft.created_at;
        return created ? new Date(created) >= cutoff : true;
      });
    }

    return {
      users: peopleResults.filter(u => u && u.id),
      posts: filteredPosts,
      total: searchData?.pages?.[0]?.total || 0,
    };
  }, [searchData, allTabAccountData, exactUser, brandUser, isShortSearch, effectiveQuery, filters]);

  const activeFilterCount = [
    filters.w2e,
    filters.ppv,
    filters.gated,
    filters.date !== 'Any time',
    filters.likes !== 'Any',
    filters.shares !== 'Any',
    filters.comments !== 'Any',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setFilters({
      w2e: false,
      ppv: false,
      gated: false,
      date: 'Any time',
      likes: 'Any',
      shares: 'Any',
      comments: 'Any',
    });
    setSelectedCategory('All');
  };

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

  if (!isAuthenticated) {
    return (
      <AuthGate description={t('explorePage.loginDescription')} />
    );
  }

  return (
    <div className="min-h-screen">
      {/* Search Header - Bento Style */}
      <div className="sticky top-11 lg:top-0 bg-black z-50 p-2 sm:p-3 space-y-2 sm:space-y-3">
        {/* Search Input Bento */}
        <div className="bg-zinc-900 rounded-2xl p-3 sm:p-4">
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('explorePage.searchPlaceholder')}
                className="w-full pl-12 pr-4 h-[48px] bg-zinc-800 border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:border-zinc-600 text-sm sm:text-base"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
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
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]" />
              )}
              <SlidersHorizontal className="relative z-10 w-5 h-5" />
              {activeFilterCount > 0 && (
                <span className="relative z-10 text-sm font-medium">{activeFilterCount}</span>
              )}
            </button>
          </div>
          
        </div>

        {/* Filters Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative z-20"
            >
              <div className="bg-zinc-900 rounded-2xl p-4 space-y-4 pb-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold">{t('explorePage.filters')}</h3>
                  {(activeFilterCount > 0 || selectedCategory !== 'All') && (
                    <button
                      onClick={resetFilters}
                      className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                      {t('explorePage.clearAll')}
                    </button>
                  )}
                </div>

                {/* Category Filters */}
                {isSearching && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">{t('explorePage.category')}</p>
                    <div className="flex flex-wrap gap-2">
                      {SEARCH_CATEGORY_KEYS.map((catKey, idx) => (
                        <FilterPill
                          key={catKey}
                          label={t(`explorePage.${catKey}`)}
                          active={selectedCategory === SEARCH_CATEGORIES_RAW[idx]}
                          onClick={() => setSelectedCategory(SEARCH_CATEGORIES_RAW[idx])}
                          layoutId="explore-category"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Content Type Filters */}
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">{t('explorePage.contentType')}</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterPill
                      label={t('explorePage.bounty')}
                      active={filters.w2e}
                      onClick={() => setFilters(f => ({ ...f, w2e: !f.w2e }))}
                    />
                    <FilterPill
                      label={t('explorePage.ppv')}
                      active={filters.ppv}
                      onClick={() => setFilters(f => ({ ...f, ppv: !f.ppv }))}
                    />
                    <FilterPill
                      label={t('explorePage.gated')}
                      active={filters.gated}
                      onClick={() => setFilters(f => ({ ...f, gated: !f.gated }))}
                    />
                  </div>
                </div>

                {/* Date Filter */}
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">{t('explorePage.datePosted')}</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterDropdown
                      label={t('explorePage.date')}
                      value={filters.date}
                      options={DATE_OPTIONS_RAW}
                      onChange={(v) => setFilters(f => ({ ...f, date: v }))}
                      displayValue={t(`explorePage.${DATE_OPTION_KEYS[DATE_OPTIONS_RAW.indexOf(filters.date)]}`)}
                    />
                  </div>
                </div>

                {/* Engagement Filters */}
                <div className="space-y-2 relative z-30">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">{t('explorePage.engagement')}</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterDropdown
                      label={t('explorePage.likes')}
                      value={filters.likes}
                      options={ENGAGEMENT_OPTIONS}
                      onChange={(v) => setFilters(f => ({ ...f, likes: v }))}
                    />
                    <FilterDropdown
                      label={t('explorePage.shares')}
                      value={filters.shares}
                      options={ENGAGEMENT_OPTIONS}
                      onChange={(v) => setFilters(f => ({ ...f, shares: v }))}
                    />
                    <FilterDropdown
                      label={t('explorePage.comments')}
                      value={filters.comments}
                      options={ENGAGEMENT_OPTIONS}
                      onChange={(v) => setFilters(f => ({ ...f, comments: v }))}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs Bento */}
        <div className="bg-zinc-900 rounded-2xl p-2" style={{ overflowX: 'clip', overflowClipMargin: '8px' }}>
          <div ref={exploreTabLayerRef} className="relative overflow-visible">
            <GlassIndicator rect={exploreTabRect} />
            <div className="relative z-20 flex w-full">
              {EXPLORE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  ref={setExploreTabRef(tab.value)}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    'relative z-40 flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 rounded-xl transition-colors text-sm whitespace-nowrap',
                    activeTab === tab.value
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-white'
                  )}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {tab.value === 'all' ? (
                      <>
                        <span className="sm:hidden">All</span>
                        <tab.icon className="w-4 h-4 hidden sm:block" />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </>
                    ) : (
                      <>
                        <tab.icon className="w-4 h-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-2 sm:p-3 space-y-2 mt-[3px]">
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
              <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
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
                        className="text-primary text-sm mt-3 hover:underline"
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
                        if (feedItem.type === 'video') {
                          const video = feedItem.item as VideoItem;
                          return (
                            <VideoCard
                              key={video.id}
                              video={video}
                            />
                          );
                        } else {
                          const image = feedItem.item as ImagePost;
                          return (
                            <ImageCard
                              key={image.id}
                              post={image}
                            />
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
              {/* Recent Searches Bento */}
              <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                    <img src={search3dIcon} alt="Search" className="w-8 h-8 sm:w-9 sm:h-9 object-contain" />
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

              {/* Trending Bento */}
              <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mt-[6px]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <img src={trendingFireIcon} alt="" className="w-[35px] h-[35px] object-contain" />
                    <h2 className="text-lg sm:text-xl font-bold text-white">{t('explorePage.trending')}</h2>
                  </div>
                  <FilterDropdown
                    label={t('explorePage.country')}
                    value={selectedCountry}
                    options={COUNTRY_OPTIONS}
                    onChange={setSelectedCountry}
                  />
                </div>
                <p className="text-zinc-500 text-sm">{t('explorePage.nothingTrending')}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

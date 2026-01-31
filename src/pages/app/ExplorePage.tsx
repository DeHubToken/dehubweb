import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, X, ChevronDown, Loader2, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { EXPLORE_TABS, RECENT_SEARCHES, EXPLORE_TRENDING, SUGGESTED_USERS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useAuth } from '@/contexts/AuthContext';
import { 
  useDeHubSearch, 
  getTypeForTab,
  getPostTypeForTab, 
  extractUniqueCreators,
  mapAccountToCreator,
  flattenSearchAccounts,
  flattenSearchVideos,
  type SearchCreator 
} from '@/hooks/use-dehub-search';
import { useDeHubUserSearch } from '@/hooks/use-dehub-user-search';
import { buildAvatarUrl } from '@/lib/media-url';
import { getMediaUrl } from '@/lib/api/dehub';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';

const DATE_OPTIONS = ['Any time', 'Today', 'This week', 'This month', 'This year'];
const ENGAGEMENT_OPTIONS = ['Any', '100+', '1K+', '10K+', '100K+', '1M+'];
const SEARCH_CATEGORIES = ['All', 'Gaming', 'Music', 'Art', 'Programming', 'Crypto', 'Entertainment'];
const COUNTRY_OPTIONS = [
  'Global',
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Spain',
  'Italy',
  'Brazil',
  'Mexico',
  'Japan',
  'South Korea',
  'India',
  'Netherlands',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Poland',
  'Russia',
  'China',
  'Singapore',
  'Philippines',
  'Indonesia',
  'Thailand',
  'Vietnam',
  'South Africa',
  'Nigeria',
  'Egypt',
  'UAE',
  'Saudi Arabia',
  'Turkey',
  'Argentina',
  'Colombia',
  'Chile',
];

type FilterState = {
  w2e: boolean;
  ppv: boolean;
  date: string;
  likes: string;
  shares: string;
  comments: string;
};

const FilterPill = ({ 
  label, 
  active, 
  onClick 
}: { 
  label: string; 
  active: boolean; 
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
      active
        ? 'bg-white text-black'
        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
    )}
  >
    {label}
  </button>
);

const FilterDropdown = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) => {
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
        <span>{label}: {value}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent glass className="max-h-[70vh]">
          <DrawerHeader className="border-b border-white/10">
            <DrawerTitle className="text-white">Select {label}</DrawerTitle>
          </DrawerHeader>
          
          {/* Search input */}
          <div className="p-4 border-b border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search..."
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
              <div className="px-4 py-8 text-center text-sm text-zinc-500">No results found</div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};

// Search result card for content items
const SearchResultCard = ({ 
  item 
}: { 
  item: {
    id: string;
    title?: string;
    description?: string;
    thumbnail?: string;
    media_type?: string;
    minter?: string;
    mintername?: string;
    minterDisplayName?: string;
    minterAvatarUrl?: string;
    createdAt?: string;
    like_count?: number;
    comment_count?: number;
  }
}) => {
  const navigate = useNavigate();
  const thumbnailUrl = item.thumbnail ? getMediaUrl(item.thumbnail) : undefined;
  const avatarUrl = (item.minterAvatarUrl && item.minter) ? buildAvatarUrl(item.minter, item.minterAvatarUrl) : undefined;
  const displayName = item.minterDisplayName || item.mintername || 'User';
  const handle = item.mintername ? `@${item.mintername}` : item.minter?.slice(0, 8);
  const timeAgo = item.createdAt 
    ? new Date(item.createdAt).toLocaleDateString() 
    : '';

  return (
    <div 
      className="p-3 bg-zinc-800 rounded-xl cursor-pointer hover:bg-zinc-700/80 transition-colors"
      onClick={() => navigate(`/app/post/${item.id}`)}
    >
      <div className="flex gap-3">
        {thumbnailUrl && (
          <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-700">
            <img 
              src={thumbnailUrl} 
              alt="" 
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Avatar className="w-5 h-5">
              <AvatarImage src={avatarUrl} className="object-cover" />
              <AvatarFallback className="bg-zinc-600 text-[10px]">{displayName[0]}</AvatarFallback>
            </Avatar>
            <span className="text-white text-sm font-medium truncate">{displayName}</span>
            <span className="text-zinc-500 text-xs">{handle}</span>
            {timeAgo && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500 text-xs">{timeAgo}</span>
              </>
            )}
          </div>
          {item.title && (
            <p className="text-zinc-300 text-sm line-clamp-2">{item.title}</p>
          )}
          {item.description && !item.title && (
            <p className="text-zinc-400 text-sm line-clamp-2">{item.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
            {item.like_count !== undefined && (
              <span>{item.like_count.toLocaleString()} likes</span>
            )}
            {item.comment_count !== undefined && (
              <span>{item.comment_count.toLocaleString()} comments</span>
            )}
            {item.media_type && (
              <span className="px-1.5 py-0.5 bg-zinc-700 rounded text-[10px] uppercase">
                {item.media_type}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// User result card
const UserResultCard = ({ user }: { user: SearchCreator }) => {
  const navigate = useNavigate();
  
  return (
    <div 
      className="flex items-center justify-between cursor-pointer hover:bg-zinc-800/50 rounded-lg p-2 -mx-2 transition-colors"
      onClick={() => navigate(`/app/profile/${user.handle.replace('@', '')}`)}
    >
      <div className="flex items-center gap-3">
        <Avatar className="w-10 h-10">
          <AvatarImage src={user.avatar} className="object-cover" />
          <AvatarFallback className="bg-zinc-700">{user.name[0]}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-white font-medium flex items-center gap-1">
            {user.name}
            {user.verified && <VerifiedBadge className="w-3.5 h-3.5" />}
          </p>
          <p className="text-zinc-500 text-sm">{user.handle}</p>
          {user.bio && (
            <p className="text-zinc-400 text-xs line-clamp-1 mt-0.5">{user.bio}</p>
          )}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl border-zinc-700 text-white hover:bg-zinc-800 bg-transparent"
        onClick={(e) => {
          e.stopPropagation();
          // TODO: Implement follow functionality
        }}
      >
        Follow
      </Button>
    </div>
  );
};

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { walletAddress } = useAuth();
  
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [filters, setFilters] = useState<FilterState>({
    w2e: false,
    ppv: false,
    date: 'Any time',
    likes: 'Any',
    shares: 'Any',
    comments: 'Any',
  });
  const [selectedCountry, setSelectedCountry] = useState('Global');

  // Sync search query with URL
  useEffect(() => {
    const urlQuery = searchParams.get('q') || '';
    if (urlQuery && urlQuery !== searchQuery) {
      setSearchQuery(urlQuery);
    }
  }, [searchParams]);

  // Update URL when search query changes
  useEffect(() => {
    if (searchQuery.trim().length >= 3) {
      setSearchParams({ q: searchQuery.trim() }, { replace: true });
    } else if (searchParams.has('q')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchQuery, setSearchParams, searchParams]);

  const isSearching = searchQuery.trim().length >= 3;

  // API search hook - using new universal search
  const {
    data: searchData,
    isLoading: isSearchLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    error: searchError,
  } = useDeHubSearch({
    query: searchQuery,
    type: getTypeForTab(activeTab),
    postType: getPostTypeForTab(activeTab),
    address: walletAddress || undefined,
    enabled: isSearching,
  });

  // Exact username lookup for @username queries
  const {
    data: exactUser,
    isLoading: isUserLoading,
    isUsernameQuery,
  } = useDeHubUserSearch({
    query: searchQuery,
    enabled: isSearching && (activeTab === 'all' || activeTab === 'people'),
  });

  // Process search results from the new universal search API
  const searchResults = useMemo(() => {
    // Get accounts directly from universal search
    const accounts = flattenSearchAccounts(searchData) || [];
    const videos = flattenSearchVideos(searchData) || [];
    
    // Map accounts to our SearchCreator format
    const accountCreators = accounts.map(mapAccountToCreator);
    
    // Also extract creators from video results for backwards compatibility
    const videoCreators = extractUniqueCreators(videos) || [];
    
    // Combine and dedupe users: accounts first, then video creators
    const userMap = new Map<string, SearchCreator>();
    accountCreators.forEach(u => userMap.set(u.id, u));
    videoCreators.forEach(u => {
      if (!userMap.has(u.id)) userMap.set(u.id, u);
    });
    
    // Add exact user match to top if found
    let peopleResults = Array.from(userMap.values());
    if (exactUser && exactUser.id) {
      const exists = peopleResults.some(c => c.id === exactUser.id);
      if (!exists) {
        peopleResults = [exactUser, ...peopleResults];
      }
    }
    
    return {
      users: peopleResults.filter(u => u && u.id),
      posts: videos.filter(p => p && (p.id || p.tokenId)),
      total: searchData?.pages?.[0]?.total || 0,
    };
  }, [searchData, exactUser]);

  const activeFilterCount = [
    filters.w2e,
    filters.ppv,
    filters.date !== 'Any time',
    filters.likes !== 'Any',
    filters.shares !== 'Any',
    filters.comments !== 'Any',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setFilters({
      w2e: false,
      ppv: false,
      date: 'Any time',
      likes: 'Any',
      shares: 'Any',
      comments: 'Any',
    });
    setSelectedCategory('All');
  };

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const showLoading = isSearchLoading || isUserLoading;
  const showResults = isSearching && !showLoading && (searchResults.users.length > 0 || searchResults.posts.length > 0);
  const showNoResults = isSearching && !showLoading && searchResults.users.length === 0 && searchResults.posts.length === 0;
  const showMinCharsHint = searchQuery.length > 0 && searchQuery.length < 3;

  return (
    <div className="min-h-screen">
      {/* Search Header - Bento Style */}
      <div className="sticky top-11 lg:top-0 bg-black z-10 p-2 sm:p-3 space-y-2 sm:space-y-3">
        {/* Search Input Bento */}
        <div className="bg-zinc-900 rounded-2xl p-3 sm:p-4">
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for people, posts, or content..."
                className="w-full pl-12 pr-4 py-3 bg-zinc-800 border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:border-zinc-600 text-sm sm:text-base"
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
                'flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all',
                showFilters || activeFilterCount > 0
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
              )}
            >
              <SlidersHorizontal className="w-5 h-5" />
              {activeFilterCount > 0 && (
                <span className="text-sm font-medium">{activeFilterCount}</span>
              )}
            </button>
          </div>
          
          {/* Min chars hint */}
          {showMinCharsHint && (
            <p className="text-zinc-500 text-xs mt-2 pl-1">
              Type at least 3 characters to search
            </p>
          )}
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
                  <h3 className="text-white font-semibold">Filters</h3>
                  {(activeFilterCount > 0 || selectedCategory !== 'All') && (
                    <button
                      onClick={resetFilters}
                      className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Clear all
                    </button>
                  )}
                </div>

                {/* Category Filters */}
                {isSearching && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">Category</p>
                    <div className="flex flex-wrap gap-2">
                      {SEARCH_CATEGORIES.map((cat) => (
                        <FilterPill
                          key={cat}
                          label={cat}
                          active={selectedCategory === cat}
                          onClick={() => setSelectedCategory(cat)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Content Type Filters */}
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Content Type</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterPill
                      label="Bounty"
                      active={filters.w2e}
                      onClick={() => setFilters(f => ({ ...f, w2e: !f.w2e }))}
                    />
                    <FilterPill
                      label="PPV"
                      active={filters.ppv}
                      onClick={() => setFilters(f => ({ ...f, ppv: !f.ppv }))}
                    />
                  </div>
                </div>

                {/* Date Filter */}
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Date Posted</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterDropdown
                      label="Date"
                      value={filters.date}
                      options={DATE_OPTIONS}
                      onChange={(v) => setFilters(f => ({ ...f, date: v }))}
                    />
                  </div>
                </div>

                {/* Engagement Filters */}
                <div className="space-y-2 relative z-30">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Engagement</p>
                  <div className="flex flex-wrap gap-2">
                    <FilterDropdown
                      label="Likes"
                      value={filters.likes}
                      options={ENGAGEMENT_OPTIONS}
                      onChange={(v) => setFilters(f => ({ ...f, likes: v }))}
                    />
                    <FilterDropdown
                      label="Shares"
                      value={filters.shares}
                      options={ENGAGEMENT_OPTIONS}
                      onChange={(v) => setFilters(f => ({ ...f, shares: v }))}
                    />
                    <FilterDropdown
                      label="Comments"
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
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex w-full">
            {EXPLORE_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 rounded-xl transition-colors text-sm whitespace-nowrap',
                  activeTab === tab.value
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                )}
              >
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
              </button>
            ))}
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
                    <h2 className="text-lg sm:text-xl font-bold text-white">
                      Results for "{searchQuery}"
                    </h2>
                    {!showLoading && searchResults.total > 0 && (
                      <p className="text-zinc-500 text-sm mt-1">
                        {searchResults.total.toLocaleString()} results found
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
                      <span>Searching...</span>
                    </div>
                  </div>
                )}

                {/* Error State */}
                {searchError && (
                  <div className="text-center py-8">
                    <p className="text-red-400">Unable to search. Please try again.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 border-zinc-700 text-white hover:bg-zinc-800"
                      onClick={() => window.location.reload()}
                    >
                      Retry
                    </Button>
                  </div>
                )}

                {/* People Results */}
                {showResults && (activeTab === 'all' || activeTab === 'people') && searchResults.users.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
                      People ({searchResults.users.length})
                    </h3>
                    <div className="space-y-1">
                      {searchResults.users.slice(0, activeTab === 'people' ? undefined : 5).map((user, idx) => (
                        <UserResultCard key={user.id || `user-${idx}`} user={user} />
                      ))}
                    </div>
                    {activeTab === 'all' && searchResults.users.length > 5 && (
                      <button
                        onClick={() => setActiveTab('people')}
                        className="text-primary text-sm mt-3 hover:underline"
                      >
                        View all {searchResults.users.length} people
                      </button>
                    )}
                  </div>
                )}

                {/* Content Results */}
                {showResults && activeTab !== 'people' && searchResults.posts.length > 0 && (
                  <div>
                    <h3 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">
                      {activeTab === 'all' ? 'Content' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} ({searchResults.posts.length})
                    </h3>
                    <div className="space-y-3">
                      {searchResults.posts.map((post) => (
                        <SearchResultCard key={post.id || post.tokenId} item={{
                          id: String(post.id || post.tokenId),
                          title: post.title || post.name,
                          description: post.description,
                          thumbnail: post.imageUrl || post.thumbnail_url,
                          media_type: post.media_type || post.postType,
                          minter: post.minter,
                          mintername: post.mintername,
                          minterDisplayName: post.minterDisplayName,
                          minterAvatarUrl: post.minterAvatarUrl,
                          createdAt: post.createdAt || post.created_at,
                          like_count: post.like_count,
                          comment_count: post.comment_count || post.commentCount,
                        }} />
                      ))}
                    </div>

                    {/* Load More */}
                    {hasNextPage && (
                      <div className="flex justify-center mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleLoadMore}
                          disabled={isFetchingNextPage}
                          className="border-zinc-700 text-white hover:bg-zinc-800"
                        >
                          {isFetchingNextPage ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              Loading...
                            </>
                          ) : (
                            'Load More'
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* No Results */}
                {showNoResults && (
                  <div className="text-center py-8">
                    <p className="text-zinc-400">No results found for "{searchQuery}"</p>
                    <p className="text-zinc-500 text-sm mt-1">Try searching for something else</p>
                    {isUsernameQuery && (
                      <p className="text-zinc-500 text-sm mt-2">
                        Tip: Remove the @ to search for content instead of exact usernames
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
                <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Recent Searches</h2>
                <div className="flex flex-wrap gap-2">
                  {RECENT_SEARCHES.map((term) => (
                    <button
                      key={term}
                      onClick={() => setSearchQuery(term)}
                      className="px-3 sm:px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors text-sm"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trending Bento */}
              <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mt-[6px]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg sm:text-xl font-bold text-white">Trending</h2>
                  <FilterDropdown
                    label="Country"
                    value={selectedCountry}
                    options={COUNTRY_OPTIONS}
                    onChange={setSelectedCountry}
                  />
                </div>
                <div className="space-y-3">
                  {EXPLORE_TRENDING.map((item) => (
                    <div
                      key={item.tag}
                      className="flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{item.tag}</p>
                        <p className="text-zinc-500 text-sm">{item.postCount}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-zinc-700 text-white hover:bg-zinc-800 bg-transparent flex-shrink-0"
                      >
                        Follow
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

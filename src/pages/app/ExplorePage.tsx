import { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, X, ChevronDown, Loader2, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { EXPLORE_TABS, RECENT_SEARCHES, EXPLORE_TRENDING, SUGGESTED_USERS } from '@/constants/app.constants';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

const DATE_OPTIONS = ['Any time', 'Today', 'This week', 'This month', 'This year'];
const ENGAGEMENT_OPTIONS = ['Any', '100+', '1K+', '10K+', '100K+', '1M+'];
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

export default function ExplorePage() {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    w2e: false,
    ppv: false,
    date: 'Any time',
    likes: 'Any',
    shares: 'Any',
    comments: 'Any',
  });
  const [selectedCountry, setSelectedCountry] = useState('Global');

  const isSearching = searchQuery.length >= 3;

  // Search results - returns empty since no mock data
  const searchResults = useMemo(() => {
    return { users: [], posts: [] };
  }, [searchQuery, isSearching]);

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
  };

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
                  {activeFilterCount > 0 && (
                    <button
                      onClick={resetFilters}
                      className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Clear all
                    </button>
                  )}
                </div>

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
                  <h2 className="text-lg sm:text-xl font-bold text-white">
                    Results for "{searchQuery}"
                  </h2>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-zinc-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* People Results */}
                {(activeTab === 'all' || activeTab === 'people') && searchResults.users.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">People</h3>
                    <div className="space-y-3">
                      {searchResults.users.map((user) => (
                        <div key={user.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={user.avatar} className="object-cover" />
                              <AvatarFallback className="bg-zinc-700">{user.name[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-white font-medium flex items-center gap-1">
                                {user.name}
                                {user.verified && (
                                  <span className="text-blue-400 text-xs">✓</span>
                                )}
                              </p>
                              <p className="text-zinc-500 text-sm">{user.handle}</p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl border-zinc-700 text-white hover:bg-zinc-800 bg-transparent"
                          >
                            Follow
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Posts Results */}
                {(activeTab === 'all' || activeTab === 'posts') && searchResults.posts.length > 0 && (
                  <div>
                    <h3 className="text-sm text-zinc-400 uppercase tracking-wider mb-3">Posts</h3>
                    <div className="space-y-3">
                      {searchResults.posts.map((post) => (
                        <div key={post.id} className="p-3 bg-zinc-800 rounded-xl">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-white font-medium">{post.author}</span>
                            <span className="text-zinc-500 text-sm">{post.handle}</span>
                            <span className="text-zinc-600">·</span>
                            <span className="text-zinc-500 text-sm">{post.time}</span>
                          </div>
                          <p className="text-zinc-300">{post.content}</p>
                          <p className="text-zinc-500 text-sm mt-2">{post.likes} likes</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Results */}
                {searchResults.users.length === 0 && searchResults.posts.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-zinc-400">No results found for "{searchQuery}"</p>
                    <p className="text-zinc-500 text-sm mt-1">Try searching for something else</p>
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

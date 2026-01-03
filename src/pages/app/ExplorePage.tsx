import { useState } from 'react';
import { Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EXPLORE_TABS, RECENT_SEARCHES, EXPLORE_TRENDING } from '@/constants/app.constants';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const DATE_OPTIONS = ['Any time', 'Today', 'This week', 'This month', 'This year'];
const ENGAGEMENT_OPTIONS = ['Any', '100+', '1K+', '10K+', '100K+', '1M+'];

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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
          value !== options[0]
            ? 'bg-white text-black'
            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
        )}
      >
        <span>{label}: {value}</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute top-full left-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl p-1 min-w-[120px] z-50 shadow-xl"
            >
              {options.map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                    value === option
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                  )}
                >
                  {option}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
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
      <div className="sticky top-0 bg-black/80 backdrop-blur-sm z-10 p-2 sm:p-3 space-y-2 sm:space-y-3 mt-2 lg:mt-0">
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
                      label="Watch2Earn"
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
          <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Trending</h2>
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
      </div>
    </div>
  );
}

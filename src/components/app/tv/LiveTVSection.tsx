/**
 * Live TV Section Component
 * =========================
 * Main TV content section with category filter and channel list.
 * 
 * @module components/app/tv/LiveTVSection
 */

import { useState } from 'react';
import { Search, Tv, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TVChannelCard } from './TVChannelCard';
import { TVCategoryFilter } from './TVCategoryFilter';
import { 
  getTVChannelsByCategory, 
  searchTVChannels,
  type TVCategoryId,
} from '@/lib/api/live-tv';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

interface LiveTVSectionProps {
  showFilters?: boolean;
}

export function LiveTVSection({ showFilters = false }: LiveTVSectionProps) {
  const [activeCategory, setActiveCategory] = useState<TVCategoryId>('news');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  
  const isSearching = debouncedSearch.length > 0;
  
  // Fetch channels by category
  const { 
    data: categoryChannels, 
    isLoading: isLoadingCategory,
    error: categoryError 
  } = useQuery({
    queryKey: ['tv-channels', activeCategory],
    queryFn: () => getTVChannelsByCategory(activeCategory, 50),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !isSearching,
  });
  
  // Search channels
  const { 
    data: searchResults, 
    isLoading: isLoadingSearch,
    error: searchError 
  } = useQuery({
    queryKey: ['tv-search', debouncedSearch],
    queryFn: () => searchTVChannels(debouncedSearch, 50),
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: isSearching,
  });
  
  const channels = isSearching 
    ? (searchResults || []) 
    : (categoryChannels || []);
  
  const isLoading = isSearching ? isLoadingSearch : isLoadingCategory;
  const error = isSearching ? searchError : categoryError;
  
  return (
    <div className="space-y-3">
      {/* Search & Category Filter - not sticky to avoid overlapping icons */}
      <div className="space-y-2.5">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            type="text"
            placeholder="Search 1,000+ live TV channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-800 rounded-xl h-11"
          />
        </div>
        
        {/* Category Filter (hidden when searching) */}
        {!isSearching && (
          <TVCategoryFilter 
            activeCategory={activeCategory} 
            onCategoryChange={setActiveCategory} 
          />
        )}
        
        {/* Search Results Header */}
        {isSearching && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span>Results for "{debouncedSearch}"</span>
            {!isLoading && <span>({channels.length} channels)</span>}
          </div>
        )}
      </div>
      
      {/* Loading State */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-zinc-900/50 rounded-2xl overflow-hidden">
              <Skeleton className="aspect-video w-full" />
              <div className="p-3 flex gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Error State */}
      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv className="w-12 h-12 text-zinc-600 mb-4" />
          <h3 className="text-white font-semibold mb-2">Failed to load channels</h3>
          <p className="text-zinc-500 text-sm max-w-[280px]">
            Please check your connection and try again.
          </p>
        </div>
      )}
      
      {/* Empty State */}
      {!isLoading && !error && channels.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tv className="w-12 h-12 text-zinc-600 mb-4" />
          <h3 className="text-white font-semibold mb-2">
            {isSearching ? 'No channels found' : 'No channels available'}
          </h3>
          <p className="text-zinc-500 text-sm max-w-[280px]">
            {isSearching 
              ? 'Try a different search term.'
              : 'Try selecting a different category.'}
          </p>
        </div>
      )}
      
      {/* Channel Grid */}
      {!isLoading && !error && channels.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {channels.map((channel) => (
            <TVChannelCard key={channel.id} channel={channel} />
          ))}
        </div>
      )}
    </div>
  );
}

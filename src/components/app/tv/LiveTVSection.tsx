/**
 * Live TV Section Component
 * =========================
 * Main TV content section with dynamic country filter and channel list.
 * 
 * @module components/app/tv/LiveTVSection
 */

import { useState } from 'react';
import { Search, Tv } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TVChannelCard } from './TVChannelCard';
import { TVCategoryFilter } from './TVCategoryFilter';
import { 
  getTVChannelsByCountry, 
  getAvailableCountries,
  searchTVChannels,
  type TVCountryFilter,
} from '@/lib/api/live-tv';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

interface LiveTVSectionProps {
  showFilters?: boolean;
}

export function LiveTVSection({ showFilters = false }: LiveTVSectionProps) {
  const [activeCountry, setActiveCountry] = useState<TVCountryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  
  const isSearching = debouncedSearch.length > 0;

  // Fetch available countries for the filter
  const { data: countries = [] } = useQuery({
    queryKey: ['tv-countries'],
    queryFn: getAvailableCountries,
    staleTime: 5 * 60 * 1000,
  });
  
  // Fetch channels by country
  const { 
    data: countryChannels, 
    isLoading: isLoadingCountry,
    error: countryError 
  } = useQuery({
    queryKey: ['tv-channels', activeCountry],
    queryFn: () => getTVChannelsByCountry(activeCountry, 50),
    staleTime: 5 * 60 * 1000,
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
    staleTime: 2 * 60 * 1000,
    enabled: isSearching,
  });
  
  const channels = isSearching 
    ? (searchResults || []) 
    : (countryChannels || []);
  
  const isLoading = isSearching ? isLoadingSearch : isLoadingCountry;
  const error = isSearching ? searchError : countryError;
  
  return (
    <div className="space-y-3">
      {/* Search & Country Filter */}
      <div className="space-y-2.5">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            type="text"
            placeholder="Search hundreds of free TV channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-800 rounded-xl h-11"
          />
        </div>
        
        {/* Country Filter (hidden when searching) */}
        {!isSearching && countries.length > 0 && (
          <TVCategoryFilter 
            activeCountry={activeCountry} 
            onCountryChange={setActiveCountry}
            countries={countries}
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
            <div key={i} className="rounded-xl border border-white/[0.08] bg-transparent p-3">
              <Skeleton className="aspect-video w-full rounded-lg bg-white/[0.06]" />
              <div className="pt-3 flex gap-3">
                <Skeleton className="w-10 h-10 rounded-lg bg-white/[0.06]" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4 bg-white/[0.06]" />
                  <Skeleton className="h-3 w-1/2 bg-white/[0.06]" />
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
              : 'Try selecting a different country.'}
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
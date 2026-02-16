/**
 * Radio Section Component
 * =======================
 * Main radio content section with genre filter and station list.
 * 
 * @module components/app/radio/RadioSection
 */

import { useState } from 'react';
import { Search, Radio, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioStationCard } from './RadioStationCard';
import { RadioGenreFilter } from './RadioGenreFilter';
import { 
  getStationsByGenre, 
  searchStationsAdvanced,
  parseSearchQuery,
  type RadioGenreId,
  type RadioStation 
} from '@/lib/api/radio-browser';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

interface RadioSectionProps {
  showFilters?: boolean;
}

export function RadioSection({ showFilters = false }: RadioSectionProps) {
  const [activeGenre, setActiveGenre] = useState<RadioGenreId>('top');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  
  const isSearching = debouncedSearch.length > 0;
  
  // Fetch stations by genre
  const { 
    data: genreStations, 
    isLoading: isLoadingGenre,
    error: genreError 
  } = useQuery({
    queryKey: ['radio-stations', activeGenre],
    queryFn: () => getStationsByGenre(activeGenre, 50),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !isSearching,
  });
  
  // Parse search query for country detection
  const parsedQuery = parseSearchQuery(debouncedSearch);
  
  // Search stations with advanced filtering
  const { 
    data: searchResults, 
    isLoading: isLoadingSearch,
    error: searchError 
  } = useQuery({
    queryKey: ['radio-search', debouncedSearch],
    queryFn: () => searchStationsAdvanced({
      name: parsedQuery.name || undefined,
      countryCode: parsedQuery.countryCode,
      limit: 50,
    }),
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: isSearching,
  });
  
  const stations: RadioStation[] = isSearching 
    ? (searchResults || []) 
    : (genreStations || []);
  
  const isLoading = isSearching ? isLoadingSearch : isLoadingGenre;
  const error = isSearching ? searchError : genreError;
  
  return (
    <div className="flex flex-col h-full">
      {/* Fixed Search & Genre Filter */}
      <div className="flex-shrink-0 pb-3 space-y-2.5 bg-black">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            type="text"
            placeholder="Search 50,000+ radio stations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-900 border-zinc-800 rounded-xl h-11"
          />
        </div>
        
        {/* Genre Filter (hidden when searching) */}
        {!isSearching && (
          <RadioGenreFilter 
            activeGenre={activeGenre} 
            onGenreChange={setActiveGenre} 
          />
        )}
        
        {/* Search Results Header */}
        {isSearching && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span>
              Results for {parsedQuery.name ? `"${parsedQuery.name}"` : 'all stations'}
              {parsedQuery.countryName && ` in ${parsedQuery.countryName}`}
            </span>
            {!isLoading && <span>({stations.length} stations)</span>}
          </div>
        )}
      </div>
      
      {/* Scrollable Station List */}
      <div className="flex-1 overflow-y-auto space-y-2 pb-32">
        {/* Loading State */}
        {isLoading && (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 p-4 bg-zinc-900/50 rounded-2xl">
                <Skeleton className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl" />
              </div>
            ))}
          </>
        )}
        
        {/* Error State */}
        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Radio className="w-12 h-12 text-zinc-600 mb-4" />
            <h3 className="text-white font-semibold mb-2">Failed to load stations</h3>
            <p className="text-zinc-500 text-sm max-w-[280px]">
              Please check your connection and try again.
            </p>
          </div>
        )}
        
        {/* Empty State */}
        {!isLoading && !error && stations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Radio className="w-12 h-12 text-zinc-600 mb-4" />
            <h3 className="text-white font-semibold mb-2">
              {isSearching ? 'No stations found' : 'No stations available'}
            </h3>
            <p className="text-zinc-500 text-sm max-w-[280px]">
              {isSearching 
                ? 'Try a different search term.'
                : 'Try selecting a different genre.'}
            </p>
          </div>
        )}
        
        {/* Station List */}
        {!isLoading && !error && stations.length > 0 && (
          <>
            {stations.map((station) => (
              <RadioStationCard key={station.stationuuid} station={station} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

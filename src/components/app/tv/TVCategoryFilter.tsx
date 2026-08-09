/**
 * TV Category Filter Component
 * ============================
 * Horizontal scrollable country pills for TV channels.
 * Dynamically built from available channel data.
 * 
 * @module components/app/tv/TVCategoryFilter
 */

import { cn } from '@/lib/utils';
import type { TVCategory, TVCountryFilter } from '@/lib/api/live-tv';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';

interface TVCategoryFilterProps {
  activeCountry: TVCountryFilter;
  onCountryChange: (country: TVCountryFilter) => void;
  countries: TVCategory[];
}

export function TVCategoryFilter({ 
  activeCountry, 
  onCountryChange,
  countries,
}: TVCategoryFilterProps) {
  return (
    <div className="relative">
      {/* The scroll classes live on the carousel itself so it is the element
          that overflows — the edge fade measures the scroller it is applied
          to, and the wrapper never scrolled. */}
      <SwipeableCarousel fadeEdges className="flex gap-2 overflow-x-auto scrollbar-hide pr-8">
        {countries.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onCountryChange(cat.id)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors whitespace-nowrap',
                activeCountry === cat.id
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {cat.label}
              {cat.id !== 'all' && (
                <span className={cn(
                  'ml-1 text-[10px]',
                  activeCountry === cat.id ? 'text-black/50' : 'text-zinc-500'
                )}>
                  {cat.count}
                </span>
              )}
            </button>
        ))}
      </SwipeableCarousel>
    </div>
  );
}
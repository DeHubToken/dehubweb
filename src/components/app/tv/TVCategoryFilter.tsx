/**
 * TV Category Filter Component
 * ============================
 * Horizontal scrollable category pills for TV channels.
 * 
 * @module components/app/tv/TVCategoryFilter
 */

import { cn } from '@/lib/utils';
import { TV_CATEGORIES, type TVCategoryId } from '@/lib/api/live-tv';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';

interface TVCategoryFilterProps {
  activeCategory: TVCategoryId;
  onCategoryChange: (category: TVCategoryId) => void;
}

export function TVCategoryFilter({ 
  activeCategory, 
  onCategoryChange 
}: TVCategoryFilterProps) {
  return (
    <SwipeableCarousel>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pr-8">
        {/* Right edge fade */}
        <div className="pointer-events-none absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-zinc-900 to-transparent z-10" />
        
        {TV_CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => onCategoryChange(category.id)}
            className={cn(
              'flex-shrink-0 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors',
              activeCategory === category.id
                ? 'bg-white text-black'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            )}
          >
            {category.label}
          </button>
        ))}
      </div>
    </SwipeableCarousel>
  );
}

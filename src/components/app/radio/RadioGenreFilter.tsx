/**
 * Radio Genre Filter Component
 * ============================
 * Horizontal scrollable genre pill buttons with right fade.
 * 
 * @module components/app/radio/RadioGenreFilter
 */

import { cn } from '@/lib/utils';
import { RADIO_GENRES, type RadioGenreId } from '@/lib/api/radio-browser';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';

interface RadioGenreFilterProps {
  activeGenre: RadioGenreId;
  onGenreChange: (genre: RadioGenreId) => void;
}

export function RadioGenreFilter({ activeGenre, onGenreChange }: RadioGenreFilterProps) {
  return (
    <div className="relative z-10 mb-3">
      <SwipeableCarousel className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 px-1 pr-12">
          {RADIO_GENRES.map((genre) => (
            <button
              key={genre.id}
              onClick={() => onGenreChange(genre.id)}
              className={cn(
                'px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors',
                activeGenre === genre.id
                  ? 'bg-white text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              )}
            >
              {genre.label}
            </button>
          ))}
        </div>
      </SwipeableCarousel>
      {/* Right fade effect */}
      <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-10" />
    </div>
  );
}

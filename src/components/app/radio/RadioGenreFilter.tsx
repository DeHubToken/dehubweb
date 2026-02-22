/**
 * Radio Genre Filter Component
 * ============================
 * Horizontal scrollable genre pill buttons with right fade.
 * 
 * @module components/app/radio/RadioGenreFilter
 */

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
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
          {RADIO_GENRES.map((genre) => {
            const isActive = activeGenre === genre.id;
            return (
              <button
                key={genre.id}
                onClick={() => onGenreChange(genre.id)}
                className={cn(
                  'relative px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors',
                  isActive ? 'text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="radio-genre"
                    className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{genre.label}</span>
              </button>
            );
          })}
        </div>
      </SwipeableCarousel>
      {/* Right fade effect */}
      <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-10" />
    </div>
  );
}

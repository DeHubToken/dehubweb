/**
 * Radio Genre Filter Component
 * ============================
 * Horizontal scrollable genre pill buttons with right fade.
 * 
 * @module components/app/radio/RadioGenreFilter
 */

import { RADIO_GENRES, type RadioGenreId } from '@/lib/api/radio-browser';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';

interface RadioGenreFilterProps {
  activeGenre: RadioGenreId;
  onGenreChange: (genre: RadioGenreId) => void;
}

export function RadioGenreFilter({ activeGenre, onGenreChange }: RadioGenreFilterProps) {
  return (
    <div className="relative z-10 mb-3">
      <GlassFilterRow
        items={RADIO_GENRES.map((g) => ({ key: g.id, label: g.label }))}
        activeKey={activeGenre}
        onSelect={(key) => onGenreChange(key as RadioGenreId)}
        buttonClassName="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm"
      />
      <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none z-20" />
    </div>
  );
}

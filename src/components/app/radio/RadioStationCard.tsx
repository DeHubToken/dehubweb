/**
 * Radio Station Card Component
 * ============================
 * Displays individual radio station with play controls.
 * Glass-morphism style matching app aesthetic.
 * 
 * @module components/app/radio/RadioStationCard
 */

import { Play, Pause, Radio, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRadioPlayer } from '@/hooks';
import type { RadioStation } from '@/lib/api/radio-browser';
import { getCountryFlag, getPrimaryTags, formatBitrate } from '@/lib/api/radio-browser';

// Custom station logos
import reyfmLogo from '@/assets/radio/reyfm-logo.png';
import lofi247Logo from '@/assets/radio/lofi247-logo.png';
import moewifiLogo from '@/assets/radio/moewifi-logo.png';
import niaLofiLogo from '@/assets/radio/nia-lofi-logo.png';
import nightwavePlazaLogo from '@/assets/radio/nightwave-plaza-logo.png';

// Map station name patterns to custom logos
const CUSTOM_LOGOS: Record<string, string> = {
  'reyfm': reyfmLogo,
  'rey fm': reyfmLogo,
  'lofi 24': lofi247Logo,
  'lofi girl': lofi247Logo,
  'lofi hip hop': lofi247Logo,
  'moe wifi': moewifiLogo,
  'moewifi': moewifiLogo,
  'moe lofi': moewifiLogo,
  'nia radio': niaLofiLogo,
  'nia lofi': niaLofiLogo,
  'nightwave plaza': nightwavePlazaLogo,
  'nightwave': nightwavePlazaLogo,
};

function getCustomLogo(stationName: string): string | null {
  const nameLower = stationName.toLowerCase();
  for (const [pattern, logo] of Object.entries(CUSTOM_LOGOS)) {
    if (nameLower.includes(pattern)) {
      return logo;
    }
  }
  return null;
}

interface RadioStationCardProps {
  station: RadioStation;
}

export function RadioStationCard({ station }: RadioStationCardProps) {
  const { currentStation, isPlaying, isLoading, play, togglePlayPause } = useRadioPlayer();
  
  const isCurrentStation = currentStation?.stationuuid === station.stationuuid;
  const isThisPlaying = isCurrentStation && isPlaying;
  const isThisLoading = isCurrentStation && isLoading;
  
  const handleClick = () => {
    if (isCurrentStation) {
      togglePlayPause();
    } else {
      play(station);
    }
  };
  
  const tags = getPrimaryTags(station.tags);
  const bitrate = formatBitrate(station.bitrate);
  const countryFlag = getCountryFlag(station.countrycode);
  const customLogo = getCustomLogo(station.name);
  const logoSrc = customLogo || station.favicon;
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full bg-black/40 backdrop-blur-[24px] saturate-[180%] border border-white/10',
        'rounded-2xl p-3 sm:p-4 flex gap-3 sm:gap-4 items-center',
        'hover:bg-white/5 transition-all duration-200 cursor-pointer text-left',
        isCurrentStation && 'ring-1 ring-white/20 bg-white/5'
      )}
    >
      {/* Station Logo */}
      <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden flex-shrink-0 bg-zinc-800">
        {logoSrc ? (
          <img 
            src={logoSrc} 
            alt={station.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={cn(
          'absolute inset-0 flex items-center justify-center bg-zinc-800',
          logoSrc && 'hidden'
        )}>
          <Radio className="w-6 h-6 text-zinc-500" />
        </div>
        
        {/* Now Playing Indicator */}
        {isThisPlaying && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="flex items-end gap-0.5 h-4">
              <div className="w-1 bg-white rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0ms' }} />
              <div className="w-1 bg-white rounded-full animate-pulse" style={{ height: '100%', animationDelay: '150ms' }} />
              <div className="w-1 bg-white rounded-full animate-pulse" style={{ height: '40%', animationDelay: '300ms' }} />
              <div className="w-1 bg-white rounded-full animate-pulse" style={{ height: '80%', animationDelay: '450ms' }} />
            </div>
          </div>
        )}
      </div>
      
      {/* Station Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-white truncate text-sm sm:text-base">
          {station.name}
        </h3>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-base flex-shrink-0">{countryFlag}</span>
          {tags.length > 0 && (
            <span className="text-zinc-400 text-xs sm:text-sm truncate flex-1 min-w-0">
              {tags.join(', ')}
            </span>
          )}
          {bitrate && (
            <>
              <span className="text-zinc-600 text-xs flex-shrink-0">•</span>
              <span className="text-zinc-500 text-xs flex-shrink-0">{bitrate}</span>
            </>
          )}
        </div>
      </div>
      
      {/* Play/Pause Button */}
      <div className={cn(
        'w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0',
        'bg-white/10 backdrop-blur-sm transition-colors',
        isCurrentStation ? 'bg-white/20' : 'hover:bg-white/20'
      )}>
        {isThisLoading ? (
          <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-white animate-spin" />
        ) : isThisPlaying ? (
          <Pause className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white" />
        ) : (
          <Play className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white ml-0.5" />
        )}
      </div>
    </button>
  );
}

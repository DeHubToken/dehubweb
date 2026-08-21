/**
 * StageRadioNowPlaying — the label under the music, for everyone but the host
 * ===========================================================================
 *
 * When a host puts a station on air the audio simply arrives on the host's
 * track, with nothing to say where it came from. This is that missing half: a
 * quiet strip naming the station, fed by the host's realtime announcement (see
 * `useStageRadioNowPlaying`). Renders nothing when the radio is off, so it can
 * sit unconditionally in any stage surface.
 *
 * The host has their own controls in StageRadioPanel and must not mount this —
 * a second subscription to the same topic from one client is refused.
 */

import { Radio } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useStageRadioNowPlaying } from '@/hooks/use-stage-radio';
import { getCountryFlag, getPrimaryTags } from '@/lib/api/radio-browser';

interface StageRadioNowPlayingProps {
  spaceId?: string | null;
  className?: string;
}

export function StageRadioNowPlaying({ spaceId, className }: StageRadioNowPlayingProps) {
  const station = useStageRadioNowPlaying(spaceId);
  const [logoFailed, setLogoFailed] = useState(false);

  if (!station) return null;

  const tags = getPrimaryTags(station.tags || '').join(', ');
  const flag = getCountryFlag(station.countrycode || '');

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10',
        className,
      )}
    >
      <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-white/10 flex items-center justify-center">
        {station.favicon && !logoFailed ? (
          <img
            src={station.favicon}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <Radio className="w-4 h-4 text-white/40" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-white/40">On the radio</p>
        <p className="text-xs font-medium text-white truncate">{station.name}</p>
        {(tags || station.country) && (
          <p className="text-[10px] text-white/40 truncate">
            {flag} {tags || station.country}
          </p>
        )}
      </div>

      {/* Four bars on the same staggered pulse the Radio page uses — the one
          cue that this is sound happening now rather than a static credit. */}
      <div className="flex items-end gap-0.5 h-4 shrink-0" aria-hidden="true">
        <div className="w-0.5 bg-white/60 rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0ms' }} />
        <div className="w-0.5 bg-white/60 rounded-full animate-pulse" style={{ height: '100%', animationDelay: '150ms' }} />
        <div className="w-0.5 bg-white/60 rounded-full animate-pulse" style={{ height: '40%', animationDelay: '300ms' }} />
        <div className="w-0.5 bg-white/60 rounded-full animate-pulse" style={{ height: '80%', animationDelay: '450ms' }} />
      </div>
    </div>
  );
}

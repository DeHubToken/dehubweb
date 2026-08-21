/**
 * StageRadioPanel — put a radio station on air for the room (host only)
 * =====================================================================
 *
 * The host picks a station and the whole audience hears it, mixed into the
 * track that already carries the host's voice — see `lib/stage-radio.ts` for
 * the audio path and `StageContext` for the publish.
 *
 * The browser is the DeHub Radio catalogue, not a second one: same
 * radio-browser client, same genres, and the same react-query keys the Radio
 * page uses, so a host who was already browsing stations opens this on a warm
 * cache. It collapses itself once something is on air — a host mid-show wants
 * the level and the stop button, not fifty more stations.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Radio, Search, Play, Square, Loader2, Volume2, VolumeX, Headphones, HeadphoneOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { cn } from '@/lib/utils';
import { useStage } from '@/contexts/StageContext';
import { useRadioPlayer } from '@/hooks/use-radio-player';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  RADIO_GENRES,
  getStationsByGenre,
  searchStationsAdvanced,
  parseSearchQuery,
  registerStationClick,
  getCountryFlag,
  getPrimaryTags,
  formatBitrate,
  type RadioStation,
  type RadioGenreId,
} from '@/lib/api/radio-browser';
import type { StageRadioStation } from '@/lib/stage-radio';

/**
 * radio-browser serves plenty of `http://` favicons, which a page on https can
 * only fail to load. Dropping them here means the fallback mark renders first
 * time instead of after a blocked request.
 */
function secureLogo(favicon?: string): string | undefined {
  return favicon && favicon.startsWith('https://') ? favicon : undefined;
}

function toStageRadioStation(station: RadioStation): StageRadioStation {
  return {
    id: station.stationuuid,
    name: station.name?.trim() || 'Unknown station',
    url: station.url_resolved || station.url,
    favicon: secureLogo(station.favicon),
    country: station.country || undefined,
    countrycode: station.countrycode || undefined,
    tags: station.tags || undefined,
    bitrate: station.bitrate || undefined,
  };
}

/** Comma-separated tags and a bitrate, in one line, without a trailing separator. */
function describe(tags?: string, bitrate?: number): string {
  return [getPrimaryTags(tags || '').join(', '), formatBitrate(bitrate || 0)]
    .filter(Boolean)
    .join(' · ');
}

function StationLogo({
  src,
  className,
  busy,
}: {
  src?: string;
  className?: string;
  busy?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={cn(
        'relative rounded-lg overflow-hidden shrink-0 bg-white/10 flex items-center justify-center',
        className,
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Radio className="w-4 h-4 text-white/40" />
      )}
      {busy && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-white" />
        </div>
      )}
    </div>
  );
}

export function StageRadioPanel() {
  const {
    radioStation,
    radioStatus,
    radioVolume,
    radioMonitor,
    startRadio,
    stopRadio,
    setRadioVolume,
    setRadioMonitor,
  } = useStage();
  const { isPlaying: pageRadioPlaying, pause: pausePageRadio } = useRadioPlayer();

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [genre, setGenre] = useState<RadioGenreId>('top');
  const [browseOpen, setBrowseOpen] = useState(true);

  const isSearching = debouncedQuery.length > 0;
  const parsed = parseSearchQuery(debouncedQuery);

  // Keys match RadioSection's exactly so the two surfaces share one cache.
  const { data: genreStations, isLoading: loadingGenre } = useQuery({
    queryKey: ['radio-stations', genre],
    queryFn: () => getStationsByGenre(genre, 50),
    staleTime: 5 * 60 * 1000,
    enabled: browseOpen && !isSearching,
  });

  const { data: searchResults, isLoading: loadingSearch } = useQuery({
    queryKey: ['radio-search', debouncedQuery],
    queryFn: () =>
      searchStationsAdvanced({
        name: parsed.name || undefined,
        countryCode: parsed.countryCode,
        limit: 50,
      }),
    staleTime: 2 * 60 * 1000,
    enabled: browseOpen && isSearching,
  });

  const stations: RadioStation[] = (isSearching ? searchResults : genreStations) || [];
  const isLoading = isSearching ? loadingSearch : loadingGenre;

  const onAir = !!radioStation;

  // A dropped stream leaves the host looking at a dead station behind a
  // collapsed browser. Put the catalogue back in front of them.
  useEffect(() => {
    if (radioStatus === 'error') setBrowseOpen(true);
  }, [radioStatus]);

  const putOnAir = async (station: RadioStation) => {
    // Whatever the host was listening to on the Radio page is not what the room
    // is about to hear, and two streams at once on one pair of speakers helps
    // nobody. Stand the page player down first.
    if (pageRadioPlaying) pausePageRadio();
    void registerStationClick(station.stationuuid);
    await startRadio(toStageRadioStation(station));
    setBrowseOpen(false);
  };

  return (
    <div className="space-y-3 p-3 bg-white/5 rounded-xl border border-white/10 animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <Radio className="w-4 h-4" />
          Radio
        </h3>
        <div className="flex items-center gap-1.5">
          {onAir && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/10 border border-white/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
              </span>
              <span className="text-[10px] font-medium text-white tracking-wide">ON AIR</span>
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setBrowseOpen(!browseOpen)}
            className={cn(
              'h-6 px-2 text-[10px] rounded-lg',
              browseOpen
                ? 'bg-white/15 text-white'
                : 'text-white/50 hover:text-white hover:bg-white/10',
            )}
          >
            {browseOpen ? 'Hide' : 'Browse'}
          </Button>
        </div>
      </div>

      {/* What's on air, and the two things a host reaches for while it is. */}
      {radioStation && (
        <div className="space-y-2.5 p-2.5 rounded-xl bg-white/10 border border-white/15">
          <div className="flex items-center gap-3">
            <StationLogo
              src={radioStation.favicon}
              className="w-10 h-10"
              busy={radioStatus === 'connecting'}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{radioStation.name}</p>
              <p className="text-[11px] text-white/50 truncate">
                {radioStatus === 'connecting' && 'Tuning in…'}
                {radioStatus === 'error' && 'Stream dropped — pick another station'}
                {radioStatus === 'live' &&
                  [
                    getCountryFlag(radioStation.countrycode || ''),
                    describe(radioStation.tags, radioStation.bitrate) || 'Playing to the room',
                  ].join(' ')}
                {radioStatus === 'idle' && 'Stopped'}
              </p>
            </div>
            <Button
              onClick={() => { setBrowseOpen(true); void stopRadio(); }}
              size="icon"
              className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white shrink-0"
              title="Take the radio off air"
            >
              <Square className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <VolumeX className="w-3 h-3 text-white/40 shrink-0" />
            <Slider
              value={[radioVolume]}
              onValueChange={([v]) => setRadioVolume(v)}
              max={100}
              min={0}
              step={5}
              className="flex-1"
            />
            <Volume2 className="w-3 h-3 text-white/40 shrink-0" />
            <span className="text-xs text-white/40 w-8 text-right">{radioVolume}%</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-white/40 leading-tight">
              The room hears this whether your mic is open or muted.
            </p>
            <button
              type="button"
              onClick={() => setRadioMonitor(!radioMonitor)}
              className={cn(
                'shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors',
                radioMonitor
                  ? 'bg-white/15 border-white/30 text-white'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70',
              )}
              title={
                radioMonitor
                  ? 'You can hear the station — turn this off if your mic is picking it up'
                  : 'You cannot hear the station; the room still can'
              }
            >
              {radioMonitor ? (
                <Headphones className="w-3 h-3" />
              ) : (
                <HeadphoneOff className="w-3 h-3" />
              )}
              <span className="text-[10px]">Monitor</span>
            </button>
          </div>
        </div>
      )}

      {browseOpen && (
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stations, or a country…"
              className="pl-9 h-9 rounded-xl bg-white/5 border-white/10 text-white text-sm placeholder:text-white/30"
            />
          </div>

          {!isSearching ? (
            <GlassFilterRow
              items={RADIO_GENRES.map((g) => ({ key: g.id, label: g.label }))}
              activeKey={genre}
              onSelect={(key) => setGenre(key as RadioGenreId)}
              buttonClassName="px-2.5 py-1 text-[11px]"
              borderRadius="0.5rem"
            />
          ) : (
            <p className="text-[11px] text-white/40">
              {parsed.name ? `“${parsed.name}”` : 'All stations'}
              {parsed.countryName && ` in ${parsed.countryName}`}
              {!isLoading && ` · ${stations.length} found`}
            </p>
          )}

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.04] animate-pulse"
                >
                  <div className="w-9 h-9 rounded-lg bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-1/2 rounded bg-white/10" />
                    <div className="h-2 w-1/3 rounded bg-white/[0.07]" />
                  </div>
                </div>
              ))}

            {!isLoading && stations.length === 0 && (
              <p className="text-[11px] text-white/40 text-center py-4">
                {isSearching
                  ? 'No stations match that. Try a genre or a country.'
                  : 'No stations available right now.'}
              </p>
            )}

            {!isLoading &&
              stations.map((station) => {
                const isOnAir = radioStation?.id === station.stationuuid;
                const meta = describe(station.tags, station.bitrate);
                return (
                  <button
                    key={station.stationuuid}
                    type="button"
                    onClick={() => void putOnAir(station)}
                    className={cn(
                      'w-full flex items-center gap-2.5 p-2 rounded-xl text-left border transition-all duration-100',
                      isOnAir
                        ? 'bg-white/15 border-white/30'
                        : 'bg-white/[0.06] border-white/10 hover:bg-white/10 hover:border-white/20 active:scale-[0.99]',
                    )}
                  >
                    <StationLogo src={secureLogo(station.favicon)} className="w-9 h-9" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{station.name}</p>
                      <p className="text-[10px] text-white/40 truncate">
                        {getCountryFlag(station.countrycode)}
                        {meta ? ` ${meta}` : ''}
                      </p>
                    </div>
                    <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white shrink-0">
                      {isOnAir ? <Radio className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

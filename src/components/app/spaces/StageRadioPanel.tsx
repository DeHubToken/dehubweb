/**
 * StageRadioPanel — the host's deck: radio stations, or their own clips
 * =====================================================================
 *
 * Two sources, one air path. **Stations** is the DeHub Radio catalogue — the
 * same radio-browser client, the same genre channels and the same react-query
 * keys the Radio page uses, so a host who was already browsing opens this on a
 * warm cache. **My music** is whatever the host has uploaded: a set they can
 * step through, which plays on and hands over to the next clip on its own.
 *
 * Both go out through `lib/stage-radio.ts` and are published by StageContext,
 * so a clip is subject to the same broadcast level and the same monitor toggle
 * as a station, and keeps playing while the host is muted. The one thing that
 * differs is what the end of the audio means — see `kind` on StageRadioStation.
 *
 * Clips live in the `soundboard-sounds` bucket under `<wallet>/music/`,
 * deliberately reusing the bucket the soundboard already owns rather than
 * adding one: a new bucket is a migration, and migrations here do not apply on
 * merge, which would have shipped this dead. That subfolder is why
 * StageSoundboard now skips folder rows when it lists a host's pads.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Radio, Search, Play, Pause, Square, SkipBack, SkipForward, Loader2, Music,
  Volume2, VolumeX, Headphones, HeadphoneOff, Plus, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useStage } from '@/contexts/StageContext';
import { useRadioPlayer } from '@/hooks/use-radio-player';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { toast } from 'sonner';
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

const MUSIC_BUCKET = 'soundboard-sounds';
const MAX_MUSIC_CLIPS = 12;
const MAX_MUSIC_MB = 15;
const ACCEPTED_AUDIO_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg',
  'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac',
];

/** A clip carries its storage path so it can be deleted; a station never has one. */
type MusicClip = StageRadioStation & { path: string };

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
    kind: 'station',
    favicon: secureLogo(station.favicon),
    country: station.country || undefined,
    countrycode: station.countrycode || undefined,
    tags: station.tags || undefined,
    bitrate: station.bitrate || undefined,
  };
}

/** `1755740000000-my-set-part-1.mp3` → `my set part 1`. */
function prettyClipName(fileName: string): string {
  return (
    fileName
      .replace(/^\d+-/, '')
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim() || 'Untitled clip'
  );
}

/** Comma-separated tags and a bitrate, in one line, without a trailing separator. */
function describe(tags?: string, bitrate?: number): string {
  return [getPrimaryTags(tags || '').join(', '), formatBitrate(bitrate || 0)]
    .filter(Boolean)
    .join(' · ');
}

function SourceArt({
  src,
  kind,
  className,
  busy,
}: {
  src?: string;
  kind?: 'station' | 'track';
  className?: string;
  busy?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const Fallback = kind === 'track' ? Music : Radio;
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
        <Fallback className="w-4 h-4 text-white/40" />
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
  const { walletAddress } = useAuth();
  const {
    radioStation,
    radioStatus,
    radioVolume,
    radioMonitor,
    radioQueue,
    startRadio,
    stopRadio,
    toggleRadioPause,
    radioNext,
    radioPrev,
    setRadioVolume,
    setRadioMonitor,
  } = useStage();
  const { isPlaying: pageRadioPlaying, pause: pausePageRadio } = useRadioPlayer();

  const [tab, setTab] = useState<'stations' | 'music'>('stations');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [genre, setGenre] = useState<RadioGenreId>('top');
  const [browseOpen, setBrowseOpen] = useState(true);

  const [clips, setClips] = useState<MusicClip[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSearching = debouncedQuery.length > 0;
  const parsed = parseSearchQuery(debouncedQuery);
  const musicFolder = walletAddress ? `${walletAddress.toLowerCase()}/music` : null;

  // Keys match RadioSection's exactly so the two surfaces share one cache.
  const { data: genreStations, isLoading: loadingGenre } = useQuery({
    queryKey: ['radio-stations', genre],
    queryFn: () => getStationsByGenre(genre, 50),
    staleTime: 5 * 60 * 1000,
    enabled: browseOpen && tab === 'stations' && !isSearching,
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
    enabled: browseOpen && tab === 'stations' && isSearching,
  });

  const stations = useMemo(
    () => ((isSearching ? searchResults : genreStations) || []).map(toStageRadioStation),
    [isSearching, searchResults, genreStations],
  );
  const isLoadingStations = isSearching ? loadingSearch : loadingGenre;

  const loadClips = useCallback(async () => {
    if (!musicFolder) return;
    const { data, error } = await supabase.storage
      .from(MUSIC_BUCKET)
      .list(musicFolder, { limit: MAX_MUSIC_CLIPS, sortBy: { column: 'created_at', order: 'asc' } });
    if (error || !data) return;

    setClips(
      data
        // `id: null` marks a nested folder rather than a file, and Supabase's
        // own empty-folder marker is not a clip either.
        .filter((f) => f.id !== null && f.name !== '.emptyFolderPlaceholder')
        .map((f) => {
          const path = `${musicFolder}/${f.name}`;
          const { data: urlData } = supabase.storage.from(MUSIC_BUCKET).getPublicUrl(path);
          return {
            id: path,
            name: prettyClipName(f.name),
            url: urlData.publicUrl,
            kind: 'track' as const,
            path,
          };
        }),
    );
  }, [musicFolder]);

  useEffect(() => {
    void loadClips();
  }, [loadClips]);

  const onAir = !!radioStation;
  const onAirIsTrack = radioStation?.kind === 'track';
  const canSkip = radioQueue.length > 1;
  const positionInSet = radioStation ? radioQueue.findIndex((s) => s.id === radioStation.id) : -1;

  // A dropped stream leaves the host looking at a dead source behind a
  // collapsed browser. Put the catalogue back in front of them.
  useEffect(() => {
    if (radioStatus === 'error') setBrowseOpen(true);
  }, [radioStatus]);

  const putOnAir = async (source: StageRadioStation, queue: StageRadioStation[]) => {
    // Whatever the host was listening to on the Radio page is not what the room
    // is about to hear, and two streams at once on one pair of speakers helps
    // nobody. Stand the page player down first.
    if (pageRadioPlaying) pausePageRadio();
    if (source.kind === 'station') void registerStationClick(source.id);
    await startRadio(source, queue);
    setBrowseOpen(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!files.length || !musicFolder) return;

    if (clips.length + files.length > MAX_MUSIC_CLIPS) {
      toast.error(`Room for ${MAX_MUSIC_CLIPS} clips. Delete one first.`);
      return;
    }

    setIsUploading(true);
    let added = 0;
    for (const file of files) {
      if (file.type && !ACCEPTED_AUDIO_TYPES.includes(file.type)) {
        toast.error(`${file.name}: not an audio file`);
        continue;
      }
      if (file.size > MAX_MUSIC_MB * 1024 * 1024) {
        toast.error(`${file.name}: over ${MAX_MUSIC_MB}MB`);
        continue;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
      const { error } = await supabase.storage
        .from(MUSIC_BUCKET)
        .upload(`${musicFolder}/${Date.now()}-${safeName}`, file, {
          contentType: file.type || 'audio/mpeg',
          upsert: false,
        });
      // Surface the server's own words: the one failure worth telling apart is
      // the project's upload size limit, and a flat "upload failed" hides it.
      if (error) toast.error(`${file.name}: ${error.message}`);
      else added += 1;
    }
    setIsUploading(false);

    if (added) {
      toast.success(added === 1 ? 'Clip added' : `${added} clips added`);
      await loadClips();
    }
  };

  const handleDelete = async (clip: MusicClip) => {
    // Deleting what is currently playing would leave the room on a URL that has
    // stopped existing, so take it off air first.
    if (radioStation?.id === clip.id) await stopRadio();
    const { error } = await supabase.storage.from(MUSIC_BUCKET).remove([clip.path]);
    if (error) {
      toast.error('Could not delete that clip');
      return;
    }
    setClips((prev) => prev.filter((c) => c.path !== clip.path));
  };

  const list: StageRadioStation[] = tab === 'stations' ? stations : clips;
  const isLoadingList = tab === 'stations' && isLoadingStations;

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

      {/* What's on air, and everything a host reaches for while it is. */}
      {radioStation && (
        <div className="space-y-2.5 p-2.5 rounded-xl bg-white/10 border border-white/15">
          <div className="flex items-center gap-3">
            <SourceArt
              src={radioStation.favicon}
              kind={radioStation.kind}
              className="w-10 h-10"
              busy={radioStatus === 'connecting'}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{radioStation.name}</p>
              <p className="text-[11px] text-white/50 truncate">
                {radioStatus === 'connecting' && (onAirIsTrack ? 'Loading…' : 'Tuning in…')}
                {radioStatus === 'paused' && 'Held — the room hears silence'}
                {radioStatus === 'error' &&
                  (onAirIsTrack ? 'That clip would not play' : 'Stream dropped — pick another')}
                {radioStatus === 'idle' && 'Stopped'}
                {radioStatus === 'live' &&
                  (onAirIsTrack
                    ? `Playing to the room${canSkip ? ` · ${positionInSet + 1} of ${radioQueue.length}` : ''}`
                    : [
                        getCountryFlag(radioStation.countrycode || ''),
                        describe(radioStation.tags, radioStation.bitrate) || 'Playing to the room',
                      ].join(' '))}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {canSkip && (
                <button
                  type="button"
                  onClick={radioPrev}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                  title="Previous"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
              )}
              {/* Pause belongs to a clip only: holding a live stream just
                  buffers it, and the room hears the gap when it resumes. */}
              {onAirIsTrack && (
                <button
                  type="button"
                  onClick={toggleRadioPause}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                  title={radioStatus === 'paused' ? 'Resume' : 'Pause'}
                >
                  {radioStatus === 'paused' ? (
                    <Play className="w-3.5 h-3.5" />
                  ) : (
                    <Pause className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
              {canSkip && (
                <button
                  type="button"
                  onClick={radioNext}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                  title="Next"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setBrowseOpen(true);
                  void stopRadio();
                }}
                className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                title="Take it off air"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            </div>
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
                  ? 'You can hear it — turn this off if your mic is picking it up'
                  : 'You cannot hear it; the room still can'
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
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-white/5 border border-white/10">
            {(['stations', 'music'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-medium transition-colors',
                  tab === key
                    ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:text-white hover:bg-white/5',
                )}
              >
                {key === 'stations' ? <Radio className="w-3 h-3" /> : <Music className="w-3 h-3" />}
                {key === 'stations' ? 'Stations' : 'My music'}
              </button>
            ))}
          </div>

          {tab === 'stations' ? (
            <>
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
                  {!isLoadingStations && ` · ${stations.length} found`}
                </p>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-white/40">
                {clips.length}/{MAX_MUSIC_CLIPS} clips · up to {MAX_MUSIC_MB}MB each
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || clips.length >= MAX_MUSIC_CLIPS}
                className="h-7 px-2.5 text-[11px] rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-40"
              >
                {isUploading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                <span className="ml-1.5">{isUploading ? 'Uploading…' : 'Add music'}</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                multiple
                onChange={handleUpload}
                className="hidden"
              />
            </div>
          )}

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
            {isLoadingList &&
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

            {!isLoadingList && list.length === 0 && (
              <p className="text-[11px] text-white/40 text-center py-4 px-3 leading-relaxed">
                {tab === 'music'
                  ? 'No clips yet. Add your own music and it plays to the room like a station — one after another, and it keeps going while you talk.'
                  : isSearching
                    ? 'No stations match that. Try a genre or a country.'
                    : 'No stations available right now.'}
              </p>
            )}

            {!isLoadingList &&
              list.map((source) => {
                const isOnAir = radioStation?.id === source.id;
                const meta =
                  source.kind === 'track'
                    ? 'Your music'
                    : `${getCountryFlag(source.countrycode || '')} ${describe(source.tags, source.bitrate)}`.trim();
                return (
                  <div
                    key={source.id}
                    className={cn(
                      'group flex items-center gap-2.5 p-2 rounded-xl border transition-all duration-100',
                      isOnAir
                        ? 'bg-white/15 border-white/30'
                        : 'bg-white/[0.06] border-white/10 hover:bg-white/10 hover:border-white/20',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void putOnAir(source, list)}
                      className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
                    >
                      <SourceArt src={source.favicon} kind={source.kind} className="w-9 h-9" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{source.name}</p>
                        <p className="text-[10px] text-white/40 truncate">{meta}</p>
                      </div>
                      <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white shrink-0">
                        {isOnAir ? (
                          <Radio className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </span>
                    </button>

                    {tab === 'music' && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(source as MusicClip)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        title={`Delete ${source.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

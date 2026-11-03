/**
 * Music Search Shelves
 * ====================
 * The Music tab's search also finds stages and radio stations, not just
 * music posts. Two rows sit above the music grid: stages (live first, then
 * upcoming, then recordings) and stations from the radio directory.
 *
 * @module components/app/feeds/MusicSearchShelves
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation as _useCopy } from 'react-i18next';
import { useLiveSpaces, useScheduledSpaces, useStage } from '@/contexts/StageContext';
import { useRadioPlayer } from '@/hooks/use-radio-player';
import { StageCoverArt } from '@/components/app/stages/StageCoverArt';
import { searchStageRecordings } from '@/lib/stage-recordings';
import { searchRadio } from '@/lib/music-search';
import { getPrimaryTags, type RadioStation } from '@/lib/api/radio-browser';
import { cn } from '@/lib/utils';
import type { AudioSpace } from '@/types/audio-spaces.types';

const STATION_LIMIT = 24;
const STATUS_ORDER: Record<string, number> = { live: 0, scheduled: 1 };

/** Stages and stations that match `q`. Empty until there are 2+ letters. */
export function useMusicSearchShelves(q: string) {
  const term = q.trim();
  const enabled = term.length >= 2;
  const liveSpaces = useLiveSpaces();
  const scheduledSpaces = useScheduledSpaces();
  const recordings = useQuery({
    queryKey: ['music-search-stages', term],
    queryFn: () => searchStageRecordings(term),
    enabled,
    staleTime: 60_000,
  });
  const radio = useQuery({
    queryKey: ['music-search-radio', term],
    queryFn: () => searchRadio(term),
    enabled,
    staleTime: 5 * 60_000,
  });

  const stages = useMemo<AudioSpace[]>(() => {
    if (!enabled) return [];
    const needle = term.toLocaleLowerCase();
    const seen = new Set<string>();
    return [...liveSpaces, ...scheduledSpaces, ...(recordings.data ?? [])]
      .filter((space) => `${space.title} ${space.description ?? ''} ${space.host_username ?? ''}`.toLocaleLowerCase().includes(needle))
      .filter((space) => !seen.has(space.id) && (seen.add(space.id), true))
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2));
  }, [enabled, term, liveSpaces, scheduledSpaces, recordings.data]);
  // The directory lists some stations more than once under the same name.
  const stations = useMemo(() => {
    if (!enabled) return [];
    const seen = new Set<string>();
    return (radio.data ?? [])
      .filter((station) => { const key = station.name.trim().toLocaleLowerCase(); return !seen.has(key) && (seen.add(key), true); })
      .slice(0, STATION_LIMIT);
  }, [enabled, radio.data]);

  return {
    stages,
    stations,
    isLoading: enabled && (recordings.isLoading || radio.isLoading),
  };
}

function ShelfTitle({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{children}</p>;
}

export function MusicSearchShelves({ stages, stations, showMusicTitle }: { stages: AudioSpace[]; stations: RadioStation[]; showMusicTitle: boolean }) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const { openModal, joinSpace } = useStage();
  const { currentStation, isPlaying, play, pause } = useRadioPlayer();

  const openStage = (space: AudioSpace) => {
    if (space.status === 'live') {
      openModal('live');
      joinSpace(space.id);
      return;
    }
    navigate(space.short_id != null ? `/stages/${space.short_id}` : `/stage/${space.id}`);
  };
  const toggleStation = (station: RadioStation) => {
    if (isPlaying && currentStation?.stationuuid === station.stationuuid) pause();
    else play(station);
  };

  return (
    <>
      {stages.length > 0 && (
        <div data-music-search-stages className="pb-3">
          <ShelfTitle>{_copy('music.searchStages', { defaultValue: 'Stages' })}</ShelfTitle>
          <div className="flex gap-2 overflow-x-auto px-0.5 scrollbar-hide">
            {stages.map((space) => (
              <button key={space.id} type="button" onClick={() => openStage(space)} className="w-40 shrink-0 overflow-hidden rounded-xl border border-white/[0.12] bg-white/[0.03] text-left">
                <span className="relative block">
                  <StageCoverArt src={space.cover_image_url} title={space.title} stage={space} />
                  {space.status === 'live' ? (
                    <span className="absolute left-1.5 top-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">{_copy('music.searchLive', { defaultValue: 'Live' })}</span>
                  ) : space.status === 'scheduled' ? (
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">{_copy('music.searchUpcoming', { defaultValue: 'Upcoming' })}</span>
                  ) : null}
                </span>
                <span className="block truncate px-2 pt-1.5 text-xs font-semibold text-white">{space.title}</span>
                <span className="block truncate px-2 pb-2 text-[11px] text-zinc-500">@{space.host_username || String(space.host_wallet_address || '').slice(0, 6)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {stations.length > 0 && (
        <div data-music-search-radio className="pb-3">
          <ShelfTitle>{_copy('music.searchRadioStations', { defaultValue: 'Radio stations' })}</ShelfTitle>
          <div className="flex gap-2 overflow-x-auto px-0.5 scrollbar-hide">
            {stations.map((station) => {
              const onAir = isPlaying && currentStation?.stationuuid === station.stationuuid;
              const genre = getPrimaryTags(station.tags, 1)[0];
              return (
                <button key={station.stationuuid} type="button" onClick={() => toggleStation(station)} className={cn('w-28 shrink-0 overflow-hidden rounded-xl border bg-white/[0.03] text-left', onAir ? 'border-white/50' : 'border-white/[0.12]')}>
                  <span className="relative flex aspect-square items-center justify-center bg-white/[0.06]">
                    <span className="text-2xl font-bold text-white/60">{station.name.trim().charAt(0).toUpperCase()}</span>
                    {station.favicon && (
                      <img src={station.favicon} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    )}
                    <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: '#fff', color: '#000' }}>
                      {onAir ? <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: '#000' }} /> : <svg aria-hidden viewBox="0 0 10 10" className="ml-0.5 h-2.5 w-2.5"><path d="M2 1l7 4-7 4z" style={{ fill: '#000' }} /></svg>}
                    </span>
                  </span>
                  <span className="block truncate px-2 pt-1.5 text-xs font-semibold text-white">{station.name.trim()}</span>
                  <span className="block truncate px-2 pb-2 text-[11px] text-zinc-500">{[genre, station.countrycode].filter(Boolean).join(' · ') || _copy('music.searchRadio', { defaultValue: 'Radio' })}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showMusicTitle && <ShelfTitle>{_copy('music.searchMusic', { defaultValue: 'Music' })}</ShelfTitle>}
    </>
  );
}

/**
 * Cinematic Music (System theme, phones)
 * ======================================
 * The Music tab as a radio hero and a chart: one big "on air" station with a
 * Listen button, a row of chips, then a numbered list with thin lines between
 * rows. Desktop and the other themes keep the carousels in MusicFeed.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart, Headphones, Loader2, Pause, Play, Radio, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRadioPlayer } from '@/hooks/use-radio-player';
import { getPrimaryTags, type RadioStation } from '@/lib/api/radio-browser';
import { getCustomLogo } from '@/components/app/radio/RadioStationCard';
import { StagesCarousel } from '@/components/app/music/StagesCarousel';
import { openStageModal } from '@/contexts/StageContext';
import { searchNFTs, type DeHubNFT } from '@/lib/api/dehub';
import { formatViews } from '@/lib/feed-utils';
import { isBlockedCreator, isMusicFeedItem, mapNFTToVideoItem } from '@/lib/music-feed-items';
import type { VideoItem } from '@/types/feed.types';

type Chip = 'top' | 'radio' | 'stages' | 'new';

const CHIPS: { key: Chip; label: string }[] = [
  { key: 'top', label: 'Top 50' },
  { key: 'radio', label: 'Radio' },
  { key: 'stages', label: 'Stages' },
  { key: 'new', label: 'New' },
];

const LIKED_STATIONS_KEY = 'dehub.likedStations';

function readLikedStations(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LIKED_STATIONS_KEY) || '[]');
  } catch {
    return [];
  }
}

function stationLogo(station: RadioStation): string | undefined {
  return getCustomLogo(station.name) || station.favicon || undefined;
}

// ============================================================================
// HERO
// ============================================================================

function RadioHero({ station }: { station: RadioStation }) {
  const { currentStation, isPlaying, isLoading, play, togglePlayPause } = useRadioPlayer();
  const [liked, setLiked] = useState(() => readLikedStations().includes(station.stationuuid));
  const [logoFailed, setLogoFailed] = useState(false);

  const isCurrent = currentStation?.stationuuid === station.stationuuid;
  const playing = isCurrent && isPlaying;
  const loading = isCurrent && isLoading;
  const logo = logoFailed ? undefined : stationLogo(station);
  const tags = getPrimaryTags(station.tags, 3);

  const listen = () => (isCurrent ? togglePlayPause() : play(station));

  const toggleLike = () => {
    const next = !liked;
    setLiked(next);
    try {
      const ids = readLikedStations().filter((id) => id !== station.stationuuid);
      if (next) ids.push(station.stationuuid);
      localStorage.setItem(LIKED_STATIONS_KEY, JSON.stringify(ids));
    } catch {
      // Private mode: the heart still toggles for this visit.
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/app`;
    const text = `Listening to ${station.name} on DeHub`;
    try {
      if (navigator.share) {
        await navigator.share({ title: station.name, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success('Link copied');
    } catch {
      // Share sheet dismissed.
    }
  };

  return (
    <section data-music-hero className="relative -mx-2 overflow-hidden bg-zinc-950" style={{ height: 'min(118vw, 460px)' }}>
      {logo && (
        <img
          src={logo}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl saturate-150"
          onError={() => setLogoFailed(true)}
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.35)_0%,rgba(0,0,0,0)_35%,rgba(0,0,0,.88)_100%)]" />

      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] flex justify-center">
        <div className="h-36 w-36 overflow-hidden rounded-xl bg-zinc-800 shadow-[0_12px_40px_rgba(0,0,0,.55)] ring-1 ring-white/15">
          {logo ? (
            <img src={logo} alt={station.name} className="h-full w-full object-cover" onError={() => setLogoFailed(true)} />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Radio className="h-12 w-12 text-zinc-500" />
            </div>
          )}
        </div>
      </div>

      <div className="absolute inset-x-3.5 bottom-4 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white [text-shadow:none]">
            <Radio className="h-3 w-3" strokeWidth={2.5} /> On air
          </span>
          {station.clickcount > 0 && (
            <span className="inline-flex items-center gap-1 text-zinc-200">
              <Headphones className="h-3 w-3" /> {formatViews(station.clickcount).replace(' views', '')} plays today
            </span>
          )}
        </div>
        <h2 className="mt-2 text-[26px] font-bold leading-tight text-white line-clamp-2">{station.name}</h2>
        {tags.length > 0 && <p className="mt-1 text-[13px] capitalize text-zinc-200">{tags.join(' · ')}</p>}
        <div className="mt-3.5 flex items-center gap-2.5">
          <button
            onClick={listen}
            className="flex h-11 items-center gap-2 rounded-[10px] px-[18px] font-bold [text-shadow:none] active:scale-95 transition-transform"
            style={{ background: '#fff', color: '#000' }}
          >
            {loading ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            ) : playing ? (
              <Pause className="h-[18px] w-[18px] fill-current" />
            ) : (
              <Play className="h-[18px] w-[18px] fill-current" />
            )}
            {playing ? 'Pause' : 'Listen'}
          </button>
          <button
            onClick={toggleLike}
            aria-label={liked ? 'Unlike station' : 'Like station'}
            aria-pressed={liked}
            data-cinematic-glass
            className="flex h-11 w-11 items-center justify-center rounded-[10px] text-white"
          >
            <Heart className={cn('h-5 w-5', liked && 'fill-red-500 text-red-500')} />
          </button>
          <button onClick={share} aria-label="Share station" data-cinematic-glass className="flex h-11 w-11 items-center justify-center rounded-[10px] text-white">
            <Share2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// CHART
// ============================================================================

function ChartRow({ rank, image, title, subtitle, trailing, onClick, active }: {
  rank: number;
  image?: string;
  title: string;
  subtitle: string;
  trailing?: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 border-b border-white/[0.12] px-3.5 py-2.5 text-left active:bg-white/5">
      <span className={cn('w-[22px] shrink-0 text-center text-base font-bold', rank <= 3 ? 'text-white' : 'text-zinc-500')}>{rank}</span>
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
        {image && !failed ? (
          <img src={image} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
        ) : (
          <span className="flex h-full w-full items-center justify-center"><Radio className="h-5 w-5 text-zinc-500" /></span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[15px] font-semibold', active ? 'text-[rgb(var(--tint-accent,255_255_255))]' : 'text-white')}>{title}</span>
        <span className="mt-0.5 block truncate text-xs text-zinc-400">{subtitle}</span>
      </span>
      {trailing && <span className="shrink-0 text-xs text-zinc-400">{trailing}</span>}
    </button>
  );
}

function ChartSkeleton() {
  return (
    <div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-white/[0.12] px-3.5 py-2.5">
          <span className="h-4 w-[22px] rounded bg-white/5" />
          <span className="h-12 w-12 rounded-lg bg-white/5 animate-pulse" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-3.5 w-2/3 rounded bg-white/5 animate-pulse" />
            <span className="block h-3 w-1/3 rounded bg-white/5 animate-pulse" />
          </span>
        </div>
      ))}
    </div>
  );
}

function useMusicChart(mode: 'trending' | 'new', blockedAddresses?: Set<string>, enabled = true) {
  const { data, isLoading } = useQuery({
    queryKey: ['music-chart', mode],
    queryFn: async () => {
      const res = await searchNFTs({ category: 'Music', unit: 50, sortMode: mode });
      return (res.data || []) as DeHubNFT[];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
  const items = useMemo<VideoItem[]>(
    () => (data || []).filter((nft) => isMusicFeedItem(nft) && !isBlockedCreator(nft, blockedAddresses)).map((nft, i) => mapNFTToVideoItem(nft, i)),
    [data, blockedAddresses],
  );
  return { items, isLoading };
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-baseline justify-between px-3.5 pb-2 pt-5">
      <h3 className="text-lg font-bold text-white">{title}</h3>
      {action && (
        <button onClick={onAction} className="text-[13px] font-medium text-zinc-400">{action}</button>
      )}
    </div>
  );
}

// ============================================================================
// MAIN
// ============================================================================

export function CinematicMusic({ radioStations, blockedAddresses }: {
  radioStations: RadioStation[];
  blockedAddresses?: Set<string>;
}) {
  const navigate = useNavigate();
  const [chip, setChip] = useState<Chip>('top');
  const { currentStation, isPlaying, play, togglePlayPause } = useRadioPlayer();

  const top = useMusicChart('trending', blockedAddresses, chip === 'top');
  const fresh = useMusicChart('new', blockedAddresses, chip === 'new');

  // The station on air in the hero: whatever is playing, else the first pick.
  const heroStation = (isPlaying && currentStation) || radioStations[0];

  const openPost = (item: VideoItem) => navigate(`/app/post/${item.id}`, { state: { fromFeed: true } });

  const renderTracks = (list: { items: VideoItem[]; isLoading: boolean }, title: string) => (
    <>
      <SectionTitle title={title} action={list.items.length > 0 ? 'Play all' : undefined} onAction={() => list.items[0] && openPost(list.items[0])} />
      <div className="-mx-2 border-t border-white/[0.12]">
        {list.isLoading ? (
          <ChartSkeleton />
        ) : list.items.length === 0 ? (
          <p className="px-3.5 py-8 text-center text-sm text-zinc-500">Nothing here yet.</p>
        ) : (
          list.items.map((item, i) => (
            <ChartRow
              key={item.id}
              rank={i + 1}
              image={item.thumbnail}
              title={item.title || 'Untitled'}
              subtitle={`${item.channel}${item.views ? ` · ${item.views}` : ''}`}
              trailing={item.duration && item.duration !== '0:00' ? item.duration : undefined}
              onClick={() => openPost(item)}
            />
          ))
        )}
      </div>
    </>
  );

  return (
    <div data-cinematic-music className="pb-32">
      {heroStation ? (
        <RadioHero key={heroStation.stationuuid} station={heroStation} />
      ) : (
        <div className="-mx-2 animate-pulse bg-zinc-900" style={{ height: 'min(118vw, 460px)' }} />
      )}

      <div data-no-swipe className="-mx-2 mt-3.5 flex gap-2 overflow-x-auto px-3.5 scrollbar-hide">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            onClick={() => setChip(c.key)}
            data-cinematic-glass={chip === c.key ? undefined : ''}
            aria-pressed={chip === c.key}
            className="h-9 shrink-0 rounded-xl px-4 text-sm font-semibold text-white transition-colors"
            style={chip === c.key ? { background: '#fff', color: '#000' } : undefined}
          >
            {c.label}
          </button>
        ))}
      </div>

      {chip === 'top' && renderTracks(top, 'Top 50')}
      {chip === 'new' && renderTracks(fresh, 'New releases')}
      {chip === 'radio' && (
        <>
          <SectionTitle title="Radio stations" />
          <div className="-mx-2 border-t border-white/[0.12]">
            {radioStations.length === 0 ? (
              <ChartSkeleton />
            ) : (
              radioStations.map((station, i) => {
                const current = currentStation?.stationuuid === station.stationuuid;
                return (
                  <ChartRow
                    key={station.stationuuid}
                    rank={i + 1}
                    image={stationLogo(station)}
                    title={station.name}
                    subtitle={getPrimaryTags(station.tags).join(', ') || 'Radio'}
                    active={current && isPlaying}
                    trailing={current && isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
                    onClick={() => (current ? togglePlayPause() : play(station))}
                  />
                );
              })
            )}
          </div>
        </>
      )}
      {chip === 'stages' && (
        <div className="pt-5">
          <StagesCarousel onOpenStages={() => openStageModal('browse')} />
        </div>
      )}
    </div>
  );
}

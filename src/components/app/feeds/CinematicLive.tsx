/**
 * Cinematic Live (System theme, phones)
 * =====================================
 * Who is live now as a row of avatars, the top games as a row of box art,
 * then every stream in a two-column grid, with Stages and TV underneath.
 * Desktop and the other themes keep the carousels in LiveFeed.
 */

import { useMemo, useState } from 'react';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Eye, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StagesCarousel } from '@/components/app/music/StagesCarousel';
import { TVPreviewCard } from '@/components/app/tv/TVPreviewCard';
import { SwipeableCarousel } from '@/components/app/SwipeableCarousel';
import { openStageModal } from '@/contexts/StageContext';
import { LIVE_GAMES, streamMatchesGame } from '@/constants/live-games';
import type { LiveStream } from '@/types/feed.types';
import type { TVChannel } from '@/lib/api/live-tv';

function Avatar({ src, name, className }: { src?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} alt={name} loading="lazy" className={cn('object-cover', className)} onError={() => setFailed(true)} />;
  }
  return (
    <span className={cn('flex items-center justify-center bg-zinc-700 text-sm font-semibold text-white', className)}>
      {name[0]?.toUpperCase() || '?'}
    </span>
  );
}

function LiveBadge({ className }: { className?: string }) {
  return (
    <span className={cn('rounded-[5px] bg-red-500 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white', className)}>
      Live
    </span>
  );
}

function SectionTitle({ title, meta, onMeta }: { title: string; meta?: string; onMeta?: () => void }) {
  return (
    <div className="flex items-baseline justify-between px-1.5 pb-2.5 pt-5">
      <h3 className="text-lg font-bold text-white">{title}</h3>
      {meta && (
        onMeta ? (
          <button onClick={onMeta} className="flex items-center gap-0.5 text-[13px] font-medium text-zinc-400">
            {meta} <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <span className="text-[13px] text-zinc-400">{meta}</span>
        )
      )}
    </div>
  );
}

function GameCover({ name, image, active, dimmed, onClick }: {
  name: string;
  image: string;
  active: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <button
      onClick={onClick}
      aria-label={name}
      aria-pressed={active}
      className={cn(
        'relative w-[92px] shrink-0 overflow-hidden rounded-[10px] bg-zinc-900 transition-opacity',
        active && 'ring-2 ring-white ring-offset-2 ring-offset-black',
        dimmed && 'opacity-45',
      )}
    >
      <img src={image} alt={name} loading="lazy" className="aspect-[3/4] w-full object-cover" onError={() => setFailed(true)} />
    </button>
  );
}

function StreamTile({ stream, onClick }: { stream: LiveStream; onClick: () => void }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const hasThumb = !!stream.thumbnail && !thumbFailed;
  return (
    <button onClick={onClick} className="min-w-0 text-left">
      <span className="relative block aspect-video overflow-hidden rounded-[10px] bg-zinc-900">
        {hasThumb ? (
          <img src={stream.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setThumbFailed(true)} />
        ) : (
          <>
            {stream.avatar && <img src={stream.avatar} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-xl" />}
            <span className="absolute inset-0 flex items-center justify-center">
              <Avatar src={stream.avatar} name={stream.streamer} className="h-10 w-10 rounded-lg ring-2 ring-white/30" />
            </span>
          </>
        )}
        {stream.isLive && <LiveBadge className="absolute left-1.5 top-1.5" />}
        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-[5px] bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          <Eye className="h-2.5 w-2.5" /> {stream.viewers}
        </span>
      </span>
      <span className="mt-1.5 flex gap-1.5">
        <Avatar src={stream.avatar} name={stream.streamer} className="h-[22px] w-[22px] shrink-0 rounded-md" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-white">{stream.title || `${stream.streamer} is live`}</span>
          <span className="block truncate text-[11px] text-zinc-400">{stream.streamer} · {stream.game}</span>
        </span>
      </span>
    </button>
  );
}

export function CinematicLive({ streams, isLoading, tvChannels, emptyState, showFilters = false }: {
  streams: LiveStream[];
  isLoading: boolean;
  tvChannels: TVChannel[];
  emptyState: React.ReactNode;
  showFilters?: boolean;
}) {
  const navigate = useNavigate();
  const [gameId, setGameId] = useState<string | null>(null);
  const game = LIVE_GAMES.find((g) => g.id === gameId) || null;

  const openStream = (stream: LiveStream) => navigate(`/app/post/${stream.id}`, { state: { fromFeed: true } });

  // One ring per creator who is on air right now.
  const liveCreators = useMemo(() => {
    const seen = new Set<string>();
    return streams.filter((s) => {
      if (!s.isLive || seen.has(s.streamer)) return false;
      seen.add(s.streamer);
      return true;
    });
  }, [streams]);

  const shown = useMemo(
    () => (game ? streams.filter((s) => streamMatchesGame(s.game, game)) : streams),
    [streams, game],
  );
  const liveCount = streams.filter((s) => s.isLive).length;

  return (
    <div data-cinematic-live className={cn('pb-32', showFilters ? 'pt-[calc(env(safe-area-inset-top,0px)+5.75rem)]' : 'pt-[calc(env(safe-area-inset-top,0px)+3.75rem)]')}>
      {showFilters && <div data-no-swipe data-feed-filter-panel className="mb-3 rounded-[15px] px-2 py-3">
        <GlassFilterRow<string>
          items={[{ key: 'all', label: 'All' }, ...LIVE_GAMES.map(g => ({ key: g.id, label: g.name }))]}
          activeKey={gameId ?? 'all'} onSelect={key => setGameId(key === 'all' ? null : key)} />
      </div>}
      {liveCreators.length > 0 && (
        <SwipeableCarousel>
          <div data-no-swipe className="-mx-2 flex gap-3 overflow-x-auto px-3.5 pb-1 scrollbar-hide">
            {liveCreators.map((s) => (
              <button key={s.id} onClick={() => openStream(s)} className="w-[66px] shrink-0 text-center">
                <span className="relative mx-auto block h-[62px] w-[62px] rounded-[14px] bg-[linear-gradient(135deg,#ef4444,#f97316)] p-[2px]">
                  <Avatar src={s.avatar} name={s.streamer} className="h-full w-full rounded-xl border-2 border-black" />
                  <LiveBadge className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 text-[9px]" />
                </span>
                <span className="mt-2.5 block truncate text-[11px] text-zinc-300">{s.streamer}</span>
              </button>
            ))}
          </div>
        </SwipeableCarousel>
      )}

      <SwipeableCarousel>
        <div data-no-swipe data-live-games className="-mx-2 mt-4 flex gap-2.5 overflow-x-auto px-3.5 py-1 scrollbar-hide">
          {LIVE_GAMES.map((g) => (
            <GameCover
              key={g.id}
              name={g.name}
              image={g.image}
              active={gameId === g.id}
              dimmed={!!gameId && gameId !== g.id}
              onClick={() => setGameId((cur) => (cur === g.id ? null : g.id))}
            />
          ))}
        </div>
      </SwipeableCarousel>

      <SectionTitle
        title={game ? game.name : 'Live streams'}
        meta={game ? 'Show all' : liveCount > 0 ? `${liveCount} ${liveCount === 1 ? 'stream' : 'streams'}` : undefined}
        onMeta={game ? () => setGameId(null) : undefined}
      />
      {isLoading ? (
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-3.5 px-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-video animate-pulse rounded-[10px] bg-white/5" />
              <div className="mt-1.5 h-3 w-3/4 animate-pulse rounded bg-white/5" />
            </div>
          ))}
        </div>
      ) : streams.length === 0 ? (
        emptyState
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <Radio className="h-8 w-8 text-zinc-600" />
          <p className="text-sm text-zinc-400">No one is streaming {game?.name} right now.</p>
          <button onClick={() => setGameId(null)} data-cinematic-glass className="mt-1 h-9 rounded-[10px] px-4 text-sm font-semibold text-white">
            See all streams
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-3.5 px-1.5">
          {shown.map((s) => (
            <StreamTile key={s.id} stream={s} onClick={() => openStream(s)} />
          ))}
        </div>
      )}

      <div className="mt-6 border-t border-white/[0.12] pt-4 -mx-2 px-2">
        <StagesCarousel onOpenStages={() => openStageModal('browse')} />
      </div>

      {tvChannels.length > 0 && (
        <div className="mt-2">
          <SectionTitle title="TV" meta="Show all" onMeta={() => navigate('/app/tv')} />
          <SwipeableCarousel>
            <div className="-mx-2 flex gap-3 overflow-x-auto px-3.5 scrollbar-hide">
              {tvChannels.map((channel) => (
                <div key={channel.id} className="w-48 shrink-0">
                  <TVPreviewCard channel={channel} />
                </div>
              ))}
            </div>
          </SwipeableCarousel>
        </div>
      )}
    </div>
  );
}

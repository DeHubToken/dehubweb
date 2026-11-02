/**
 * Feed Search Results
 * ===================
 * The grid the feed turns into while its pill is a search box. Results stay
 * inside the feed they were searched from and use that feed's toggles:
 * photos as a mosaic, videos as small 16:10 tiles, shorts as 9:16 tiles that
 * open the swipe viewer, music as cover tiles, and Home as everything with
 * matching people first.
 *
 * @module components/app/feeds/FeedSearchResults
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation as _useCopy } from 'react-i18next';
import Play from '@/components/ui/cut-icons/play';
import { AppState } from '@/components/app/AppState';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useFeedFilterValues } from '@/hooks/use-persisted-feed-filter';
import { useUnifiedFeed, mapToImagePost, mapToVideoItem, type UnifiedFeedItem } from '@/hooks/use-unified-feed';
import { useDeHubSearch, mapAccountToCreator } from '@/hooks/use-dehub-search';
import { feedSearchParams, type FeedSearchTab } from '@/lib/feed-search';
import { FEED_TABS } from '@/constants/app.constants';
import { mapToShortVideo } from '@/lib/short-video';
import { MusicSearchShelves, useMusicSearchShelves } from '@/components/app/feeds/MusicSearchShelves';

const ShortsViewer = lazy(() =>
  import('@/components/app/cards/ShortsViewer').then(m => ({ default: m.ShortsViewer })),
);

const PAGE_SIZE = 24;

/** Waits for typing to pause so each key press is not a request. */
function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function useLoadMore(onMore: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const onMoreRef = useRef(onMore);
  onMoreRef.current = onMore;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onMoreRef.current();
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}

/** Fixed bar heights, so the waveform drawn on audio covers is the same every render. */
const WAVE = [38, 62, 45, 80, 55, 92, 48, 70, 35, 66, 84, 52, 40, 74, 58, 30];

const isAudio = (item: UnifiedFeedItem) => item.postType === 'feed-audio' || item.postType === 'audio';

/** Most audio posts have no cover: show the creator's picture, else a tint of their own. */
function audioCover(item: UnifiedFeedItem, index: number): { src: string; tint: string } {
  const p = mapToImagePost(item, index);
  const src = p.image || (p.avatar && p.avatar !== 'user' ? p.avatar : '');
  const hue = (Number(item.tokenId) * 47) % 360;
  return { src, tint: `linear-gradient(140deg, hsl(${hue} 55% 38%), hsl(${(hue + 60) % 360} 60% 18%))` };
}

function Wave({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('flex h-4 items-end gap-[2px]', className)}>
      {WAVE.map((h, k) => <i key={k} className="flex-1 rounded-[1px] bg-white/90" style={{ height: `${h}%` }} />)}
    </span>
  );
}

function TypeBadge({ postType }: { postType: UnifiedFeedItem['postType'] }) {
  const tab = postType === 'video' ? 'videos' : postType === 'feed-images' ? 'images' : postType === 'feed-audio' || postType === 'audio' ? 'music' : postType === 'live' ? 'live' : null;
  const Icon = tab ? FEED_TABS.find((t) => t.value === tab)?.icon : null;
  if (!Icon) return null;
  return (
    <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-black/60 text-white">
      <Icon className="h-3 w-3" />
    </span>
  );
}

function ShimmerGrid({ tab }: { tab: FeedSearchTab }) {
  const tile = 'rounded-lg bg-white/[0.06] animate-pulse';
  if (tab === 'shorts') {
    return (
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className={cn(tile, 'aspect-[9/16]')} />)}
      </div>
    );
  }
  if (tab === 'videos') {
    return (
      <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}><div className={cn(tile, 'aspect-[16/10]')} /><div className={cn(tile, 'mt-1.5 h-2.5 w-4/5')} /></div>
        ))}
      </div>
    );
  }
  if (tab === 'music') {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className={cn(tile, 'aspect-square rounded-xl')} />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
      {Array.from({ length: 9 }, (_, i) => <div key={i} className={cn(tile, 'aspect-square', i === 0 && 'col-span-2 row-span-2')} />)}
    </div>
  );
}

export function FeedSearchResults(props: { tab: FeedSearchTab; query: string }) {
  return (
    <>
      {/* Room for the docked search lens on the colour themes (feed-search.css). */}
      <div data-feed-lens-gap aria-hidden="true" />
      <FeedSearchResultsBody {...props} />
    </>
  );
}

function FeedSearchResultsBody(props: { tab: FeedSearchTab; query: string }) {
  // Music also searches stages and radio, which need the stage and radio providers.
  return props.tab === 'music' ? <MusicFeedSearchResultsBody {...props} /> : <FeedSearchResultsGrid {...props} />;
}

function MusicFeedSearchResultsBody({ tab, query }: { tab: FeedSearchTab; query: string }) {
  const extras = useMusicSearchShelves(useDebounced(query, 250));
  return <FeedSearchResultsGrid tab={tab} query={query} extras={extras} />;
}

type MusicExtras = ReturnType<typeof useMusicSearchShelves>;

function FeedSearchResultsGrid({ tab, query, extras }: { tab: FeedSearchTab; query: string; extras?: MusicExtras }) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const { walletAddress } = useAuth();
  const filters = useFeedFilterValues(tab);
  const q = useDebounced(query, 250);
  const typing = q !== query;
  const params = useMemo(() => feedSearchParams(tab, filters, q), [tab, filters, q]);

  // Music Videos searches videos, so it gets the video tiles.
  const layout: FeedSearchTab = tab === 'shorts' ? 'shorts' : params.postType === 'video' ? 'videos' : tab;
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const feed = useUnifiedFeed({ ...params, limit: PAGE_SIZE, enabled: q.length > 0 });
  const people = useDeHubSearch({
    query: q,
    type: 'accounts',
    address: walletAddress || undefined,
    enabled: tab === 'home',
    limit: 10,
    minQueryLength: 2,
  });

  // Shorts leaves pay-per-view out of its feed, so its search does too.
  const items = useMemo(() => {
    const all = feed.data?.pages.flatMap((p) => p.items || []) ?? [];
    return tab === 'shorts' ? all.filter((item) => !item.streamInfo?.isPayPerView) : all;
  }, [feed.data, tab]);
  const shorts = useMemo(() => (tab === 'shorts' ? items.map((item, i) => mapToShortVideo(item, i)) : []), [items, tab]);
  const accounts = useMemo(
    () => (people.data?.pages.flatMap((p) => p.accounts) ?? []).map(mapAccountToCreator).slice(0, 10),
    [people.data],
  );
  const moreRef = useLoadMore(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  }, items.length > 0);

  const open = (item: UnifiedFeedItem) => navigate(`/app/post/${item.tokenId}`, { state: { fromFeed: true } });
  const feedLabel = FEED_TABS.find((t) => t.value === tab)?.label ?? '';
  // Loading means "nothing to show yet for these words": while the next words
  // are on their way the previous results stay up, dimmed.
  const extraCount = (extras?.stages.length ?? 0) + (extras?.stations.length ?? 0);
  const loading = (feed.isLoading && extraCount === 0) || (typing && items.length === 0 && extraCount === 0);
  const stale = typing || (feed.isFetching && !feed.isFetchingNextPage);

  if (loading) {
    return (
      <div data-feed-search-results className="px-0.5 pt-1">
        <p className="px-1 pb-2 text-xs text-zinc-400">{_copy("copy.90f1afe66801", { defaultValue: "Searching for “{{query}}”…", query })}</p>
        <ShimmerGrid tab={layout} />
      </div>
    );
  }

  if (feed.isError && items.length === 0 && extraCount === 0) {
    return (
      <AppState
        icon="search"
        kind="error"
        size="section"
        title={_copy("copy.96d7bff86b44", { defaultValue: "Search could not load" })}
        description={_copy("copy.481859b689b0", { defaultValue: "Check your connection and try again." })}
        primaryAction={{ label: _copy("copy.d8b8392e2c54", { defaultValue: "Try again" }), onClick: () => void feed.refetch() }}
      />
    );
  }

  if (extras?.isLoading && items.length === 0 && extraCount === 0) {
    return (
      <div data-feed-search-results className="px-0.5 pt-1">
        <p className="px-1 pb-2 text-xs text-zinc-400">{_copy("copy.90f1afe66801", { defaultValue: "Searching for “{{query}}”…", query })}</p>
        <ShimmerGrid tab={layout} />
      </div>
    );
  }

  if (items.length === 0 && accounts.length === 0 && extraCount === 0) {
    return (
      <AppState
        icon="search"
        size="section"
        title={_copy("copy.ef557404f465", { defaultValue: "No results for “{{query}}”", query: q })}
        description={tab === 'home'
          ? _copy("copy.d7b559f2d8c6", { defaultValue: "Try other words, or change the filters." })
          : _copy("copy.35034aa59bd3", { defaultValue: "Nothing in {{feed}} matched. Try other words or search everything.", feed: feedLabel })}
        primaryAction={tab === 'home' ? undefined : {
          label: _copy("copy.415155739590", { defaultValue: "Search everything" }),
          onClick: () => window.dispatchEvent(new CustomEvent('home-feed-select', { detail: 'home' })),
        }}
      />
    );
  }

  return (
    <div data-feed-search-results className={cn('px-0.5 pt-1 transition-opacity duration-150', stale && 'opacity-60')}>
      {tab === 'home' && accounts.length > 0 && (
        <div className="pb-3">
          <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{_copy("copy.7db20897053b", { defaultValue: "People" })}</p>
          <div className="flex gap-3 overflow-x-auto px-1 scrollbar-hide">
            {accounts.map((a) => (
              <button key={a.id} type="button" onClick={() => navigate(`/${a.handle.replace('@', '')}`)} className="flex w-14 shrink-0 flex-col items-center gap-1">
                <span className="h-12 w-12 overflow-hidden rounded-full border border-white/20 bg-white/10">
                  {a.avatar && <img src={a.avatar} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </span>
                <span className="w-full truncate text-center text-[10px] text-zinc-300">{a.handle}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {extras && <MusicSearchShelves stages={extras.stages} stations={extras.stations} showMusicTitle={extraCount > 0 && items.length > 0} />}

      {tab === 'home' && items.length > 0 && (
        <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{_copy("copy.a80811cf6889", { defaultValue: "Posts" })}</p>
      )}

      {layout === 'shorts' ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {shorts.map((short, i) => (
            <button key={short.id} type="button" data-media-tile data-media-scrim onClick={() => setViewerIndex(i)} className="relative aspect-[9/16] min-w-0 overflow-hidden rounded-lg bg-white/[0.06] text-left">
              {short.thumbnail && <img src={short.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />}
              <span className="absolute inset-0 bg-gradient-to-b from-transparent from-55% to-black/75" />
              <span className="absolute bottom-1.5 left-1.5 right-1.5 block truncate text-[10px] font-semibold text-white">@{short.creatorUsername || short.username}</span>
            </button>
          ))}
        </div>
      ) : layout === 'videos' ? (
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3">
          {items.map((item, i) => {
            const v = mapToVideoItem(item, i);
            return (
              <button key={item.tokenId} type="button" onClick={() => open(item)} className="min-w-0 text-left">
                <span className="relative block aspect-[16/10] overflow-hidden rounded-lg bg-white/[0.06]">
                  {v.thumbnail && <img src={v.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  {v.duration && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">{v.duration}</span>}
                </span>
                <span className="mt-1 block truncate text-xs font-semibold text-white">{v.title}</span>
                <span className="block truncate text-[11px] text-zinc-500">@{v.channel}</span>
              </button>
            );
          })}
        </div>
      ) : layout === 'music' ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((item, i) => {
            const p = mapToImagePost(item, i);
            const cover = audioCover(item, i);
            return (
              <button key={item.tokenId} type="button" onClick={() => open(item)} className="min-w-0 overflow-hidden rounded-xl border border-white/[0.12] bg-white/[0.03] text-left">
                <span className="relative block aspect-square" style={{ background: cover.tint }}>
                  {cover.src && <img src={cover.src} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  <span className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-black/70" />
                  <Wave className="absolute bottom-2 left-2 right-9" />
                  <span className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-black">
                    <Play className="h-3 w-3 fill-current" />
                  </span>
                </span>
                <span className="block px-2 pt-1.5 truncate text-xs font-semibold text-white">{p.title || p.caption}</span>
                <span className="block px-2 pb-2 truncate text-[11px] text-zinc-500">@{p.username}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
          {items.map((item, i) => {
            const p = mapToImagePost(item, i);
            const audio = isAudio(item) && !p.image;
            const isText = !audio && (item.postType === 'feed-simple' || !p.image);
            const big = i % 9 === 0 && !isText && !audio;
            return (
              <button
                key={item.tokenId}
                type="button"
                onClick={() => open(item)}
                className={cn('relative aspect-square overflow-hidden rounded-lg bg-white/[0.06] text-left', big && 'col-span-2 row-span-2')}
              >
                {audio ? (
                  <span className="relative block h-full" style={{ background: audioCover(item, i).tint }}>
                    {audioCover(item, i).src && <img src={audioCover(item, i).src} alt="" className="h-full w-full object-cover opacity-80" loading="lazy" />}
                    <Wave className="absolute bottom-2 left-2 right-2" />
                  </span>
                ) : isText ? (
                  <span className="block h-full border border-white/[0.12] p-2 text-[11px] leading-snug text-zinc-200 line-clamp-6">
                    <b className="block text-[10px] text-zinc-500">@{p.username}</b>
                    {p.title || p.caption}
                  </span>
                ) : (
                  <img src={p.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
                {tab === 'home' && !isText && <TypeBadge postType={item.postType} />}
              </button>
            );
          })}
        </div>
      )}
      <div ref={moreRef} className="h-10" />
      {tab === 'shorts' && (
        <Suspense fallback={null}>
          <AnimatePresence>
            {viewerIndex !== null && (
              <ShortsViewer
                shorts={shorts}
                initialIndex={viewerIndex}
                onClose={() => setViewerIndex(null)}
                onLoadMore={() => { if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage(); }}
                hasMore={feed.hasNextPage ?? false}
                isLoadingMore={feed.isFetchingNextPage}
              />
            )}
          </AnimatePresence>
        </Suspense>
      )}
    </div>
  );
}

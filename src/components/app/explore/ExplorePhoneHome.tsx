import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Explore on phones: the clean list
 * =================================
 * What Explore shows under the search pill on phones before anyone types.
 * No bentos: one gutter, titled sections split by a hairline, each with a
 * quiet "See all" on the right.
 *
 *   Category words  For you · General · Funny ... (lit one underlined)
 *   Recent          your last searches (signed in, only when there are some)
 *   Trending        top hashtags, numbered, 5 then See all
 *   Live now        who is broadcasting (only when someone is)
 *   Top tokens      most searched tickers, two columns
 *   Follow suggestions / New members   one line per person with Follow
 *
 * Desktop keeps its bentos; ExplorePage renders this only under the phone pill.
 *
 * @module components/app/explore/ExplorePhoneHome
 */
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useStableNavigate } from '@/hooks/use-stable-navigate';
import { cn } from '@/lib/utils';
import { ExploreListSection } from '@/components/app/explore/ExploreListSection';
import { TickerLogo } from '@/components/app/TickerLogo';
import { ThemedIcon } from '@/components/app/war/WarHudIcon';
import { LiveRipple } from '@/components/app/LiveRipple';
import { MobileWhoToFollowCarousel } from '@/components/app/mobile';
import { NewMembersCarousel } from '@/components/app/NewMembersCarousel';
import { useTrendingCategories } from '@/hooks/use-trending-categories';
import { getTopTickers } from '@/lib/ticker-search-tracker';
import { useStage, useLiveSpaces } from '@/contexts/StageContext';
import { useDeHubLive, DEFAULT_DEHUB_LIVE_QUERY_OPTIONS, mapApiLiveStreamToLocal } from '@/hooks/use-dehub-feed';
import { useIsMobile } from '@/hooks/use-mobile';
import type { DeHubCategory } from '@/lib/api/dehub';
import ChevronRight from '@/components/ui/cut-icons/next';
import X from '@/components/ui/cut-icons/close';
import Search from '@/components/ui/cut-icons/search';
import Radio from '@/components/ui/cut-icons/live';

const TOPICS_COLLAPSED = 5;
const TOPICS_EXPANDED = 10;
const TOKENS_COLLAPSED = 6;
const TOKENS_EXPANDED = 10;
const RECENT_COLLAPSED = 4;
const LIVE_COLLAPSED = 3;

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/** Category words under the pill. Null is "For you" (no category). */
export function ExploreCategoryWords({
  categories,
  value,
  onChange,
}: {
  categories: DeHubCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { t: _copy } = _useCopy();
  const items = [{ id: null as string | null, name: _copy('copy.explore.forYou', { defaultValue: 'For you' }) }, ...categories.filter((c) => c.name.toLowerCase() !== 'all').map((c) => ({ id: c.id as string | null, name: c.name }))];
  return (
    <div data-explore-category-words data-fade-edges className="border-b border-zinc-800/60">
      <div className="flex gap-5 overflow-x-auto px-1 scrollbar-hide" role="tablist">
        {items.map((c) => {
          const active = value === c.id;
          return (
            <button
              key={c.id ?? 'for-you'}
              type="button"
              role="tab"
              aria-selected={active}
              data-active={active || undefined}
              onClick={() => onChange(c.id)}
              className={cn(
                'relative shrink-0 whitespace-nowrap pb-2.5 pt-1.5 text-[15px] capitalize transition-colors',
                active ? 'font-semibold text-white' : 'font-medium text-zinc-500',
              )}
            >
              {c.name}
              {active && (
                <motion.span
                  layoutId="explore-category-underline"
                  data-explore-category-underline
                  className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-white"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ExplorePhoneHome({
  categories,
  onCategory,
  recentSearches,
  onSearch,
  onRemoveSearch,
  onClearSearches,
}: {
  categories: DeHubCategory[];
  onCategory: (id: string) => void;
  recentSearches: string[];
  onSearch: (term: string) => void;
  onRemoveSearch: (term: string) => void;
  onClearSearches: () => void;
}) {
  const { t: _copy } = _useCopy();
  const navigate = useStableNavigate();
  const isMobile = useIsMobile();
  const { joinSpace } = useStage();
  const [recentOpen, setRecentOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);

  // This week's tags; the all-time list stands in while the week is thin.
  const { data: weekTopics = [] } = useTrendingCategories('1w');
  const { data: allTopics = [] } = useTrendingCategories('all');
  const weekly = weekTopics.length >= TOPICS_COLLAPSED;
  const topics = weekly ? weekTopics : allTopics;

  const { data: tickers = [] } = useQuery({
    queryKey: ['trending-tickers', 'all'],
    queryFn: () => getTopTickers(10, 'all'),
    staleTime: 120_000,
    refetchInterval: 120_000,
    placeholderData: (prev) => prev,
  });

  const liveStages = useLiveSpaces();
  const { data: liveData } = useDeHubLive({ ...DEFAULT_DEHUB_LIVE_QUERY_OPTIONS });
  const live = useMemo(() => {
    const streams = (liveData?.pages.flatMap((p) => p.data || []) ?? [])
      .map((s, i) => mapApiLiveStreamToLocal(s, i))
      .filter((s) => s.isLive)
      .map((s) => ({
        key: `stream-${s.id}`,
        avatar: s.avatar,
        name: s.streamer,
        line: s.title,
        open: () => navigate(`/app/post/${s.id}`, { state: { fromFeed: true } }),
      }));
    const stages = liveStages.map((st) => ({
      key: `stage-${st.id}`,
      avatar: st.host_avatar || '',
      name: st.host_username ? `@${st.host_username}` : st.title,
      line: st.title,
      open: () => joinSpace(st.id),
    }));
    return [...streams, ...stages];
  }, [liveData, liveStages, navigate, joinSpace]);

  const categoryByName = useMemo(() => new Map(categories.map((c) => [c.name.toLowerCase(), c.id])), [categories]);
  const openTopic = (name: string) => {
    const id = categoryByName.get(name.toLowerCase());
    if (id) onCategory(id);
    else onSearch(`#${name}`);
  };

  const seeAll = _copy('feed.seeAll', { defaultValue: 'See all' });
  const showLess = _copy('settings.showLess', { defaultValue: 'Show less' });

  const shownTopics = topics.slice(0, topicsOpen ? TOPICS_EXPANDED : TOPICS_COLLAPSED);
  const shownTokens = tickers.slice(0, tokensOpen ? TOKENS_EXPANDED : TOKENS_COLLAPSED);
  const shownRecent = recentOpen ? recentSearches : recentSearches.slice(0, RECENT_COLLAPSED);
  const shownLive = liveOpen ? live : live.slice(0, LIVE_COLLAPSED);

  return (
    <div data-explore-phone-home className="divide-y divide-zinc-800/60">
      {recentSearches.length > 0 && (
        <ExploreListSection
          icon="search"
          title={_copy('copy.explore.recent', { defaultValue: 'Recent searches' })}
          action={_copy('explorePage.clearAll', { defaultValue: 'Clear all' })}
          onAction={onClearSearches}
          chevron={false}
          data-explore-recent
        >
          <AnimatePresence initial={false}>
            {shownRecent.map((term) => (
              // Swipe a row sideways to drop it, as well as the X.
              <motion.div
                key={term}
                layout
                drag={isMobile ? 'x' : false}
                dragSnapToOrigin
                dragElastic={0.6}
                onDragEnd={(_, info) => {
                  if (Math.abs(info.offset.x) > 72 || Math.abs(info.velocity.x) > 600) onRemoveSearch(term);
                }}
                exit={{ opacity: 0, height: 0, transition: { duration: 0.15 } }}
                style={isMobile ? { touchAction: 'pan-y' } : undefined}
                className="flex items-center gap-3"
              >
                <button type="button" onClick={() => onSearch(term)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left">
                  <Search className="h-4 w-4 shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-white">{term}</span>
                </button>
                <button
                  type="button"
                  aria-label={_copy('common.remove', { defaultValue: 'Remove' })}
                  onClick={() => onRemoveSearch(term)}
                  className="-mr-1 p-2 text-zinc-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {recentSearches.length > RECENT_COLLAPSED && (
            <button type="button" onClick={() => setRecentOpen((v) => !v)} className="mt-0.5 py-1.5 text-[13px] font-medium text-zinc-400">
              {recentOpen ? showLess : _copy('copy.explore.moreRecent', { defaultValue: 'Show {{count}} more', count: recentSearches.length - RECENT_COLLAPSED })}
            </button>
          )}
        </ExploreListSection>
      )}

      {topics.length > 0 && (
        <ExploreListSection
          icon="stats"
          title={_copy('explorePage.trending', { defaultValue: 'Trending' })}
          action={topics.length > TOPICS_COLLAPSED ? (topicsOpen ? showLess : seeAll) : undefined}
          onAction={() => setTopicsOpen((v) => !v)}
          chevron={!topicsOpen}
          data-explore-trending
        >
          <ol>
            {shownTopics.map((topic, i) => (
              <li key={topic.name}>
                <button type="button" onClick={() => openTopic(topic.name)} className="flex w-full items-center gap-3 py-2 text-left">
                  <span className="w-5 shrink-0 text-[13px] font-semibold tabular-nums text-zinc-500">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold capitalize text-white">#{topic.name}</span>
                    {/* A paid spot says so; the count stays the real one. */}
                    <span className="flex items-center gap-1 text-[12.5px] text-zinc-500">
                      {topic.boosted && (
                        <>
                          <ThemedIcon icon="superpowers" alt="" className="h-3.5 w-3.5 shrink-0 object-contain opacity-70" />
                          {_copy('copy.c1f1c8819e33', { defaultValue: 'Boosted' })} ·
                        </>
                      )}
                      {weekly
                        ? _copy('copy.explore.postsThisWeek', { defaultValue: '{{value1}} posts this week', value1: compact(topic.post_count) })
                        : _copy('copy.explore.postsCount', { defaultValue: '{{value1}} posts', value1: compact(topic.post_count) })}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
                </button>
              </li>
            ))}
          </ol>
        </ExploreListSection>
      )}

      {live.length > 0 && (
        <ExploreListSection
          icon="live"
          title={_copy('stages.liveNow', { defaultValue: 'Live now' })}
          action={live.length > LIVE_COLLAPSED ? (liveOpen ? showLess : seeAll) : undefined}
          onAction={() => setLiveOpen((v) => !v)}
          chevron={!liveOpen}
          data-explore-live
        >
          {shownLive.map((s) => (
            <button key={s.key} type="button" onClick={s.open} className="flex w-full items-center gap-3 py-2 text-left">
              <LiveRipple live size="sm" className="rounded-full">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800">
                  {s.avatar ? <img src={s.avatar} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Radio className="h-4 w-4 text-red-400" />}
                </span>
              </LiveRipple>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-white">{s.name}</span>
                <span className="block truncate text-[12.5px] text-zinc-500">{s.line}</span>
              </span>
              <span className="shrink-0 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                {_copy('feed.live', { defaultValue: 'Live' })}
              </span>
            </button>
          ))}
        </ExploreListSection>
      )}

      {tickers.length > 0 && (
        <ExploreListSection
          icon="buy"
          title={_copy('copy.explore.topTokens', { defaultValue: 'Top tokens' })}
          action={tickers.length > TOKENS_COLLAPSED ? (tokensOpen ? showLess : seeAll) : undefined}
          onAction={() => setTokensOpen((v) => !v)}
          chevron={!tokensOpen}
          data-explore-tokens
        >
          <div className="grid grid-cols-2 gap-x-4">
            {shownTokens.map((tk, i) => (
              <button
                key={tk.symbol}
                type="button"
                onClick={() => onSearch(`$${tk.symbol}`)}
                className="flex min-w-0 items-center gap-2.5 py-2.5 text-left"
              >
                <span className="w-4 shrink-0 text-[12px] font-semibold tabular-nums text-zinc-500">{i + 1}</span>
                <TickerLogo symbol={tk.symbol} size={22} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">${tk.symbol}</span>
              </button>
            ))}
          </div>
        </ExploreListSection>
      )}

      <MobileWhoToFollowCarousel surface="explore" layout="rows" />
      <NewMembersCarousel surface="explore" layout="rows" />
    </div>
  );
}

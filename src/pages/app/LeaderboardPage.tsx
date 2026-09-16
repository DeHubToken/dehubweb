/**
 * Leaderboard Page
 * ================
 * Displays top DHB token holders and tippers from the DeHub API.
 */

import { BrandIcon, ThemedIcon } from '@/components/app/war/WarHudIcon';
import { AppState } from '@/components/app/AppState';
import { useState, useMemo, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GlassFilterRow } from '@/components/app/feeds/GlassFilterRow';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, Loader2, Wallet, ArrowUpRight, CreditCard, Users, Heart, UserCheck, ArrowDown, ArrowUp, RefreshCw, TrendingUp, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import trophyIcon from '@/assets/trophy-icon.png';
import medal1 from '@/assets/medal-1.png';
import medal2 from '@/assets/medal-2.png';
import medal3 from '@/assets/medal-3.png';
import medal4 from '@/assets/medal-4.png';
import medal5 from '@/assets/medal-5.png';
import medal6 from '@/assets/medal-6.png';
import medal7 from '@/assets/medal-7.png';
import medal8 from '@/assets/medal-8.png';
import medal9 from '@/assets/medal-9.png';
import medal10 from '@/assets/medal-10.png';

import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { useAuthPrompt, AuthPrompt } from '@/components/app/AuthPrompt';
import { supabase } from '@/integrations/supabase/client';
import { LeaderboardUserAvatar } from '@/components/app/LeaderboardUserAvatar';
import { getLeaderboard, type LeaderboardSortMode, type LeaderboardEntry, type LeaderboardPeriod } from '@/lib/api/dehub';
import { dehubAuthHeaders } from '@/lib/ai-invoke';
import { getAffiliateLeaderboard, type AffiliateLeaderboardEntry } from '@/lib/api/affiliate-leaderboard';
import { buildAvatarUrl } from '@/lib/media-url';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import { SEOHead } from '@/components/SEOHead';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import {
  applyLeaderboardRules,
  formatLeaderboardNumber,
  getEntryValue,
  hasDelta,
  isHidden,
  type RankedEntry,
} from '@/lib/leaderboard-rules';


type CategoryType = 'holdings' | 'sentTips' | 'receivedTips' | 'followers' | 'likes' | 'subscribers' | 'affiliates';

// `apiSort` is null for a category that is not served by /api/leaderboard.
const categories: { id: CategoryType; labelKey: string; icon: typeof Wallet; apiSort: LeaderboardSortMode | null }[] = [
  { id: 'holdings', labelKey: 'leaderboard.holdings', icon: Wallet, apiSort: 'holdings' },
  { id: 'sentTips', labelKey: 'leaderboard.spent', icon: ArrowUpRight, apiSort: 'sentTips' },
  { id: 'receivedTips', labelKey: 'leaderboard.earned', icon: CreditCard, apiSort: 'receivedTips' },
  { id: 'followers', labelKey: 'leaderboard.followers', icon: Users, apiSort: 'followers' },
  { id: 'likes', labelKey: 'leaderboard.likes', icon: Heart, apiSort: 'likes' },
  { id: 'subscribers', labelKey: 'leaderboard.subscribers', icon: UserCheck, apiSort: 'subscribers' },
  { id: 'affiliates', labelKey: 'leaderboard.affiliates', icon: Share2, apiSort: null },
];

const timePeriods: { id: LeaderboardPeriod; labelKey: string }[] = [
  { id: 'day', labelKey: 'leaderboard.day' },
  { id: 'week', labelKey: 'leaderboard.week' },
  { id: 'month', labelKey: 'leaderboard.month' },
  { id: 'year', labelKey: 'leaderboard.year' },
  { id: 'all', labelKey: 'leaderboard.allTime' },
];

const MEDALS = [medal1, medal2, medal3, medal4, medal5, medal6, medal7, medal8, medal9, medal10];

/** Boards whose figure is a DHB amount rather than a count. */
const DHB_CATEGORIES: readonly CategoryType[] = ['holdings', 'sentTips', 'receivedTips'];

const PAGE_SIZE = 25;

const getRankStyle = (rank: number) => {
  switch (rank) {
    case 1:
      return 'bg-yellow-500 text-black';
    case 2:
      return 'bg-zinc-400 text-black';
    case 3:
      return 'bg-amber-600 text-white';
    default:
      return 'bg-zinc-700 text-white';
  }
};

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50';

export default function LeaderboardPage() {
  const { t } = useTranslation();
  useLayoutEffect(() => {
    // Force scroll to top immediately and repeatedly to override any residual scroll position
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Additional attempts after paint to beat any async scroll restoration
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });

    const t = setTimeout(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 50);

    return () => clearTimeout(t);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<CategoryType>('holdings');
  const [timePeriod, setTimePeriod] = useState<LeaderboardPeriod>('all');
  const [shimmerKey, setShimmerKey] = useState(0);
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, walletAddress } = useAuth();
  const { theme } = useAppTheme();
  const isLightTheme = theme === 'light';
  const { isOpen: isAuthOpen, requireAuth, close: closeAuth } = useAuthPrompt();

  // Map category to API sort mode
  const apiSortMode = categories.find(c => c.id === category)?.apiSort || 'holdings';

  // Referrals aren't in the leaderboard API, so this one category is
  // aggregated out of Supabase instead. Everything downstream — search, the
  // sort toggle, the row markup — works off whichever list wins below.
  const isAffiliates = category === 'affiliates';

  const handleRefreshMe = useCallback(async () => {
    if (refreshCooldown || isRefreshing) return;

    requireAuth(async () => {
      if (!walletAddress) {
        toast.error(t('leaderboard.noWalletAddress'));
        return;
      }

      setIsRefreshing(true);
      try {
        const { data: { publicUrl } } = supabase.storage.from('stories').getPublicUrl('');
        const baseUrl = publicUrl.replace('/storage/v1/object/public/stories/', '');
        // The function takes the wallet off the verified token, not a query param.
        const fnUrl = `${baseUrl}/functions/v1/refresh-leaderboard-user`;

        const res = await fetch(fnUrl, { headers: dehubAuthHeaders() });
        const result = await res.json();

        if (!res.ok || !result.success) {
          toast.error(result.error || t('leaderboard.refreshFailed'));
          return;
        }

        if (result.added) {
          toast.success(t('leaderboard.addedToLeaderboard', { balance: (result.balance as number).toLocaleString() }));
        } else {
          toast.info(result.reason || t('leaderboard.balanceTooLow', { balance: (result.balance as number).toLocaleString() }));
        }

        // Refetch leaderboard data
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] });

        // Start cooldown
        setRefreshCooldown(true);
        setTimeout(() => setRefreshCooldown(false), 30_000);
      } catch (err) {
        console.error('Refresh failed:', err);
        toast.error(t('leaderboard.refreshFailed'));
      } finally {
        setIsRefreshing(false);
      }
    });
  }, [refreshCooldown, isRefreshing, requireAuth, walletAddress, queryClient]);

  // This page lives in PersistentPageCache (never unmounts), so
  // refetchOnMount only ever fires once — the route gate below is the only
  // automatic refresh path after the first visit.
  const { pathname } = useLocation();
  const isLeaderboardRouteActive = pathname === '/app/leaderboard';

  // The key is shared with the sidebar widget and the home-feed carousel, so
  // whichever surface fetched first feeds the others.
  const { data, isLoading, error } = useQuery({
    queryKey: ['leaderboard', apiSortMode, timePeriod],
    queryFn: () => getLeaderboard(apiSortMode, timePeriod),
    staleTime: 5 * 60_000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnMount: true,
    // Focus-refetch only while the leaderboard is actually on screen — an
    // unconditional refetch refired while hidden behind other routes, and an
    // unconditional false left the list frozen after the first visit.
    refetchOnWindowFocus: isLeaderboardRouteActive,
    // Route-gated background refresh so revisits see fresh ranks even
    // without a focus change (restarts on return because the gate is
    // reactive route state). The cache row is rebuilt on a schedule, so
    // polling faster than this only re-reads the same row.
    refetchInterval: isLeaderboardRouteActive ? 15 * 60_000 : false,
    // Switching period/category keeps the previous ranked list visible while
    // the new one loads, instead of dropping the page to a spinner.
    placeholderData: keepPreviousData,
    enabled: !isAffiliates,
  });

  const {
    data: affiliateData,
    isLoading: affiliateLoading,
    error: affiliateError,
  } = useQuery({
    queryKey: ['leaderboard', 'affiliates', timePeriod],
    queryFn: () => getAffiliateLeaderboard(timePeriod),
    enabled: isAffiliates,
    staleTime: 5 * 60_000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: isLeaderboardRouteActive,
    refetchInterval: isLeaderboardRouteActive ? 15 * 60_000 : false,
    placeholderData: keepPreviousData,
  });

  // Check if we're viewing a time-based period (shows delta)
  const isTimeDelta = timePeriod !== 'all';

  // Ranked once, from the full list, before search or the direction toggle
  // touch it — so a lone search hit keeps its real rank and "lowest first"
  // does not crown the smallest holder.
  const rankedEntries = useMemo<RankedEntry<LeaderboardEntry>[]>(() => {
    const source: LeaderboardEntry[] = isAffiliates
      ? (affiliateData ?? [])
      : (data?.result?.byWalletBalance || []);
    return applyLeaderboardRules(source, { sort: category, period: timePeriod });
  }, [data, affiliateData, isAffiliates, category, timePeriod]);

  const entries = useMemo(() => {
    let list = rankedEntries;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      list = list.filter((entry) =>
        entry.username?.toLowerCase().includes(query) ||
        entry.userDisplayName?.toLowerCase().includes(query) ||
        entry.account.toLowerCase().includes(query)
      );
    }

    return sortDirection === 'desc' ? list : [...list].reverse();
  }, [rankedEntries, searchQuery, sortDirection]);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [category, timePeriod, searchQuery, sortDirection]);

  const hasMore = visibleCount < entries.length;
  const total = entries.length;

  // Infinite scroll observer — the sentinel only exists while there is more
  // to show, and the count never grows past the list.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount(prev => (prev < total ? Math.min(prev + PAGE_SIZE, total) : prev));
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, total]);

  const visibleEntries = useMemo(() => entries.slice(0, visibleCount), [entries, visibleCount]);

  const getAvatarUrl = (entry: LeaderboardEntry) => {
    if (entry.avatarUrl && entry.account) {
      return buildAvatarUrl(entry.account, entry.avatarUrl);
    }
    return null;
  };

  const shortAccount = (entry: LeaderboardEntry) => `${entry.account.slice(0, 6)}...${entry.account.slice(-4)}`;

  const getDisplayName = (entry: LeaderboardEntry) => {
    return entry.userDisplayName || entry.username || shortAccount(entry);
  };

  const getHandle = (entry: LeaderboardEntry) => {
    if (entry.username) return `@${entry.username}`;
    return shortAccount(entry);
  };

  const isDhbCategory = DHB_CATEGORIES.includes(category);

  const formatDisplayValue = (entry: LeaderboardEntry): string => {
    if (category === 'affiliates') {
      const affiliate = entry as AffiliateLeaderboardEntry;
      const direct = t('leaderboard.directReferrals', {
        defaultValue: '{{count}} direct',
        count: affiliate.directReferrals ?? 0,
      });
      // Tier 2 is only meaningful once someone has it, so it stays off the row
      // rather than showing a column of zeroes.
      if (!affiliate.secondaryReferrals) return String(direct);
      const secondary = t('leaderboard.secondaryReferrals', {
        defaultValue: '{{count}} secondary',
        count: affiliate.secondaryReferrals,
      });
      return String(direct) + ' · ' + String(secondary);
    }
    // The balance itself is what a hidden account withheld; counts on the
    // other boards are still public.
    if (category === 'holdings' && isHidden(entry)) {
      return t('leaderboard.hidden');
    }
    // A period row with no delta shows a dash — never the all-time figure,
    // which would put two different quantities in the same column.
    if (isTimeDelta && !hasDelta(entry, category, timePeriod)) {
      return '—';
    }
    const value = getEntryValue(entry, category, timePeriod);
    const prefix = isTimeDelta && value > 0 ? '+' : '';
    const formatted = `${prefix}${formatLeaderboardNumber(value)}`;
    return isDhbCategory ? `${formatted} DHB` : formatted;
  };

  const valueTone = (entry: LeaderboardEntry): string => {
    if (!isTimeDelta || !hasDelta(entry, category, timePeriod)) return 'text-white';
    const value = getEntryValue(entry, category, timePeriod);
    if (Math.abs(value) <= 0.01) return 'text-white';
    return value > 0 ? 'text-green-400' : 'text-red-400';
  };

  const currentCategory = categories.find(c => c.id === category);
  const valueHeading = currentCategory ? t(currentCategory.labelKey) : t('leaderboard.value');

  // The two sources are mutually exclusive — one query is always disabled —
  // so the page's states just follow whichever is live.
  const listLoading = isAffiliates ? affiliateLoading : isLoading;
  const listError = isAffiliates ? affiliateError : error;

  // Swallow the ranked list at the sticky header bento's top edge under the
  // glass themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  const sortToggleLabel = sortDirection === 'desc' ? t('leaderboard.highestFirst') : t('leaderboard.lowestFirst');

  return (
    <div className="min-h-screen">
      <SEOHead
        title="Leaderboard — Top Creators & Earners"
        description="See who's leading on DeHub. Track top holders, biggest tippers, most followed creators, and trending accounts across all time periods."
        url="https://dehub.io/app/leaderboard"
        image="https://dehub.io/og/leaderboard.jpg"
        jsonLd={{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'DeHub Leaderboard', url: 'https://dehub.io/app/leaderboard', description: 'Track top DHB holders, tippers and creators on DeHub.', isPartOf: { '@type': 'WebSite', name: 'DeHub', url: 'https://dehub.io' } }}
      />
      {/* Sticky nav pill */}
      <div data-feed-nav-outer className="sticky top-11 lg:top-0 z-50 bg-black px-2 pt-1 pb-0 sm:px-3 sm:pt-1 sm:pb-0 lg:pt-2">
        <div data-page-bento className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden">
            <BrandIcon src={trophyIcon} alt="" className="w-11 h-11 object-contain" />
          </div>
          <div>
            <h1 className="sr-only">DeHub Leaderboard — Decentralised Social Media, Censorship Resistant &amp; Freedom of Speech</h1>
            <p className="text-xl font-bold text-white" aria-hidden="true">{t('leaderboard.title')}</p>
            <p className="text-zinc-500 text-sm">{t('leaderboard.subtitle')}</p>
          </div>
        </div>

        {/* Category Tabs - Horizontally scrollable */}
        <div className="relative mb-3">
          <GlassFilterRow
            items={[...categories.map((cat) => ({ key: cat.id, label: <span className="flex items-center gap-1.5"><cat.icon className="w-4 h-4" />{t(cat.labelKey)}</span> })), { key: 'assets' as any, label: <span className="flex items-center gap-1.5"><TrendingUp className="w-4 h-4" />Assets</span> }]}
            activeKey={category}
            onSelect={(key) => { if (key === 'assets') { navigate('/app/top-100'); return; } setCategory(key as CategoryType); setSortDirection('desc'); }}
            borderRadius="0.75rem"
            buttonClassName="px-3 py-2 rounded-xl text-sm"
          />
        </div>

        {/* Time Period Tabs + Sort Toggle */}
        <div className="flex items-center gap-2 mb-4">
          <GlassFilterRow
            items={timePeriods.map((p) => ({ key: p.id, label: t(p.labelKey) }))}
            activeKey={timePeriod}
            onSelect={(key) => { setTimePeriod(key as LeaderboardPeriod); setShimmerKey(k => k + 1); setSortDirection('desc'); }}
            buttonClassName="text-sm"
          />
          <button
            type="button"
            onClick={() => setSortDirection(d => d === 'desc' ? 'asc' : 'desc')}
            className={cn('p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white transition-colors shrink-0', FOCUS_RING)}
            title={sortToggleLabel}
            aria-label={sortToggleLabel}
            aria-pressed={sortDirection === 'asc'}
          >
            {sortDirection === 'desc' ? <ArrowDown className="w-4 h-4" aria-hidden="true" /> : <ArrowUp className="w-4 h-4" aria-hidden="true" />}
          </button>
        </div>

        {/* Search + Refresh */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden="true" />
            <Input
              type="search"
              placeholder={t('leaderboard.searchUsers')}
              aria-label={t('leaderboard.searchUsers')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
            />
          </div>
          {category === 'holdings' && (
            <button
              type="button"
              onClick={handleRefreshMe}
              disabled={isRefreshing || refreshCooldown}
              className={cn('flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0', FOCUS_RING)}
              title={refreshCooldown ? t('leaderboard.cooldownActive') : t('leaderboard.refreshPosition')}
              aria-label={refreshCooldown ? t('leaderboard.cooldownActive') : t('leaderboard.refreshPosition')}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="px-2 sm:px-3 pt-2 pb-3">
        <div data-page-bento className="bg-zinc-900 rounded-2xl overflow-hidden">
        {/* Loading State */}
        {listLoading && (
          <DeHubPageLoader minHeight="40vh" />
        )}

        {/* Error State */}
        {listError && (
          <div className="text-center py-20" role="alert">
            <ThemedIcon icon="trophy" alt="" className="w-16 h-16 object-contain mx-auto mb-3 opacity-65" />
            <p className="text-zinc-500">{t('leaderboard.failedToLoad')}</p>
          </div>
        )}

        {/* Empty State */}
        {!listLoading && !listError && entries.length === 0 && (
          <AppState
            icon="trophy"
            title={timePeriod !== 'all' && !searchQuery.trim()
              ? t('leaderboard.noDataForPeriod')
              : t('leaderboard.noUsersFound')}
            size="page"
          />
        )}

        {/* Table */}
        {!listLoading && !listError && entries.length > 0 && (
          <div role="table" aria-label={t('leaderboard.title')}>
            <div role="rowgroup">
              <div role="row" className="hidden sm:grid grid-cols-12 gap-4 px-4 sm:px-6 py-4 border-b border-zinc-800 text-zinc-500 text-sm font-medium">
                <div role="columnheader" className="col-span-1 text-center -ml-[5.5px]">{t('leaderboard.rank')}</div>
                <div role="columnheader" className="col-span-5">{t('leaderboard.user')}</div>
                <div role="columnheader" className="col-span-6 text-right">{valueHeading}</div>
              </div>
            </div>
            <div role="rowgroup">
            {visibleEntries.map((entry) => {
              const rank = entry.rank;
              const hidden = isHidden(entry);
              const profileHref = entry.username ? `/${entry.username}` : null;
              const displayName = getDisplayName(entry);
              const rowClass = cn(
                "grid grid-cols-12 gap-2 sm:gap-4 px-4 sm:px-6 py-4 transition-colors items-center",
                profileHref && 'cursor-pointer',
                profileHref && (isLightTheme ? "hover:bg-zinc-100" : "hover:bg-zinc-800/50"),
                FOCUS_RING,
              );
              const rowContent = (
                <>
                  {/* Rank */}
                  <div role="cell" className="col-span-2 sm:col-span-1 flex items-center justify-center -ml-[5.5px]">
                    {rank <= 10 ? (
                      <div
                        className={`medal-shine-container ${rank <= 3 ? 'w-12 h-12' : 'w-8 h-8'}`}
                        style={{ '--medal-mask': `url(${MEDALS[rank - 1]})` } as React.CSSProperties}
                      >
                        <img
                          src={MEDALS[rank - 1]}
                          alt={t('leaderboard.rankN', { rank })}
                          className={`${rank <= 3 ? 'w-12 h-12' : 'w-8 h-8'} object-contain relative`}
                        />
                        <div
                          key={shimmerKey}
                          className="medal-shine-overlay"
                        />
                      </div>
                    ) : (
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${getRankStyle(rank)}`}
                        aria-label={t('leaderboard.rankN', { rank })}
                      >
                        {rank}
                      </div>
                    )}
                  </div>

                  {/* User */}
                  <div role="cell" className="col-span-7 sm:col-span-5 flex items-center gap-3">
                    <LeaderboardUserAvatar
                      avatarUrl={getAvatarUrl(entry)}
                      fallbackSeed={entry.account}
                      displayName={displayName}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="inline-flex items-baseline gap-1 shrink min-w-0">
                          <span className="font-semibold text-white truncate">{displayName}</span>
                          {!hidden && (
                            <BadgeIcon badgeBalance={entry.badgeBalance || entry.total} username={entry.username} className="w-[1em] h-[1em]" />
                          )}
                        </span>
                      </div>
                      <span className="text-zinc-500 text-sm">{getHandle(entry)}</span>
                    </div>
                  </div>

                  {/* Value */}
                  <div role="cell" className={`col-span-3 sm:col-span-6 text-right font-medium tabular-nums ${valueTone(entry)}`}>
                    {formatDisplayValue(entry)}
                  </div>
                </>
              );

              return profileHref ? (
                <Link
                  key={entry.account}
                  to={profileHref}
                  role="row"
                  aria-label={`${t('leaderboard.rankN', { rank })} · ${displayName}`}
                  className={rowClass}
                >
                  {rowContent}
                </Link>
              ) : (
                <div key={entry.account} role="row" className={rowClass}>
                  {rowContent}
                </div>
              );
            })}
            </div>
          </div>
        )}

        {/* Infinite scroll sentinel — only while there is more to load */}
        {!listLoading && !listError && hasMore && (
          <div ref={sentinelRef} className="py-4 flex justify-center" aria-hidden="true">
            <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
          </div>
        )}
      </div>
      </div>

      <AuthPrompt isOpen={isAuthOpen} onClose={closeAuth} />
    </div>
  );
}

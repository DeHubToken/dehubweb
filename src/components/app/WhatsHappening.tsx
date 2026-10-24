import Globe from "@/components/ui/cut-icons/world";
import ChevronDown from "@/components/ui/cut-icons/next";
import Hash from "@/components/ui/cut-icons/topics";
import Flame from "@/components/ui/cut-icons/trending";
import { translateCopy as _translateCopy } from '@/i18n/copy';
import { useTranslation as _useCopy } from 'react-i18next';
import { useSurfaceDraft } from '@/hooks/use-surface-draft';
import React, { Suspense, memo, useState, useRef, useCallback, useEffect } from 'react';
// Lazy: GoLiveModal imports minting/wallet contract code, and WhatsHappening
// is eager via RightSidebar/AppLayout — a static import here would pull the
// wallet stack into the entry bundle (scripts/check-entry-bundle.mjs fails
// the build if that happens).
const GoLiveModal = React.lazy(() =>
  import('@/components/app/modals/GoLiveModal').then(m => ({ default: m.GoLiveModal }))
);
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import Radio from "@/components/ui/cut-icons/live";
import Video from "@/components/ui/cut-icons/video";
import Users from "@/components/ui/cut-icons/communities";

import Search from "@/components/ui/cut-icons/search";
import Mic from "@/components/ui/cut-icons/mic";

import { motion, LayoutGroup, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { TickerLogo } from './TickerLogo';
import { cn } from '@/lib/utils';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { getTopTickers, type TickerPeriod } from '@/lib/ticker-search-tracker';
import { TrendingTopicsList } from './TrendingTopicsList';
import { BadgedName } from '@/components/app/BadgedName';
import { formatTimeAgo } from '@/lib/feed-utils';
import { useStage, useLiveSpaces } from '@/contexts/StageContext';
import { useDeHubLive, DEFAULT_DEHUB_LIVE_QUERY_OPTIONS, mapApiLiveStreamToLocal } from '@/hooks/use-dehub-feed';
import { useDiscoveryTab, type DiscoveryTab, type DiscoverySurface } from '@/hooks/use-discovery-tab';
import { LiveRipple } from '@/components/app/LiveRipple';

const COUNTRIES = [
  { code: 'global', flag: '🌍', get name() { return _translateCopy("copy.a258b30f88c3", { defaultValue: "Global" }); } },
  { code: 'us', flag: '🇺🇸', get name() { return _translateCopy("copy.49dca65f362f", { defaultValue: "United States" }); } },
  { code: 'gb', flag: '🇬🇧', get name() { return _translateCopy("copy.8d23a6e37e0a", { defaultValue: "United Kingdom" }); } },
  { code: 'de', flag: '🇩🇪', get name() { return _translateCopy("copy.80db4ccdca10", { defaultValue: "Germany" }); } },
  { code: 'fr', flag: '🇫🇷', get name() { return _translateCopy("copy.7a1ca4ef7515", { defaultValue: "France" }); } },
  { code: 'es', flag: '🇪🇸', get name() { return _translateCopy("copy.8ef41e6f4b07", { defaultValue: "Spain" }); } },
  { code: 'it', flag: '🇮🇹', get name() { return _translateCopy("copy.5a9cf672c8be", { defaultValue: "Italy" }); } },
  { code: 'pt', flag: '🇵🇹', get name() { return _translateCopy("copy.4c7de2c3da6d", { defaultValue: "Portugal" }); } },
  { code: 'br', flag: '🇧🇷', get name() { return _translateCopy("copy.07f62b021771", { defaultValue: "Brazil" }); } },
  { code: 'nl', flag: '🇳🇱', get name() { return _translateCopy("copy.3a386c13d283", { defaultValue: "Netherlands" }); } },
  { code: 'pl', flag: '🇵🇱', get name() { return _translateCopy("copy.7f69649ad704", { defaultValue: "Poland" }); } },
  { code: 'ru', flag: '🇷🇺', get name() { return _translateCopy("copy.33a3d8ed92b0", { defaultValue: "Russia" }); } },
  { code: 'ua', flag: '🇺🇦', get name() { return _translateCopy("copy.580eedc669f3", { defaultValue: "Ukraine" }); } },
  { code: 'ro', flag: '🇷🇴', get name() { return _translateCopy("copy.ea23726dd0fd", { defaultValue: "Romania" }); } },
  { code: 'bg', flag: '🇧🇬', get name() { return _translateCopy("copy.66b86bf0f045", { defaultValue: "Bulgaria" }); } },
  { code: 'cs', flag: '🇨🇿', get name() { return _translateCopy("copy.1c769ecb9e80", { defaultValue: "Czech Republic" }); } },
  { code: 'sk', flag: '🇸🇰', get name() { return _translateCopy("copy.a2ea3384e02f", { defaultValue: "Slovakia" }); } },
  { code: 'hr', flag: '🇭🇷', get name() { return _translateCopy("copy.7328d3f829b7", { defaultValue: "Croatia" }); } },
  { code: 'sr', flag: '🇷🇸', get name() { return _translateCopy("copy.e8739c839576", { defaultValue: "Serbia" }); } },
  { code: 'hu', flag: '🇭🇺', get name() { return _translateCopy("copy.504be3084f44", { defaultValue: "Hungary" }); } },
  { code: 'el', flag: '🇬🇷', get name() { return _translateCopy("copy.9c93ad439373", { defaultValue: "Greece" }); } },
  { code: 'tr', flag: '🇹🇷', get name() { return _translateCopy("copy.07c67d76ef92", { defaultValue: "Turkey" }); } },
  { code: 'da', flag: '🇩🇰', get name() { return _translateCopy("copy.c52709757760", { defaultValue: "Denmark" }); } },
  { code: 'sv', flag: '🇸🇪', get name() { return _translateCopy("copy.853637136575", { defaultValue: "Sweden" }); } },
  { code: 'no', flag: '🇳🇴', get name() { return _translateCopy("copy.bea54a349795", { defaultValue: "Norway" }); } },
  { code: 'fi', flag: '🇫🇮', get name() { return _translateCopy("copy.aed8f531aa7e", { defaultValue: "Finland" }); } },
  { code: 'et', flag: '🇪🇪', get name() { return _translateCopy("copy.10aeba697f6b", { defaultValue: "Estonia" }); } },
  { code: 'lt', flag: '🇱🇹', get name() { return _translateCopy("copy.5c83a631bce2", { defaultValue: "Lithuania" }); } },
  { code: 'lv', flag: '🇱🇻', get name() { return _translateCopy("copy.988c8160b754", { defaultValue: "Latvia" }); } },
  { code: 'ar', flag: '🇸🇦', get name() { return _translateCopy("copy.ed9ad13611d7", { defaultValue: "Saudi Arabia" }); } },
  { code: 'ae', flag: '🇦🇪', get name() { return _translateCopy("copy.937040cd1003", { defaultValue: "UAE" }); } },
  { code: 'he', flag: '🇮🇱', get name() { return _translateCopy("copy.3552ac0c0324", { defaultValue: "Israel" }); } },
  { code: 'fa', flag: '🇮🇷', get name() { return _translateCopy("copy.18d4e170765c", { defaultValue: "Iran" }); } },
  { code: 'in', flag: '🇮🇳', get name() { return _translateCopy("copy.abd149214539", { defaultValue: "India" }); } },
  { code: 'pk', flag: '🇵🇰', get name() { return _translateCopy("copy.e2567312ec53", { defaultValue: "Pakistan" }); } },
  { code: 'bd', flag: '🇧🇩', get name() { return _translateCopy("copy.2f1d47eb679b", { defaultValue: "Bangladesh" }); } },
  { code: 'np', flag: '🇳🇵', get name() { return _translateCopy("copy.e15a18aadcac", { defaultValue: "Nepal" }); } },
  { code: 'lk', flag: '🇱🇰', get name() { return _translateCopy("copy.07f8d1144a39", { defaultValue: "Sri Lanka" }); } },
  { code: 'jp', flag: '🇯🇵', get name() { return _translateCopy("copy.647294383b2c", { defaultValue: "Japan" }); } },
  { code: 'kr', flag: '🇰🇷', get name() { return _translateCopy("copy.c85329e3779e", { defaultValue: "South Korea" }); } },
  { code: 'cn', flag: '🇨🇳', get name() { return _translateCopy("copy.10436829032f", { defaultValue: "China" }); } },
  { code: 'th', flag: '🇹🇭', get name() { return _translateCopy("copy.6e49e65081b2", { defaultValue: "Thailand" }); } },
  { code: 'vn', flag: '🇻🇳', get name() { return _translateCopy("copy.2e5e81066a29", { defaultValue: "Vietnam" }); } },
  { code: 'id', flag: '🇮🇩', get name() { return _translateCopy("copy.dbc74a36d8e7", { defaultValue: "Indonesia" }); } },
  { code: 'my', flag: '🇲🇾', get name() { return _translateCopy("copy.084504165b07", { defaultValue: "Malaysia" }); } },
  { code: 'ph', flag: '🇵🇭', get name() { return _translateCopy("copy.c3782c86d809", { defaultValue: "Philippines" }); } },
  { code: 'mm', flag: '🇲🇲', get name() { return _translateCopy("copy.ba2039a4cf69", { defaultValue: "Myanmar" }); } },
  { code: 'kh', flag: '🇰🇭', get name() { return _translateCopy("copy.0c2cb01a2da1", { defaultValue: "Cambodia" }); } },
  { code: 'la', flag: '🇱🇦', get name() { return _translateCopy("copy.98e18f46684b", { defaultValue: "Laos" }); } },
  { code: 'mn', flag: '🇲🇳', get name() { return _translateCopy("copy.99a7c065a730", { defaultValue: "Mongolia" }); } },
  { code: 'kz', flag: '🇰🇿', get name() { return _translateCopy("copy.75c02b8d2f91", { defaultValue: "Kazakhstan" }); } },
  { code: 'uz', flag: '🇺🇿', get name() { return _translateCopy("copy.4bc2f1c23b3d", { defaultValue: "Uzbekistan" }); } },
  { code: 'az', flag: '🇦🇿', get name() { return _translateCopy("copy.efa9150afdea", { defaultValue: "Azerbaijan" }); } },
  { code: 'ge', flag: '🇬🇪', get name() { return _translateCopy("copy.4691492179d2", { defaultValue: "Georgia" }); } },
  { code: 'am', flag: '🇦🇲', get name() { return _translateCopy("copy.2ddc5634ff5e", { defaultValue: "Armenia" }); } },
  { code: 'au', flag: '🇦🇺', get name() { return _translateCopy("copy.c1ef40ce0484", { defaultValue: "Australia" }); } },
  { code: 'ca', flag: '🇨🇦', get name() { return _translateCopy("copy.be55ef3f4c4e", { defaultValue: "Canada" }); } },
  { code: 'sg', flag: '🇸🇬', get name() { return _translateCopy("copy.c96dd81db196", { defaultValue: "Singapore" }); } },
  { code: 'ng', flag: '🇳🇬', get name() { return _translateCopy("copy.04952a0f984d", { defaultValue: "Nigeria" }); } },
  { code: 'za', flag: '🇿🇦', get name() { return _translateCopy("copy.3e049d78d958", { defaultValue: "South Africa" }); } },
  { code: 'ke', flag: '🇰🇪', get name() { return _translateCopy("copy.74e1891dc615", { defaultValue: "Kenya" }); } },
  { code: 'et2', flag: '🇪🇹', get name() { return _translateCopy("copy.7d94977e033d", { defaultValue: "Ethiopia" }); } },
  { code: 'mg', flag: '🇲🇬', get name() { return _translateCopy("copy.d6804464c5f4", { defaultValue: "Madagascar" }); } },
  { code: 'so', flag: '🇸🇴', get name() { return _translateCopy("copy.bd05d324d8a3", { defaultValue: "Somalia" }); } },
  { code: 'pe', flag: '🇵🇪', get name() { return _translateCopy("copy.508731a3c5d3", { defaultValue: "Peru" }); } },
  { code: 'sq', flag: '🇦🇱', get name() { return _translateCopy("copy.1af00b874ff3", { defaultValue: "Albania" }); } },
  { code: 'tj', flag: '🇹🇯', get name() { return _translateCopy("copy.066b02130b7e", { defaultValue: "Tajikistan" }); } },
  { code: 'tm', flag: '🇹🇲', get name() { return _translateCopy("copy.b3dfc8505d59", { defaultValue: "Turkmenistan" }); } },
  { code: 'kg', flag: '🇰🇬', get name() { return _translateCopy("copy.6f189bf077b6", { defaultValue: "Kyrgyzstan" }); } },
  { code: 'nz', flag: '🇳🇿', get name() { return _translateCopy("copy.2898e16d4e4e", { defaultValue: "New Zealand" }); } },
  { code: 'ps', flag: '🇵🇸', get name() { return _translateCopy("copy.f189744591c2", { defaultValue: "Palestine" }); } },
  { code: 'jo', flag: '🇯🇴', get name() { return _translateCopy("copy.e8bfe1ed6935", { defaultValue: "Jordan" }); } },
  { code: 'lb', flag: '🇱🇧', get name() { return _translateCopy("copy.e34dd616b94b", { defaultValue: "Lebanon" }); } },
  { code: 'iq', flag: '🇮🇶', get name() { return _translateCopy("copy.de5008d194a7", { defaultValue: "Iraq" }); } },
  { code: 'eg', flag: '🇪🇬', get name() { return _translateCopy("copy.557c1599d9a0", { defaultValue: "Egypt" }); } },
];

type Tab = DiscoveryTab;

const TICKER_PERIODS: { value: TickerPeriod; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '1y', label: '1Y' },
  { value: 'all', get label() { return _translateCopy("copy.a52ace420f21", { defaultValue: "All" }); } },
];

const PERIOD_INDEX: Record<string, number> = { '1d': 0, '1w': 1, '1m': 2, '1y': 3, 'all': 4 };

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

const slideTransition = { type: 'tween' as const, duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] };

interface WhatsHappeningProps {
  showCountrySelector?: boolean;
  surface?: DiscoverySurface;
}

export const WhatsHappening = memo(function WhatsHappening({ showCountrySelector = false, surface = 'sidebar' }: WhatsHappeningProps) {
  const { t: _copy } = _useCopy();
  // The RightSidebar instance is `hidden lg:block` — below 1024px it stays
  // mounted but is never visible, so its polls/rotation are pure waste there.
  // The Explore instance (showCountrySelector) is the one shown on mobile.
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktopViewport(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  const isVisibleInstance = isDesktopViewport || showCountrySelector;
  const navigate = useNavigate();
  const { openModal: openStagesModal, joinSpace } = useStage();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useDiscoveryTab(surface);
  const [hasTabInteracted, setHasTabInteracted] = useState(false);
  const [tickerPeriod, setTickerPeriod] = useState<TickerPeriod>('all');
  const tickerDirRef = useRef(0);
  const [isTickerAutoRotating, setIsTickerAutoRotating] = useState(true);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [countrySearch, setCountrySearch] = useSurfaceDraft("components/app/WhatsHappening.tsx:countrySearch", '');
  const countryDropdownRef = useRef<HTMLDivElement>(null);
  const [showGoLive, setShowGoLive] = useState(false);
  // Mount on first open, keep mounted afterwards (close animation).
  const [goLiveMounted, setGoLiveMounted] = useState(false);
  useEffect(() => {
    if (showGoLive) setGoLiveMounted(true);
  }, [showGoLive]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!showCountrySelector) return;
    const handler = (e: MouseEvent) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(e.target as Node)) {
        setShowCountryDropdown(false);
      }
    };
    if (showCountryDropdown) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [showCountryDropdown, showCountrySelector]);

  const handleCountrySelect = useCallback((code: string) => {
    setShowCountryDropdown(false);
    setCountrySearch.complete(countrySearch, '');
    if (code !== 'global') {
      toast.info(t('sidebar.comingSoon'));
    }
  }, [t, setCountrySearch, countrySearch]);

  const filteredCountries = countrySearch.trim()
    ? COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRIES;

  // Warm all ticker periods so the 5s auto-rotation swaps instantly — but
  // ONLY while the tickers tab is actually visible. This sidebar is mounted
  // on every /app route, and unconditional refetchIntervals here meant five
  // ticker polls running forever in the background on every page.
  const tickersActive = activeTab === 'tickers' && isVisibleInstance;
  useQuery({ queryKey: ['trending-tickers', '1d' as TickerPeriod], queryFn: () => getTopTickers(10, '1d'), staleTime: 120_000, refetchInterval: 120_000, enabled: tickersActive, placeholderData: (p: any) => p });
  useQuery({ queryKey: ['trending-tickers', '1w' as TickerPeriod], queryFn: () => getTopTickers(10, '1w'), staleTime: 120_000, refetchInterval: 120_000, enabled: tickersActive, placeholderData: (p: any) => p });
  useQuery({ queryKey: ['trending-tickers', '1m' as TickerPeriod], queryFn: () => getTopTickers(10, '1m'), staleTime: 120_000, refetchInterval: 120_000, enabled: tickersActive, placeholderData: (p: any) => p });
  useQuery({ queryKey: ['trending-tickers', '1y' as TickerPeriod], queryFn: () => getTopTickers(10, '1y'), staleTime: 120_000, refetchInterval: 120_000, enabled: tickersActive, placeholderData: (p: any) => p });
  const { data: topTickers = [] } = useQuery({
    queryKey: ['trending-tickers', tickerPeriod],
    queryFn: () => getTopTickers(10, tickerPeriod),
    staleTime: 120_000,
    refetchInterval: 120_000,
    enabled: tickersActive,
    placeholderData: (previousData) => previousData,
  });

  // Auto-rotate ticker periods every 5 seconds (skips ticks while the browser
  // tab is hidden or this instance is the CSS-hidden mobile sidebar copy)
  useEffect(() => {
    if (!isTickerAutoRotating || activeTab !== 'tickers' || !isVisibleInstance) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      setTickerPeriod(prev => {
        const idx = TICKER_PERIODS.findIndex(p => p.value === prev);
        const next = TICKER_PERIODS[(idx + 1) % TICKER_PERIODS.length].value;
        tickerDirRef.current = 1;
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isTickerAutoRotating, activeTab, isVisibleInstance]);

  const handleTickerPeriodChange = useCallback((newPeriod: TickerPeriod) => {
    tickerDirRef.current = PERIOD_INDEX[newPeriod] - PERIOD_INDEX[tickerPeriod];
    setTickerPeriod(newPeriod);
    setIsTickerAutoRotating(false);
    setTimeout(() => setIsTickerAutoRotating(true), 30000);
  }, [tickerPeriod]);

  const handleTickerClick = (symbol: string) => {
    navigate(`/app/explore?q=${encodeURIComponent('$' + symbol)}`);
  };

  const handleMainTabChange = useCallback((tab: Tab) => {
    setHasTabInteracted(true);
    setActiveTab(tab);
  }, [setActiveTab]);

  const tabIcons: Record<Tab, typeof Hash> = { posts: Hash, stages: Radio, tickers: Flame };
  // Icon-only tabs need a spoken name.
  const tabLabels: Record<Tab, string> = { posts: t('sidebar.posts'), stages: t('stages.title', 'Stages'), tickers: t('sidebar.tickers') };

  // Live stages for the stages tab — shared from StageProvider's single
  // fetch + realtime channel (was a duplicate query + 60s poll here).
  const liveStages = useLiveSpaces().slice(0, 10);
  // Live video streams. The tab used to list audio Stages only, so a creator
  // broadcasting video showed "No one live right now". Same query key as the
  // Live feed and home carousel, so the cache is shared and nothing refetches.
  const { data: liveData } = useDeHubLive({ ...DEFAULT_DEHUB_LIVE_QUERY_OPTIONS, enabled: isVisibleInstance });
  const liveStreams = React.useMemo(() => {
    const all = liveData?.pages.flatMap(page => page.data || []) ?? [];
    return all.map((stream, index) => mapApiLiveStreamToLocal(stream, index)).filter(s => s.isLive).slice(0, 10);
  }, [liveData]);
  const hasAnyLive = liveStreams.length > 0 || liveStages.length > 0;

  return (
    <div data-side-panel data-discovery-surface={surface} className="bg-zinc-900 rounded-2xl overflow-hidden relative">
      {/* Icon tab switcher — matches TabbedSidePanel style */}
      <div data-side-panel-tabs className="flex">
        {(['posts', 'stages', 'tickers'] as Tab[]).map(tab => {
          const Icon = tabIcons[tab];
          const isStagesLive = tab === 'stages' && hasAnyLive;
          return (
            <button
              type="button"
              data-tab-btn
              data-tab-active={activeTab === tab}
              key={tab}
              onClick={() => handleMainTabChange(tab)}
              aria-label={tabLabels[tab]}
              title={tabLabels[tab]}
              aria-pressed={activeTab === tab}
              className={`relative flex-1 py-2.5 flex flex-col items-center justify-center transition-colors ${
                activeTab === tab
                  ? 'text-white'
                  : 'text-zinc-500 hover:text-zinc-300 [&:hover>.tab-hover-bg]:opacity-100'
              }`}
            >
              {activeTab === tab ? (
                <div data-active-tab-indicator className="absolute inset-0 bg-gradient-to-b from-zinc-800/60 to-transparent" />
              ) : (
                <div className="tab-hover-bg absolute inset-0 bg-gradient-to-b from-zinc-800/40 to-transparent opacity-0 transition-opacity" />
              )}
              <div className="relative z-10">
                <Icon className="w-4 h-4" />
                {isStagesLive && (
                  <span data-live-pulse className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
              </div>
            </button>
          );
        })}
        
      </div>

      <div className="p-4 pt-3">

      {/* Tab content */}
      <div style={{ height: 320 }} className="relative overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {/* Posts tab — shared component */}
        <div
          className={cn(
            'transition-opacity duration-150',
            activeTab === 'posts'
              ? 'opacity-100 relative z-10'
              : 'opacity-0 pointer-events-none absolute inset-0'
          )}
        >
          <TrendingTopicsList minHeight={0} />
        </div>

        {/* Stages tab */}
        <div
          className={cn(
            'transition-opacity duration-150',
            activeTab === 'stages'
              ? 'opacity-100 relative z-10 flex flex-col h-full'
              : 'opacity-0 pointer-events-none absolute inset-0 flex flex-col'
          )}
        >
          {hasAnyLive ? (
            <div className="flex flex-col gap-1">
              {liveStreams.map((stream) => (
                <button
                  key={`stream-${stream.id}`}
                  data-live-stream-row
                  onClick={() => navigate(`/app/post/${stream.id}`, { state: { fromFeed: true } })}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-zinc-800/60 transition-colors group text-left"
                >
                  <LiveRipple live size="sm" className="rounded-lg">
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0 overflow-hidden">
                      {stream.avatar ? (
                        <img src={stream.avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Video className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  </LiveRipple>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 font-medium truncate group-hover:text-white transition-colors">
                      {stream.title || stream.streamer}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <BadgedName lookupId={stream.creatorUsername || stream.creatorId}>
                        @{stream.creatorUsername || stream.creatorId?.slice(0, 6) || stream.streamer}
                      </BadgedName>
                      <span className="flex items-center gap-0.5">
                        <span data-live-pulse className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />{_copy("copy.b64ac05f17e6", { defaultValue: "Live" })}</span>
                    </div>
                  </div>
                </button>
              ))}
              {liveStages.map((stage) => (
                <button
                  key={stage.id}
                  onClick={() => { joinSpace(stage.id); }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-zinc-800/60 transition-colors group text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                    <Radio className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 font-medium truncate group-hover:text-white transition-colors">
                      {stage.title}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <BadgedName lookupId={stage.host_username || stage.host_wallet_address}>
                        @{stage.host_username || stage.host_wallet_address?.slice(0, 6)}
                      </BadgedName>
                      <span className="flex items-center gap-0.5">
                        <Users className="w-3 h-3" />
                        {(stage.speaker_count || 1) + (stage.listener_count || 0)}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <span data-live-pulse className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />{_copy("copy.b64ac05f17e6", { defaultValue: "Live" })}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center">
              <p className="text-zinc-400 text-xs mb-3">{_copy("copy.6b0a0a83ec5c", { defaultValue: "No one live right now — be the first!" })}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openStagesModal('create')}
                  className="w-9 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-white transition-colors"
                  title={_copy("copy.213834e9da05", { defaultValue: "Create Stage" })}
                >
                  <Mic className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowGoLive(true)}
                  className="w-9 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-white transition-colors"
                  title={_copy("copy.7975f2a611d0", { defaultValue: "Live Stream" })}
                >
                  <Video className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tickers tab */}
        <div
          className={cn(
            'transition-opacity duration-150',
            activeTab === 'tickers'
              ? 'opacity-100 relative z-10'
              : 'opacity-0 pointer-events-none absolute inset-0'
          )}
        >
          {/* Period tabs */}
          <div className="flex mb-2">
            {TICKER_PERIODS.map(p => (
              <button
                data-tab-btn
                key={p.value}
                onClick={() => handleTickerPeriodChange(p.value)}
                className={cn(
                  'flex-1 text-xs font-semibold transition-colors duration-150 text-center py-1',
                  tickerPeriod === p.value
                    ? 'text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="popLayout" custom={tickerDirRef.current} initial={false}>
            <motion.div
              key={tickerPeriod}
              custom={tickerDirRef.current}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
            >
              {topTickers.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {topTickers.map((ticker, i) => (
                    <button
                      key={ticker.symbol}
                      onClick={() => handleTickerClick(ticker.symbol)}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-xl hover:bg-zinc-800/60 transition-colors group text-left"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs text-zinc-500 font-mono w-4 shrink-0">{i + 1}</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <TickerLogo symbol={ticker.symbol} size={16} />
                          <span className="text-sm text-zinc-200 font-medium truncate group-hover:text-white transition-colors">
                            {ticker.symbol}
                          </span>
                        </div>
                      </div>
                      <span className="text-[11px] text-zinc-500 shrink-0 ml-2">
                        {_copy("copy.429351cfbad1", { count: ticker.search_count, defaultValue_one: "{{count}} search", defaultValue_other: "{{count}} searches", defaultValue: "{{count}} searches" })}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Search} text={t('sidebar.noTickersYet')} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Globe / Country selector button at bottom */}
      {showCountrySelector && (
        <div ref={countryDropdownRef} className="relative -mt-1">
          <button
            data-view-all
            onClick={() => setShowCountryDropdown(prev => !prev)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-b-2xl bg-zinc-900/90 hover:bg-zinc-800/90 border-t border-zinc-800/50 transition-colors text-xs text-zinc-400 hover:text-white"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t('commandCentre.viewAll', 'View all')}</span>
            <ChevronDown className="w-3 h-3 transition-transform" style={{ transform: `rotate(${showCountryDropdown ? -90 : 90}deg)` }} />
          </button>
          {showCountryDropdown && (
            <div data-inline-popover data-glass-menu className="absolute left-0 right-0 bottom-full mb-1 w-48 mx-auto bg-zinc-800 border border-zinc-700/50 rounded-xl shadow-xl z-50 py-1 max-h-72 flex flex-col">
              <div className="px-2 py-1.5 border-b border-zinc-700/50">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                  <input
                    type="text"
                    placeholder={_copy("copy.5214b74bd87d", { defaultValue: "Search countries..." })}
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className="w-full pl-7 pr-2 py-1.5 bg-zinc-700/50 border border-zinc-600/50 rounded-lg text-xs text-white placeholder:text-zinc-500 outline-none focus:border-zinc-500"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent">
                {filteredCountries.length > 0 ? filteredCountries.map(c => (
                  <button
                    key={c.code}
                    onClick={() => handleCountrySelect(c.code)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-zinc-700/50 text-left',
                      c.code === 'global' ? 'text-white font-medium' : 'text-zinc-400 hover:text-white'
                    )}
                  >
                    <span>{c.flag}</span>
                    <span>{c.name}</span>
                    {c.code === 'global' && <span className="ml-auto text-[10px] text-emerald-400">✓</span>}
                  </button>
                )) : (
                  <p className="text-xs text-zinc-500 text-center py-3">{_copy("copy.d9ecc10e5e9c", { defaultValue: "No countries found" })}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {!showCountrySelector && (
        <div data-view-all>
          <LiquidGlassBubble2
            label={t('commandCentre.viewAll', 'View all')}
            onClick={() => {
              if (activeTab === 'stages') { openStagesModal('browse'); }
              else { navigate('/app/explore'); }
            }}
            width="100%"
            height="auto"
            className="-mt-1 [&>div]:!py-2 [&>div]:from-zinc-900/90 [&>div]:to-white/5 [&>div]:before:from-transparent [&>div]:after:from-transparent"
          />
        </div>
      )}
      </div>
      {goLiveMounted && (
        <Suspense fallback={null}>
          <GoLiveModal isOpen={showGoLive} onClose={() => setShowGoLive(false)} />
        </Suspense>
      )}
    </div>
  );
});

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center mb-2.5">
        <Icon className="w-5 h-5 text-zinc-500" />
      </div>
      <p className="text-zinc-400 text-xs">{text}</p>
    </div>
  );
}

import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Globe, ChevronDown } from 'lucide-react';
import { motion, LayoutGroup, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { TickerLogo } from './TickerLogo';
import { cn } from '@/lib/utils';
import { LiquidGlassBubble2 } from '@/components/ui/liquid-glass-bubble-2';
import { getTopTickers, type TickerPeriod } from '@/lib/ticker-search-tracker';
import { TrendingTopicsList } from './TrendingTopicsList';

const COUNTRIES = [
  { code: 'global', flag: '🌍', name: 'Global' },
  { code: 'us', flag: '🇺🇸', name: 'United States' },
  { code: 'gb', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'de', flag: '🇩🇪', name: 'Germany' },
  { code: 'fr', flag: '🇫🇷', name: 'France' },
  { code: 'es', flag: '🇪🇸', name: 'Spain' },
  { code: 'it', flag: '🇮🇹', name: 'Italy' },
  { code: 'pt', flag: '🇵🇹', name: 'Portugal' },
  { code: 'br', flag: '🇧🇷', name: 'Brazil' },
  { code: 'nl', flag: '🇳🇱', name: 'Netherlands' },
  { code: 'pl', flag: '🇵🇱', name: 'Poland' },
  { code: 'ru', flag: '🇷🇺', name: 'Russia' },
  { code: 'ua', flag: '🇺🇦', name: 'Ukraine' },
  { code: 'ro', flag: '🇷🇴', name: 'Romania' },
  { code: 'bg', flag: '🇧🇬', name: 'Bulgaria' },
  { code: 'cs', flag: '🇨🇿', name: 'Czech Republic' },
  { code: 'sk', flag: '🇸🇰', name: 'Slovakia' },
  { code: 'hr', flag: '🇭🇷', name: 'Croatia' },
  { code: 'sr', flag: '🇷🇸', name: 'Serbia' },
  { code: 'hu', flag: '🇭🇺', name: 'Hungary' },
  { code: 'el', flag: '🇬🇷', name: 'Greece' },
  { code: 'tr', flag: '🇹🇷', name: 'Turkey' },
  { code: 'da', flag: '🇩🇰', name: 'Denmark' },
  { code: 'sv', flag: '🇸🇪', name: 'Sweden' },
  { code: 'no', flag: '🇳🇴', name: 'Norway' },
  { code: 'fi', flag: '🇫🇮', name: 'Finland' },
  { code: 'et', flag: '🇪🇪', name: 'Estonia' },
  { code: 'lt', flag: '🇱🇹', name: 'Lithuania' },
  { code: 'lv', flag: '🇱🇻', name: 'Latvia' },
  { code: 'ar', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: 'ae', flag: '🇦🇪', name: 'UAE' },
  { code: 'he', flag: '🇮🇱', name: 'Israel' },
  { code: 'fa', flag: '🇮🇷', name: 'Iran' },
  { code: 'in', flag: '🇮🇳', name: 'India' },
  { code: 'pk', flag: '🇵🇰', name: 'Pakistan' },
  { code: 'bd', flag: '🇧🇩', name: 'Bangladesh' },
  { code: 'np', flag: '🇳🇵', name: 'Nepal' },
  { code: 'lk', flag: '🇱🇰', name: 'Sri Lanka' },
  { code: 'jp', flag: '🇯🇵', name: 'Japan' },
  { code: 'kr', flag: '🇰🇷', name: 'South Korea' },
  { code: 'cn', flag: '🇨🇳', name: 'China' },
  { code: 'th', flag: '🇹🇭', name: 'Thailand' },
  { code: 'vn', flag: '🇻🇳', name: 'Vietnam' },
  { code: 'id', flag: '🇮🇩', name: 'Indonesia' },
  { code: 'my', flag: '🇲🇾', name: 'Malaysia' },
  { code: 'ph', flag: '🇵🇭', name: 'Philippines' },
  { code: 'mm', flag: '🇲🇲', name: 'Myanmar' },
  { code: 'kh', flag: '🇰🇭', name: 'Cambodia' },
  { code: 'la', flag: '🇱🇦', name: 'Laos' },
  { code: 'mn', flag: '🇲🇳', name: 'Mongolia' },
  { code: 'kz', flag: '🇰🇿', name: 'Kazakhstan' },
  { code: 'uz', flag: '🇺🇿', name: 'Uzbekistan' },
  { code: 'az', flag: '🇦🇿', name: 'Azerbaijan' },
  { code: 'ge', flag: '🇬🇪', name: 'Georgia' },
  { code: 'am', flag: '🇦🇲', name: 'Armenia' },
  { code: 'au', flag: '🇦🇺', name: 'Australia' },
  { code: 'ca', flag: '🇨🇦', name: 'Canada' },
  { code: 'sg', flag: '🇸🇬', name: 'Singapore' },
  { code: 'ng', flag: '🇳🇬', name: 'Nigeria' },
  { code: 'za', flag: '🇿🇦', name: 'South Africa' },
  { code: 'ke', flag: '🇰🇪', name: 'Kenya' },
  { code: 'et2', flag: '🇪🇹', name: 'Ethiopia' },
  { code: 'mg', flag: '🇲🇬', name: 'Madagascar' },
  { code: 'so', flag: '🇸🇴', name: 'Somalia' },
  { code: 'pe', flag: '🇵🇪', name: 'Peru' },
  { code: 'sq', flag: '🇦🇱', name: 'Albania' },
  { code: 'tj', flag: '🇹🇯', name: 'Tajikistan' },
  { code: 'tm', flag: '🇹🇲', name: 'Turkmenistan' },
  { code: 'kg', flag: '🇰🇬', name: 'Kyrgyzstan' },
  { code: 'nz', flag: '🇳🇿', name: 'New Zealand' },
  { code: 'ps', flag: '🇵🇸', name: 'Palestine' },
  { code: 'jo', flag: '🇯🇴', name: 'Jordan' },
  { code: 'lb', flag: '🇱🇧', name: 'Lebanon' },
  { code: 'iq', flag: '🇮🇶', name: 'Iraq' },
  { code: 'eg', flag: '🇪🇬', name: 'Egypt' },
];

type Tab = 'posts' | 'tickers';

const TICKER_PERIODS: { value: TickerPeriod; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
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
}

export const WhatsHappening = memo(function WhatsHappening({ showCountrySelector = false }: WhatsHappeningProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('posts');
  const [hasTabInteracted, setHasTabInteracted] = useState(false);
  const [tickerPeriod, setTickerPeriod] = useState<TickerPeriod>('all');
  const tickerDirRef = useRef(0);
  const [isTickerAutoRotating, setIsTickerAutoRotating] = useState(true);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const countryDropdownRef = useRef<HTMLDivElement>(null);

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
    setCountrySearch('');
    if (code !== 'global') {
      toast.info(t('sidebar.comingSoon'));
    }
  }, [t]);

  const filteredCountries = countrySearch.trim()
    ? COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRIES;

  // Prefetch all ticker periods
  useQuery({ queryKey: ['trending-tickers', '1d' as TickerPeriod], queryFn: () => getTopTickers(10, '1d'), staleTime: 60_000, refetchInterval: 120_000, placeholderData: (p: any) => p });
  useQuery({ queryKey: ['trending-tickers', '1w' as TickerPeriod], queryFn: () => getTopTickers(10, '1w'), staleTime: 60_000, refetchInterval: 120_000, placeholderData: (p: any) => p });
  useQuery({ queryKey: ['trending-tickers', '1m' as TickerPeriod], queryFn: () => getTopTickers(10, '1m'), staleTime: 60_000, refetchInterval: 120_000, placeholderData: (p: any) => p });
  useQuery({ queryKey: ['trending-tickers', '1y' as TickerPeriod], queryFn: () => getTopTickers(10, '1y'), staleTime: 60_000, refetchInterval: 120_000, placeholderData: (p: any) => p });
  const { data: topTickers = [] } = useQuery({
    queryKey: ['trending-tickers', tickerPeriod],
    queryFn: () => getTopTickers(10, tickerPeriod),
    staleTime: 60_000,
    refetchInterval: 120_000,
    placeholderData: (previousData) => previousData,
  });

  // Auto-rotate ticker periods every 5 seconds
  useEffect(() => {
    if (!isTickerAutoRotating || activeTab !== 'tickers') return;
    const interval = setInterval(() => {
      setTickerPeriod(prev => {
        const idx = TICKER_PERIODS.findIndex(p => p.value === prev);
        const next = TICKER_PERIODS[(idx + 1) % TICKER_PERIODS.length].value;
        tickerDirRef.current = 1;
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isTickerAutoRotating, activeTab]);

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
  }, []);

  return (
    <div className="bg-zinc-900 rounded-2xl p-4 relative">
      <div className={cn("flex items-center mb-3", showCountrySelector ? "justify-between" : "justify-center")}>
        <h3 className="font-bold text-lg text-white">{t('sidebar.talkOfTheTown')}</h3>
        {showCountrySelector && (
          <div ref={countryDropdownRef} className="relative">
            <button
              onClick={() => setShowCountryDropdown(prev => !prev)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 transition-colors text-xs text-zinc-400 hover:text-white"
            >
              <Globe className="w-3 h-3" />
              <span>{t('sidebar.global')}</span>
              <ChevronDown className={cn('w-3 h-3 transition-transform', showCountryDropdown && 'rotate-180')} />
            </button>
            {showCountryDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-700/50 rounded-xl shadow-xl z-50 py-1 max-h-72 flex flex-col">
                <div className="px-2 py-1.5 border-b border-zinc-700/50">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search countries..."
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
                    <p className="text-xs text-zinc-500 text-center py-3">No countries found</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <LayoutGroup id="tott">
        <div className="relative flex bg-zinc-800/50 rounded-xl p-0.5 mb-3">
          {(['posts', 'tickers'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => handleMainTabChange(tab)}
              className="relative flex-1 py-1.5 text-xs font-medium rounded-[10px] z-10 transition-colors duration-150"
            >
              {activeTab === tab && (
                hasTabInteracted ? (
                  <motion.div
                    layoutId="tott-tab-bg"
                    className="absolute inset-0 rounded-[10px] bg-gradient-to-br from-white/20 via-white/10 to-white/5 border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                ) : (
                  <div className="absolute inset-0 rounded-[10px] bg-gradient-to-br from-white/20 via-white/10 to-white/5 border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.3)]" />
                )
              )}
              <span className={cn(
                'relative z-10 transition-colors duration-150',
                activeTab === tab ? 'text-white' : 'text-zinc-500'
              )}>
                {t(`sidebar.${tab}`)}
              </span>
            </button>
          ))}
        </div>
      </LayoutGroup>

      {/* Tab content */}
      <div style={{ minHeight: 280, maxHeight: 400 }} className="relative overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
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
                        {ticker.search_count} {t('sidebar.searches')}
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

      {/* View all button */}
      <LiquidGlassBubble2
        label={t('commandCentre.viewAll')}
        onClick={() => navigate(showCountrySelector && activeTab === 'tickers' ? '/app/top-100' : '/app/explore')}
        width="100%"
        height="auto"
        className="-mt-1 [&>div]:!py-2 [&>div]:from-zinc-900/90 [&>div]:to-white/5 [&>div]:before:from-transparent [&>div]:after:from-transparent"
      />
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

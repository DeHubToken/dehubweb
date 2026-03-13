import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Globe, ChevronDown } from 'lucide-react';
import { motion, LayoutGroup, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { TickerLogo } from './TickerLogo';
import { cn } from '@/lib/utils';
import { getTopTickers, type TickerPeriod } from '@/lib/ticker-search-tracker';
import { TrendingTopicsList } from './TrendingTopicsList';

const COUNTRIES = [
  { code: 'global', flag: '🌍', name: 'Global' },
  { code: 'us', flag: '🇺🇸', name: 'United States' },
  { code: 'gb', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'de', flag: '🇩🇪', name: 'Germany' },
  { code: 'fr', flag: '🇫🇷', name: 'France' },
  { code: 'jp', flag: '🇯🇵', name: 'Japan' },
  { code: 'kr', flag: '🇰🇷', name: 'South Korea' },
  { code: 'in', flag: '🇮🇳', name: 'India' },
  { code: 'br', flag: '🇧🇷', name: 'Brazil' },
  { code: 'tr', flag: '🇹🇷', name: 'Turkey' },
  { code: 'au', flag: '🇦🇺', name: 'Australia' },
  { code: 'ca', flag: '🇨🇦', name: 'Canada' },
  { code: 'es', flag: '🇪🇸', name: 'Spain' },
  { code: 'it', flag: '🇮🇹', name: 'Italy' },
  { code: 'nl', flag: '🇳🇱', name: 'Netherlands' },
  { code: 'sg', flag: '🇸🇬', name: 'Singapore' },
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

export const WhatsHappening = memo(function WhatsHappening() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('posts');
  const [tickerPeriod, setTickerPeriod] = useState<TickerPeriod>('all');
  const tickerDirRef = useRef(0);
  const [isTickerAutoRotating, setIsTickerAutoRotating] = useState(true);

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

  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <div className="flex items-center justify-center mb-3">
        <h3 className="font-bold text-lg text-white text-center">{t('sidebar.talkOfTheTown')}</h3>
      </div>

      {/* Tab switcher */}
      <LayoutGroup id="tott">
        <div className="relative flex bg-zinc-800/50 rounded-xl p-0.5 mb-3">
          {(['posts', 'tickers'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="relative flex-1 py-1.5 text-xs font-medium rounded-[10px] z-10 transition-colors duration-150"
            >
              {activeTab === tab && (
                <motion.div
                  layoutId="tott-tab-bg"
                  className="absolute inset-0 rounded-[10px] bg-gradient-to-br from-white/20 via-white/10 to-white/5 border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
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
      <button
        onClick={() => navigate('/app/explore')}
        className="w-full mt-3 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 transition-colors"
      >
        {t('commandCentre.viewAll')}
      </button>
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

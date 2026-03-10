import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Search } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { TickerLogo } from './TickerLogo';
import { setFilterValue } from '@/hooks/use-persisted-feed-filter';
import { cn } from '@/lib/utils';
import { getTopTickers, type TickerPeriod } from '@/lib/ticker-search-tracker';
import { useTrendingCategories } from '@/hooks/use-trending-categories';

type Tab = 'posts' | 'tickers';

const TICKER_PERIODS: { value: TickerPeriod; label: string }[] = [
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];

export const WhatsHappening = memo(function WhatsHappening() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('posts');
  const [tickerPeriod, setTickerPeriod] = useState<TickerPeriod>('all');

  const { data: categories = [] } = useTrendingCategories();

  const { data: topTickers = [] } = useQuery({
    queryKey: ['trending-tickers', tickerPeriod],
    queryFn: () => getTopTickers(10, tickerPeriod),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const handleCategoryClick = (categoryName: string) => {
    setFilterValue('home', 'category', categoryName);
    window.dispatchEvent(new CustomEvent('category-filter-changed', { detail: categoryName }));
    navigate('/app');
  };

  const handleTickerClick = (symbol: string) => {
    navigate(`/app/explore?q=${encodeURIComponent('$' + symbol)}`);
  };

  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <div className="flex items-center justify-center mb-3">
        <h3 className="font-bold text-lg text-white text-center">{t('sidebar.talkOfTheTown')}</h3>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1.5 mb-3">
        {(['posts', 'tickers'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'relative flex-1 py-1.5 text-xs font-medium rounded-xl transition-colors duration-200 overflow-hidden',
              'backdrop-blur-xl border',
              activeTab === tab
                ? 'bg-gradient-to-br from-white/20 via-white/10 to-white/5 border-white/30 text-white shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.1)]'
                : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-300 hover:bg-white/10'
            )}
          >
            {activeTab === tab && (
              <motion.div
                layoutId="tott-tab-indicator"
                className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                layoutScroll
              />
            )}
            <span className="relative z-10">{t(`sidebar.${tab}`)}</span>
          </button>
        ))}
      </div>

      {/* Tab content - fixed min-height prevents scroll jumps */}
      <div style={{ minHeight: 280 }}>
        <AnimatePresence mode="wait" initial={false}>
          {/* Posts tab */}
          {activeTab === 'posts' && (
            <motion.div
              key="posts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {categories.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {categories.map((cat, i) => (
                    <button
                      key={cat.name}
                      onClick={() => handleCategoryClick(cat.name)}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-xl hover:bg-zinc-800/60 transition-colors group text-left"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs text-zinc-500 font-mono w-4 shrink-0">{i + 1}</span>
                        <span className="text-sm text-zinc-200 truncate group-hover:text-white transition-colors">
                          {cat.name}
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-500 shrink-0 ml-2">
                        {cat.post_count} {cat.post_count === 1 ? 'post' : 'posts'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState icon={LayoutGrid} text={t('sidebar.noCategoriesYet')} />
              )}
            </motion.div>
          )}

          {/* Tickers tab */}
          {activeTab === 'tickers' && (
            <motion.div
              key="tickers"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Period tabs */}
              <div className="flex gap-2 mb-2 px-1">
                {TICKER_PERIODS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setTickerPeriod(p.value)}
                    className={cn(
                      'text-[10px] font-semibold transition-colors duration-150',
                      tickerPeriod === p.value
                        ? 'text-white'
                        : 'text-zinc-500 hover:text-zinc-300'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

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
          )}
        </AnimatePresence>
      </div>
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

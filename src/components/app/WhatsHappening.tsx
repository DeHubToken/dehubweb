import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Search } from 'lucide-react';
import { motion, LayoutGroup } from 'framer-motion';
import { TickerLogo } from './TickerLogo';
import { setFilterValue } from '@/hooks/use-persisted-feed-filter';
import { cn } from '@/lib/utils';
import { getTopTickers, type TickerPeriod } from '@/lib/ticker-search-tracker';
import { useTrendingCategories, type TopicPeriod } from '@/hooks/use-trending-categories';

type Tab = 'posts' | 'tickers';

const TOPIC_PERIODS: { value: TopicPeriod; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];

const TICKER_PERIODS: { value: TickerPeriod; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];

export const WhatsHappening = memo(function WhatsHappening() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('posts');
  const [topicPeriod, setTopicPeriod] = useState<TopicPeriod>('all');
  const [tickerPeriod, setTickerPeriod] = useState<TickerPeriod>('all');

  const { data: categories = [] } = useTrendingCategories(topicPeriod);

  const { data: topTickers = [] } = useQuery({
    queryKey: ['trending-tickers', tickerPeriod],
    queryFn: () => getTopTickers(10, tickerPeriod),
    staleTime: 60_000,
    refetchInterval: 120_000,
    placeholderData: (previousData) => previousData,
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

      {/* Tab switcher - single connected toggle */}
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

      {/* Tab content - both tabs always mounted, CSS toggles visibility */}
      <div style={{ minHeight: 280 }} className="relative">
        {/* Posts tab */}
        <div
          className={cn(
            'transition-opacity duration-150',
            activeTab === 'posts'
              ? 'opacity-100 relative z-10'
              : 'opacity-0 pointer-events-none absolute inset-0'
          )}
        >
          {/* Period tabs */}
          <div className="flex mb-2">
            {TOPIC_PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setTopicPeriod(p.value)}
                className={cn(
                  'flex-1 text-xs font-semibold transition-colors duration-150 text-center py-1',
                  topicPeriod === p.value
                    ? 'text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

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
                onClick={() => setTickerPeriod(p.value)}
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
        </div>
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

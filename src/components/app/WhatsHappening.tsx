import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Search } from 'lucide-react';
import { TickerLogo } from './TickerLogo';
import { setFilterValue } from '@/hooks/use-persisted-feed-filter';
import { cn } from '@/lib/utils';
import { getTopTickers } from '@/lib/ticker-search-tracker';
import { useTrendingCategories } from '@/hooks/use-trending-categories';

type Tab = 'posts' | 'tickers';

export const WhatsHappening = memo(function WhatsHappening() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('posts');

  const { data: categories = [] } = useTrendingCategories();

  const { data: topTickers = [] } = useQuery({
    queryKey: ['trending-tickers'],
    queryFn: () => getTopTickers(8),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const handleCategoryClick = (categoryName: string) => {
    setFilterValue('home', 'category', categoryName);
    window.dispatchEvent(new CustomEvent('category-selected', { detail: categoryName }));
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
      <div className="flex gap-1 bg-zinc-800/60 rounded-xl p-1 mb-3">
        {(['posts', 'tickers'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 py-1.5 text-xs font-medium rounded-lg transition-all duration-200',
              activeTab === tab
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-300'
            )}
          >
            {t(`sidebar.${tab}`)}
          </button>
        ))}
      </div>

      {/* Posts tab */}
      {activeTab === 'posts' && (
        categories.length > 0 ? (
          <div className="flex flex-col gap-1">
            {categories.map((cat, i) => (
              <button
                key={cat.name}
                onClick={() => handleCategoryClick(cat.name)}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl hover:bg-zinc-800/60 transition-colors group text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xs text-zinc-500 font-mono w-4 shrink-0">{i + 1}</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <LayoutGrid className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="text-sm text-zinc-200 truncate group-hover:text-white transition-colors">
                      {cat.name}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] text-zinc-500 shrink-0 ml-2">
                  {cat.post_count} {cat.post_count === 1 ? 'post' : 'posts'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={LayoutGrid} text={t('sidebar.noCategoriesYet')} />
        )
      )}

      {/* Tickers tab */}
      {activeTab === 'tickers' && (
        topTickers.length > 0 ? (
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
        )
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

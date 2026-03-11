import { memo, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { setFilterValue } from '@/hooks/use-persisted-feed-filter';
import { cn } from '@/lib/utils';
import { useTrendingCategories, type TopicPeriod } from '@/hooks/use-trending-categories';

const TOPIC_PERIODS: { value: TopicPeriod; label: string }[] = [
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

interface TrendingTopicsListProps {
  /** Override default period */
  defaultPeriod?: TopicPeriod;
  /** Minimum height for the list container */
  minHeight?: number;
}

export const TrendingTopicsList = memo(function TrendingTopicsList({
  defaultPeriod = 'all',
  minHeight = 280,
}: TrendingTopicsListProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [topicPeriod, setTopicPeriod] = useState<TopicPeriod>(defaultPeriod);
  const dirRef = useRef(0);

  // Prefetch all periods
  useTrendingCategories('1d');
  useTrendingCategories('1w');
  useTrendingCategories('1m');
  useTrendingCategories('1y');
  const { data: categories = [] } = useTrendingCategories(topicPeriod);

  const handlePeriodChange = useCallback((newPeriod: TopicPeriod) => {
    dirRef.current = PERIOD_INDEX[newPeriod] - PERIOD_INDEX[topicPeriod];
    setTopicPeriod(newPeriod);
  }, [topicPeriod]);

  const handleCategoryClick = (categoryName: string) => {
    setFilterValue('home', 'category', categoryName);
    window.dispatchEvent(new CustomEvent('category-filter-changed', { detail: categoryName }));
    navigate('/app');
  };

  return (
    <div style={{ minHeight }} className="relative overflow-hidden">
      {/* Period tabs */}
      <div className="flex mb-2">
        {TOPIC_PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => handlePeriodChange(p.value)}
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

      <AnimatePresence mode="popLayout" custom={dirRef.current} initial={false}>
        <motion.div
          key={topicPeriod}
          custom={dirRef.current}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={slideTransition}
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
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center mb-2.5">
                <LayoutGrid className="w-5 h-5 text-zinc-500" />
              </div>
              <p className="text-zinc-400 text-xs">{t('sidebar.noCategoriesYet')}</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

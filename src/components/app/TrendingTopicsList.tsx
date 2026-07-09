import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { setFilterValue } from '@/hooks/use-persisted-feed-filter';
import { cn } from '@/lib/utils';
import { useTrendingCategories, useAllTrendingCategories, type TopicPeriod, type CategoryCount } from '@/hooks/use-trending-categories';

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

const PAGE_SIZE = 10;

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
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef<HTMLDivElement>(null);


  const { data: limitedCategories = [] } = useTrendingCategories(topicPeriod);
  
  // Fetch ALL categories for the "all" period (unlimited)
  const { data: allCategories = [] } = useAllTrendingCategories();

  // Use unlimited data for "all" period, limited for others
  const categories: CategoryCount[] = topicPeriod === 'all' ? allCategories : limitedCategories;
  const visibleCategories = topicPeriod === 'all' ? categories.slice(0, visibleCount) : categories;
  const hasMore = topicPeriod === 'all' && visibleCount < categories.length;

  // Reset visible count when period changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [topicPeriod]);

  // Infinite scroll observer for "all" period
  useEffect(() => {
    if (topicPeriod !== 'all' || !hasMore) return;
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => prev + PAGE_SIZE);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [topicPeriod, hasMore]);

  // Auto-rotate through periods every 5 seconds
  useEffect(() => {
    if (!isAutoRotating) return;
    const interval = setInterval(() => {
      setTopicPeriod(prev => {
        const idx = TOPIC_PERIODS.findIndex(p => p.value === prev);
        const next = TOPIC_PERIODS[(idx + 1) % TOPIC_PERIODS.length].value;
        dirRef.current = 1;
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isAutoRotating]);

  const handlePeriodChange = useCallback((newPeriod: TopicPeriod) => {
    dirRef.current = PERIOD_INDEX[newPeriod] - PERIOD_INDEX[topicPeriod];
    setTopicPeriod(newPeriod);
    setIsAutoRotating(false);
    setTimeout(() => setIsAutoRotating(true), 30000);
  }, [topicPeriod]);

  const handleCategoryClick = (categoryName: string) => {
    // Add to multi-select array (read existing, toggle)
    const existing: string[] = (() => {
      try {
        const stored = sessionStorage.getItem('feed-filter-states');
        if (stored) {
          const parsed = JSON.parse(stored);
          return parsed?.home?.categories || [];
        }
      } catch {}
      return [];
    })();
    
    const updated = existing.includes(categoryName)
      ? existing.filter((c: string) => c !== categoryName)
      : [...existing, categoryName];
    
    setFilterValue('home', 'categories', updated);
    window.dispatchEvent(new CustomEvent('category-filter-changed', { detail: categoryName }));
    navigate('/app');
  };

  return (
    <div style={{ minHeight }} className="relative overflow-hidden">
      {/* Period tabs */}
      <div className="flex mb-2">
        {TOPIC_PERIODS.map(p => (
          <button
            data-tab-btn
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
          {visibleCategories.length > 0 ? (
            <div className="flex flex-col gap-1">
              {visibleCategories.map((cat, i) => {
                const isPlaceholder = cat.name === '-';

                return (
                  <button
                    data-tab-btn
                    key={`${cat.name}-${i}`}
                    onClick={() => !isPlaceholder && handleCategoryClick(cat.name)}
                    disabled={isPlaceholder}
                    className={cn(
                      'flex items-center justify-between w-full px-3 py-2 rounded-xl transition-colors group text-left',
                      isPlaceholder
                        ? 'opacity-60 cursor-default'
                        : 'hover:bg-zinc-800/60'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs text-zinc-500 font-mono w-4 shrink-0">{i + 1}</span>
                      <span className="text-sm text-zinc-200 truncate transition-colors">
                        {cat.name}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-500 shrink-0 ml-2">
                      {isPlaceholder ? '-' : `${cat.post_count} ${cat.post_count === 1 ? 'post' : 'posts'}`}
                    </span>
                  </button>
                );
              })}
              {/* Infinite scroll trigger for "all" period */}
              {hasMore && (
                <div ref={loaderRef} className="flex items-center justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                </div>
              )}
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

import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, TrendingUp } from 'lucide-react';
import { setFilterValue } from '@/hooks/use-persisted-feed-filter';
import { cn } from '@/lib/utils';
import type { UnifiedFeedItem } from '@/hooks/use-unified-feed';

/** Max categories shown in sidebar */
const MAX_CATEGORIES = 8;

interface TrendingCategory {
  name: string;
  post_count: number;
}

/**
 * Derive trending categories from feed data already in TanStack Query cache.
 */
function deriveTrendingCategories(queryClient: ReturnType<typeof useQueryClient>): TrendingCategory[] {
  // Look for any cached unified-feed data
  const queries = queryClient.getQueriesData<{
    pages?: Array<{ items?: UnifiedFeedItem[] }>;
  }>({ queryKey: ['unified-feed'] });

  const categoryMap = new Map<string, number>();

  for (const [, data] of queries) {
    if (!data?.pages) continue;
    for (const page of data.pages) {
      if (!page?.items) continue;
      for (const item of page.items) {
        if (item.category && Array.isArray(item.category)) {
          for (const cat of item.category) {
            const name = cat.trim();
            if (name) {
              categoryMap.set(name, (categoryMap.get(name) || 0) + 1);
            }
          }
        }
      }
    }
  }

  return Array.from(categoryMap.entries())
    .map(([name, post_count]) => ({ name, post_count }))
    .sort((a, b) => b.post_count - a.post_count)
    .slice(0, MAX_CATEGORIES);
}

export const WhatsHappening = memo(function WhatsHappening() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <div className="flex items-center justify-center mb-4">
        <h3 className="font-bold text-lg text-white text-center">{t('sidebar.talkOfTheTown')}</h3>
      </div>
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
          <LayoutGrid className="w-6 h-6 text-zinc-500" />
        </div>
        <p className="text-zinc-400 text-sm">{t('sidebar.nothingTrending')}</p>
      </div>
    </div>
  );
});


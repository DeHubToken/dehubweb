/**
 * WhatsHappening / Talk of the Town Sidebar Widget
 * ==================================================
 * Shows trending categories derived from the home feed data.
 * 
 * @module components/app/WhatsHappening
 */

import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
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

export function WhatsHappening() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categories = deriveTrendingCategories(queryClient);

  const handleCategoryClick = (categoryName: string) => {
    setFilterValue('home', 'category', categoryName);
    navigate('/app');
  };

  if (categories.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4 pr-1.5">
          <h3 className="font-bold text-lg text-white">Talk of The Town</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
            <LayoutGrid className="w-6 h-6 text-zinc-500" />
          </div>
          <p className="text-zinc-400 text-sm">Nothing trending yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4 pr-1.5">
        <h3 className="font-bold text-lg text-white">Talk of The Town</h3>
      </div>
      <div className="space-y-3">
        {categories.map((cat, i) => (
          <button
            key={cat.name}
            onClick={() => handleCategoryClick(cat.name)}
            className="w-full text-left group"
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-zinc-500 w-4">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white group-hover:text-white group-hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.5)] truncate transition-all duration-200">
                  {cat.name}
                </p>
                <p className="text-xs text-zinc-500">{cat.post_count} posts</p>
              </div>
              <TrendingUp className="w-3.5 h-3.5 text-zinc-600 group-hover:text-white group-hover:drop-shadow-[0_0_4px_rgba(255,255,255,0.4)] transition-all duration-200" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
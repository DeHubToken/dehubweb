/**
 * WhatsHappening / Categories Sidebar Widget
 * ============================================
 * Shows top categories by content count. Clicking navigates to
 * the home feed pre-filtered to that category.
 * 
 * @module components/app/WhatsHappening
 */

import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid } from 'lucide-react';
import { getCategories } from '@/lib/api/dehub';
import { setFilterValue } from '@/hooks/use-persisted-feed-filter';
import { cn } from '@/lib/utils';

/** Max categories shown in sidebar */
const MAX_CATEGORIES = 8;

export function WhatsHappening() {
  const navigate = useNavigate();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['dehub-categories'],
    queryFn: getCategories,
    staleTime: 5 * 60 * 1000,
  });

  // Sort by nft_count descending, take top N
  const topCategories = [...categories]
    .sort((a, b) => (b.nft_count ?? 0) - (a.nft_count ?? 0))
    .slice(0, MAX_CATEGORIES);

  const handleCategoryClick = (categoryId: string) => {
    // Pre-set the home feed category filter before navigating
    setFilterValue('home', 'category', categoryId);
    navigate('/app');
  };

  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4 pr-1.5">
        <h3 className="font-bold text-lg text-white">Categories</h3>
        <Link 
          to="/app/explore" 
          className="text-sm text-white/50 hover:text-white transition-colors font-medium"
        >
          All
        </Link>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 rounded-lg bg-zinc-800 animate-pulse" />
          ))}
        </div>
      ) : topCategories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
            <LayoutGrid className="w-6 h-6 text-zinc-500" />
          </div>
          <p className="text-zinc-400 text-sm">No categories yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {topCategories.map((cat, index) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={cn(
                'flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors',
                'hover:bg-zinc-800 text-left group'
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-zinc-500 text-xs font-medium w-4 text-right flex-shrink-0">
                  {index + 1}
                </span>
                <span className="text-white font-medium truncate">
                  {cat.name}
                </span>
              </div>
              {cat.nft_count != null && (
                <span className="text-zinc-500 text-xs flex-shrink-0 ml-2">
                  {cat.nft_count.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

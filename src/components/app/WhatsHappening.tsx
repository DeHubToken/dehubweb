/**
 * WhatsHappening / Talk of the Town Sidebar Widget
 * ==================================================
 * Shows top categories ranked by content volume.
 * Clicking navigates to the home feed pre-filtered to that category.
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

  const { data: allCategories = [], isLoading } = useQuery({
    queryKey: ['dehub-categories'],
    queryFn: getCategories,
    staleTime: 1000 * 60 * 30,
  });

  const displayed = allCategories.slice(0, MAX_CATEGORIES);

  const handleCategoryClick = (categoryId: string) => {
    // Pre-set the home feed category filter
    setFilterValue('home', 'category', categoryId);
    // Dispatch event so HomeFeed re-syncs its state from sessionStorage
    window.dispatchEvent(new CustomEvent('category-filter-changed', { detail: categoryId }));
    navigate('/app');
  };

  return (
    <div className="bg-zinc-900 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4 pr-1.5">
        <h3 className="font-bold text-lg text-white">Talk of the Town</h3>
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
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
            <LayoutGrid className="w-6 h-6 text-zinc-500" />
          </div>
          <p className="text-zinc-400 text-sm">No categories yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {displayed.map((cat, index) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={cn(
                'flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors',
                'hover:bg-zinc-800 text-left group'
              )}
            >
              <span className="text-white font-medium truncate min-w-0">
                {cat.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * WhatsHappening / Talk of the Town Sidebar Widget
 * ==================================================
 * Shows trending categories ranked by post volume from the last week.
 * Data is computed server-side and cached every 5 minutes.
 * Clicking navigates to the home feed pre-filtered to that category.
 * 
 * @module components/app/WhatsHappening
 */

import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { setFilterValue } from '@/hooks/use-persisted-feed-filter';
import { cn } from '@/lib/utils';

/** Max categories shown in sidebar */
const MAX_CATEGORIES = 8;

interface TrendingCategory {
  id: string;
  name: string;
  slug: string;
  post_count: number;
}

async function fetchTrendingCategories(): Promise<TrendingCategory[]> {
  const { data, error } = await supabase
    .from('feed_cache')
    .select('data')
    .eq('cache_key', 'trending_categories')
    .maybeSingle();

  if (error || !data) return [];
  
  const parsed = data.data as { categories?: TrendingCategory[] };
  return parsed?.categories || [];
}

export function WhatsHappening() {
  const navigate = useNavigate();

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

/**
 * Feed Settings Modal
 * ====================
 * Modal for configuring feed preferences including filters and date range.
 * 
 * @module components/app/modals/FeedSettingsModal
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface FeedFilters {
  followed: boolean;
  subscribed: boolean;
  trending: boolean;
  latest: boolean;
  uploadDate: 'all' | 'today' | 'week' | 'month' | 'year';
}

const UPLOAD_DATE_OPTIONS = [
  { label: 'Any time', value: 'all' as const },
  { label: 'Today', value: 'today' as const },
  { label: 'This week', value: 'week' as const },
  { label: 'This month', value: 'month' as const },
  { label: 'This year', value: 'year' as const },
] as const;

interface FeedSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FeedFilters;
  onFiltersChange: (filters: FeedFilters) => void;
}

export function FeedSettingsModal({ 
  open, 
  onOpenChange, 
  filters, 
  onFiltersChange 
}: FeedSettingsModalProps) {
  const updateFilter = (key: keyof FeedFilters, value: boolean | string) => {
    // Mutually exclusive: trending and latest can't both be on
    if (key === 'latest' && value === true) {
      onFiltersChange({ ...filters, latest: true, trending: false });
    } else if (key === 'trending' && value === true) {
      onFiltersChange({ ...filters, trending: true, latest: false });
    } else {
      onFiltersChange({ ...filters, [key]: value });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Feed Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Toggle Filters */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Followed</p>
                <p className="text-sm text-zinc-400">Show posts from people you follow</p>
              </div>
              <Switch
                checked={filters.followed}
                onCheckedChange={(checked) => updateFilter('followed', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Subscribed</p>
                <p className="text-sm text-zinc-400">Show posts from your subscriptions</p>
              </div>
              <Switch
                checked={filters.subscribed}
                onCheckedChange={(checked) => updateFilter('subscribed', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Trending</p>
                <p className="text-sm text-zinc-400">Show trending content first</p>
              </div>
              <Switch
                checked={filters.trending}
                onCheckedChange={(checked) => updateFilter('trending', checked)}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Latest</p>
                <p className="text-sm text-zinc-400">Show latest content first</p>
              </div>
              <Switch
                checked={filters.latest}
                onCheckedChange={(checked) => updateFilter('latest', checked)}
              />
            </div>
          </div>

          {/* Upload Date Filter */}
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div>
              <p className="text-white font-medium">Upload date</p>
              <p className="text-sm text-zinc-400">Filter by when content was posted</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {UPLOAD_DATE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateFilter('uploadDate', option.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    filters.uploadDate === option.value
                      ? 'bg-white text-black'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Feed Settings Modal
 * ====================
 * Modal for configuring feed preferences.
 * 
 * @module components/app/modals/FeedSettingsModal
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

export interface FeedFilters {
  followed: boolean;
  subscribed: boolean;
  trending: boolean;
  latest: boolean;
}

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
  const updateFilter = (key: keyof FeedFilters, value: boolean) => {
    // Mutually exclusive: trending and latest can't both be on
    if (key === 'latest' && value) {
      onFiltersChange({ ...filters, latest: true, trending: false });
    } else if (key === 'trending' && value) {
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
        
        <div className="space-y-4 py-4">
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
      </DialogContent>
    </Dialog>
  );
}

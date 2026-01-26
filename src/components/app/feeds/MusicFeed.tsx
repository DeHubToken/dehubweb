/**
 * Music Feed Component
 * ====================
 * Displays music/audio uploads and music videos in the main feed.
 * Currently shows empty state - awaiting real API data.
 * 
 * @module components/app/feeds/MusicFeed
 */

import { useState } from 'react';
import { Play, Music, Mic2, Radio, Disc3, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// COMPONENTS
// ============================================================================

type MusicSubTab = 'all' | 'tracks' | 'videos' | 'podcasts' | 'live';

const MUSIC_SUB_TABS: { icon: typeof Music; label: string; value: MusicSubTab }[] = [
  { icon: Music, label: 'All', value: 'all' },
  { icon: Disc3, label: 'Tracks', value: 'tracks' },
  { icon: Play, label: 'Videos', value: 'videos' },
  { icon: Mic2, label: 'Podcasts', value: 'podcasts' },
  { icon: Radio, label: 'Live', value: 'live' },
];

function EmptyState({ type }: { type: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Music className="w-12 h-12 text-zinc-600 mb-4" />
      <h3 className="text-white font-semibold mb-2">No {type} yet</h3>
      <p className="text-zinc-500 text-sm max-w-[280px]">
        Music content will appear here once creators start uploading.
      </p>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface MusicFeedProps {
  showFilters?: boolean;
  isRefreshing?: boolean;
  refreshKey?: number;
}

export function MusicFeed({ showFilters = false, isRefreshing = false }: MusicFeedProps) {
  const [activeSubTab, setActiveSubTab] = useState<MusicSubTab>('all');

  const getEmptyLabel = () => {
    switch (activeSubTab) {
      case 'tracks': return 'tracks';
      case 'videos': return 'music videos';
      case 'podcasts': return 'podcasts';
      case 'live': return 'live streams';
      default: return 'music content';
    }
  };

  if (isRefreshing) {
    return (
      <div className="p-2 sm:p-3 flex items-center justify-center py-32">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-3">
      {/* Sub-tab Navigation (only shown when filters toggled) */}
      {showFilters && (
        <div className="bg-zinc-900 rounded-2xl p-2 mb-3">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
            {MUSIC_SUB_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveSubTab(tab.value)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl transition-colors text-sm whitespace-nowrap text-white',
                  activeSubTab === tab.value && 'bg-zinc-800'
                )}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      <EmptyState type={getEmptyLabel()} />
    </div>
  );
}

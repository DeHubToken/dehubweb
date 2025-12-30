import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EXPLORE_TABS, RECENT_SEARCHES, EXPLORE_TRENDING } from '@/constants/app.constants';
import { cn } from '@/lib/utils';

export default function ExplorePage() {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="min-h-screen">
      {/* Search Header - Bento Style */}
      <div className="sticky top-0 bg-black/80 backdrop-blur-sm z-10 p-2 sm:p-3 space-y-2 sm:space-y-3">
        {/* Search Input Bento */}
        <div className="bg-zinc-900 rounded-2xl p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for people, posts, or content..."
              className="w-full pl-12 pr-4 py-3 bg-zinc-800 border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:border-zinc-600 text-sm sm:text-base"
            />
          </div>
        </div>

        {/* Tabs Bento */}
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex w-full">
            {EXPLORE_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 rounded-xl transition-colors text-sm whitespace-nowrap',
                  activeTab === tab.value
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'
                )}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-2 sm:p-3 space-y-2 mt-[3px]">
        {/* Recent Searches Bento */}
        <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Recent Searches</h2>
          <div className="flex flex-wrap gap-2">
            {RECENT_SEARCHES.map((term) => (
              <button
                key={term}
                onClick={() => setSearchQuery(term)}
                className="px-3 sm:px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors text-sm"
              >
                {term}
              </button>
            ))}
          </div>
        </div>

        {/* Trending Bento */}
        <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mt-[6px]">
          <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Trending</h2>
          <div className="space-y-3">
            {EXPLORE_TRENDING.map((item) => (
              <div
                key={item.tag}
                className="flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">{item.tag}</p>
                  <p className="text-zinc-500 text-sm">{item.postCount}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-zinc-700 text-white hover:bg-zinc-800 bg-transparent flex-shrink-0"
                >
                  Follow
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

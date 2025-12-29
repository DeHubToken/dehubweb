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
      {/* Search Header */}
      <div className="sticky top-0 bg-black/80 backdrop-blur-sm border-b border-zinc-800 z-10 p-4">
        <div className="relative max-w-xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for people, posts, or content..."
            className="w-full pl-12 pr-4 py-3 bg-zinc-900 border-zinc-800 rounded-full text-white placeholder:text-zinc-500 focus:border-zinc-600 text-base"
          />
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-2 mt-4">
          {EXPLORE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full transition-colors text-sm',
                activeTab === tab.value
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
              )}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Recent Searches */}
        <div className="bg-zinc-900 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Recent Searches</h2>
          <div className="flex flex-wrap gap-2">
            {RECENT_SEARCHES.map((term) => (
              <button
                key={term}
                onClick={() => setSearchQuery(term)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full transition-colors text-sm"
              >
                {term}
              </button>
            ))}
          </div>
        </div>

        {/* Trending */}
        <div className="bg-zinc-900 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Trending</h2>
          <div className="divide-y divide-zinc-800">
            {EXPLORE_TRENDING.map((item) => (
              <div
                key={item.tag}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-semibold text-white">{item.tag}</p>
                  <p className="text-zinc-500 text-sm">{item.postCount}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-zinc-700 text-white hover:bg-zinc-800 bg-transparent"
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

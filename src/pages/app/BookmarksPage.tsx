import { useState } from 'react';
import { Search, Bookmark, LayoutGrid, Clock, Image, Video, FileText, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const tabs = [
  { label: 'All', value: 'all', icon: LayoutGrid },
  { label: 'Recent', value: 'recent', icon: Clock },
  { label: 'Images', value: 'images', icon: Image },
  { label: 'Videos', value: 'videos', icon: Video },
  { label: 'Text Posts', value: 'text', icon: FileText },
];

export default function BookmarksPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { isAuthenticated, isLoading: isAuthLoading, connect } = useAuth();

  // Block access for unauthenticated users
  if (!isAuthLoading && !isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full lg:h-screen p-8">
        <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-6">
          <Lock className="w-8 h-8 text-zinc-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Sign in required</h2>
        <p className="text-white/60 text-center mb-6 max-w-sm">
          Log in to view and manage your saved bookmarks.
        </p>
        <Button 
          onClick={() => connect()}
          className="rounded-xl bg-white text-black hover:bg-white/90 font-semibold px-6"
        >
          Log in
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 sm:p-4">
      {/* Header */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center">
            <Bookmark className="w-6 h-6 text-zinc-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Your Bookmarks</h1>
            <p className="text-zinc-500 text-sm">Saved posts and content</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search bookmarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.value
                    ? 'bg-white text-black'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area - Empty State for logged-in users */}
      <div className="bg-zinc-900 rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <Bookmark className="w-8 h-8 text-zinc-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-3">No bookmarks yet</h2>
          <p className="text-zinc-500 max-w-sm">
            Start saving posts by tapping the bookmark icon on any post you want to save.
          </p>
        </div>
      </div>
    </div>
  );
}

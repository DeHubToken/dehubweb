import { MobileStatusBar } from '../MobileStatusBar';
import { MobileTopBar } from '../MobileTopBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { MockAvatar } from '../MockAvatar';
import { Search, TrendingUp, Image } from 'lucide-react';

const TRENDING = [
  { tag: '#DeHubDAO', posts: '2.4K posts' },
  { tag: '#Web3Social', posts: '1.8K posts' },
  { tag: '#DHBStaking', posts: '956 posts' },
  { tag: '#CreatorEconomy', posts: '743 posts' },
];

const SUGGESTED_USERS = [
  { name: 'nft_artist', bio: 'Digital artist & NFT creator' },
  { name: 'alpha_trader', bio: 'On-chain analytics & alpha' },
  { name: 'dao_builder', bio: 'Building governance tools' },
];

export function ExploreScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />
      <MobileTopBar title="Explore" />

      {/* Search bar */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 h-10 px-4 rounded-xl bg-white/[0.06] border border-white/10">
          <Search className="w-4 h-4 text-zinc-500" />
          <span className="text-zinc-500 text-sm">Search posts, users, tags...</span>
        </div>
      </div>

      {/* Trending */}
      <div className="px-4 pb-4">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-white" />
            <h2 className="text-white text-sm font-semibold">Trending</h2>
          </div>
          <div className="space-y-3">
            {TRENDING.map((item, i) => (
              <div key={item.tag} className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">{item.tag}</p>
                  <p className="text-zinc-600 text-[11px]">{item.posts}</p>
                </div>
                <span className="text-zinc-600 text-xs">#{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Suggested users */}
      <div className="px-4 pb-4">
        <h3 className="text-white text-sm font-semibold mb-3">Suggested for you</h3>
        <div className="space-y-3">
          {SUGGESTED_USERS.map((user) => (
            <div key={user.name} className="flex items-center gap-3">
              <MockAvatar name={user.name} size="md" />
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm font-semibold block truncate">{user.name}</span>
                <span className="text-zinc-500 text-xs">{user.bio}</span>
              </div>
              <button className="h-8 px-4 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-medium">
                Follow
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Explore grid */}
      <div className="px-4 pb-4">
        <h3 className="text-white text-sm font-semibold mb-3">Explore</h3>
        <div className="grid grid-cols-3 gap-1 rounded-xl overflow-hidden">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square bg-zinc-900 flex items-center justify-center">
              <Image className="w-6 h-6 text-zinc-800" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1" />
      <MobileBottomBar active="explore" />
    </div>
  );
}

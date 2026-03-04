import { MobileStatusBar } from '../MobileStatusBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { Play, Tv, Globe, Search, ChevronRight } from 'lucide-react';

const MOCK_CHANNELS = [
  { name: 'CryptoTV Live', category: 'Crypto', country: '🇺🇸', viewers: '12.4K' },
  { name: 'DeFi Daily', category: 'Finance', country: '🇬🇧', viewers: '8.2K' },
  { name: 'Web3 News', category: 'News', country: '🇩🇪', viewers: '5.1K' },
  { name: 'NFT Showcase', category: 'Art', country: '🇯🇵', viewers: '3.7K' },
  { name: 'Blockchain 101', category: 'Education', country: '🇫🇷', viewers: '2.9K' },
  { name: 'DAO Radio', category: 'Music', country: '🇧🇷', viewers: '1.5K' },
];

const CATEGORIES = ['All', 'Crypto', 'News', 'Finance', 'Music', 'Education'];

export function TVScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />

      <div className="flex items-center justify-between px-4 pt-2 pb-3">
        <div className="flex items-center gap-2">
          <Tv className="w-5 h-5 text-white" />
          <h1 className="text-white text-xl font-bold">TV</h1>
        </div>
        <Search className="w-5 h-5 text-zinc-400" />
      </div>

      {/* Categories */}
      <div className="flex gap-2 px-4 pb-4 overflow-x-auto scrollbar-hide">
        {CATEGORIES.map((cat, i) => (
          <button
            key={cat}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 ${
              i === 0 ? 'bg-white/10 text-white border border-white/20' : 'text-zinc-500'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Featured */}
      <div className="mx-4 mb-4 rounded-xl overflow-hidden border border-white/[0.08]">
        <div className="aspect-video bg-zinc-900 flex items-center justify-center relative">
          <div className="w-14 h-14 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
            <Play className="w-6 h-6 text-white ml-1" />
          </div>
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded px-2 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-[10px] text-white font-medium">LIVE</span>
            <span className="text-[10px] text-zinc-400">12.4K watching</span>
          </div>
        </div>
        <div className="p-3 bg-white/[0.02]">
          <h3 className="text-white text-sm font-semibold">CryptoTV Live — Market Analysis</h3>
          <p className="text-zinc-500 text-xs mt-0.5">Live stream • Crypto</p>
        </div>
      </div>

      {/* Channel list */}
      <div className="px-4 flex-1">
        <h3 className="text-white text-sm font-semibold mb-3">All Channels</h3>
        <div className="space-y-1">
          {MOCK_CHANNELS.map((channel) => (
            <div key={channel.name} className="flex items-center gap-3 py-2.5 rounded-lg">
              <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center border border-white/[0.06]">
                <Tv className="w-5 h-5 text-zinc-600" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm font-medium block truncate">{channel.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-600 text-xs">{channel.country}</span>
                  <span className="text-zinc-600 text-xs">{channel.category}</span>
                  <span className="text-zinc-600 text-xs">• {channel.viewers}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-700" />
            </div>
          ))}
        </div>
      </div>

      <MobileBottomBar />
    </div>
  );
}

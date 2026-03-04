import { MobileStatusBar } from '../MobileStatusBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { MockAvatar } from '../MockAvatar';
import { Bookmark, MoreHorizontal, Heart, MessageSquare } from 'lucide-react';

const MOCK_BOOKMARKS = [
  { id: '1', user: 'defi_whale', content: 'Complete guide to staking $DHB: APY breakdown, lock periods, and reward multipliers explained.', likes: 342, time: '2d' },
  { id: '2', user: 'crypto_sarah', content: 'The future of decentralized governance — why DAOs will replace traditional corporate structures.', likes: 189, time: '3d' },
  { id: '3', user: 'bob_dev', content: 'New smart contract audit results are in. Everything passed with flying colors ✅', likes: 421, time: '5d' },
  { id: '4', user: 'nft_artist', content: 'Behind the scenes of my latest digital art collection — process from sketch to mint.', likes: 567, time: '1w' },
];

export function BookmarksScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />

      <div className="flex items-center justify-between px-4 pt-2 pb-3">
        <h1 className="text-white text-xl font-bold">Bookmarks</h1>
        <span className="text-zinc-500 text-xs">{MOCK_BOOKMARKS.length} saved</span>
      </div>

      <div className="flex-1 divide-y divide-white/[0.06]">
        {MOCK_BOOKMARKS.map((post) => (
          <div key={post.id} className="px-4 py-3">
            <div className="flex gap-3">
              <MockAvatar name={post.user} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-semibold">{post.user}</span>
                  <span className="text-zinc-600 text-xs">{post.time}</span>
                  <MoreHorizontal className="w-4 h-4 text-zinc-600 ml-auto" />
                </div>
                <p className="text-zinc-300 text-[13px] leading-relaxed mt-1">{post.content}</p>
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1 text-zinc-500">
                    <Heart className="w-3.5 h-3.5" />
                    <span className="text-xs">{post.likes}</span>
                  </div>
                  <Bookmark className="w-3.5 h-3.5 text-white fill-white ml-auto" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <MobileBottomBar />
    </div>
  );
}

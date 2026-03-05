import { MobileStatusBar } from '../MobileStatusBar';
import { MobileTopBar } from '../MobileTopBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { MockAvatar } from '../MockAvatar';
import { Heart, MessageSquare, Repeat2, Share, MoreHorizontal, Image } from 'lucide-react';

const MOCK_POSTS = [
  { id: '1', user: 'alice.eth', content: 'Just minted my first NFT collection on Base 🎨 The creative freedom in web3 is unmatched.', likes: 42, comments: 8, reposts: 3, time: '2m' },
  { id: '2', user: 'bob_dev', content: 'New governance proposal is live — vote on treasury allocation for Q2 developer grants. Let\'s build together! 🏗️', likes: 128, comments: 24, reposts: 15, time: '15m', hasImage: true },
  { id: '3', user: 'crypto_sarah', content: 'The leaderboard competition is heating up 🔥 Currently sitting at #3 — who\'s coming for the top spot?', likes: 67, comments: 12, reposts: 5, time: '1h' },
  { id: '4', user: 'defi_whale', content: 'Staked 50k $DHB tokens. APY looking solid at 12.4%. Long-term holder mentality. 💎🙌', likes: 203, comments: 31, reposts: 22, time: '3h', hasImage: true },
];

const TABS = ['For You', 'Following', 'Videos', 'Images'];

export function HomeScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />
      <MobileTopBar title="DeHub" />

      {/* Stories row */}
      <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide">
        {['You', 'alice', 'bob', 'sarah', 'whale', 'dev'].map((name, i) => (
          <div key={name} className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className={`p-[2px] rounded-full ${i === 0 ? 'border border-dashed border-white/30' : 'bg-gradient-to-br from-white/30 to-white/10'}`}>
              <MockAvatar name={name} size="md" />
            </div>
            <span className="text-[10px] text-zinc-400">{name}</span>
          </div>
        ))}
      </div>

      {/* Feed tabs */}
      <div className="flex gap-1 px-4 pb-2">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              i === 0
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Posts */}
      <div className="flex-1 divide-y divide-white/[0.06]">
        {MOCK_POSTS.map((post) => (
          <div key={post.id} className="px-4 py-3">
            <div className="flex gap-3">
              <MockAvatar name={post.user} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-semibold truncate">{post.user}</span>
                  <span className="text-zinc-600 text-xs">{post.time}</span>
                  <MoreHorizontal className="w-4 h-4 text-zinc-600 ml-auto flex-shrink-0" />
                </div>
                <p className="text-zinc-300 text-[13px] leading-relaxed mt-1">{post.content}</p>
                
                {post.hasImage && (
                  <div className="mt-2 h-40 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                    <Image className="w-8 h-8 text-zinc-700" />
                  </div>
                )}

                {/* Action bar */}
                <div className="flex items-center gap-6 mt-2.5">
                  <button className="flex items-center gap-1.5 text-zinc-500">
                    <Heart className="w-4 h-4" />
                    <span className="text-xs">{post.likes}</span>
                  </button>
                  <button className="flex items-center gap-1.5 text-zinc-500">
                    <MessageSquare className="w-4 h-4" />
                    <span className="text-xs">{post.comments}</span>
                  </button>
                  <button className="flex items-center gap-1.5 text-zinc-500">
                    <Repeat2 className="w-4 h-4" />
                    <span className="text-xs">{post.reposts}</span>
                  </button>
                  <button className="text-zinc-500 ml-auto">
                    <Share className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <MobileBottomBar active="home" />
    </div>
  );
}

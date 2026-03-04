import { MobileStatusBar } from '../MobileStatusBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { MockAvatar } from '../MockAvatar';
import { Settings, ChevronLeft, Grid3X3, Video, Heart, Users, UserPlus, Link as LinkIcon } from 'lucide-react';

const MOCK_POSTS_GRID = Array.from({ length: 9 }, (_, i) => ({
  id: String(i),
  likes: Math.floor(Math.random() * 500) + 10,
}));

export function ProfileScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-1 pb-3">
        <ChevronLeft className="w-5 h-5 text-white" />
        <span className="text-white text-base font-semibold">@alice.eth</span>
        <Settings className="w-5 h-5 text-white" />
      </div>

      {/* Profile info */}
      <div className="px-4 pb-4">
        <div className="flex items-start gap-4">
          <MockAvatar name="alice" size="xl" />
          <div className="flex-1 pt-1">
            <h2 className="text-white text-lg font-bold">Alice Johnson</h2>
            <p className="text-zinc-500 text-sm">@alice.eth</p>
            <p className="text-zinc-300 text-[13px] mt-2 leading-relaxed">
              Web3 builder & designer. Creating the future of decentralized social 🌐
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-6 mt-4">
          {[
            { label: 'Posts', value: '342' },
            { label: 'Followers', value: '12.4K' },
            { label: 'Following', value: '891' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <span className="text-white text-base font-bold">{stat.value}</span>
              <span className="text-zinc-500 text-xs block">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button className="flex-1 h-9 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-medium flex items-center justify-center gap-1.5">
            <UserPlus className="w-4 h-4" />
            Follow
          </button>
          <button className="flex-1 h-9 rounded-xl bg-white/[0.06] border border-white/10 text-zinc-300 text-sm font-medium">
            Message
          </button>
          <button className="h-9 w-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
            <LinkIcon className="w-4 h-4 text-zinc-300" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.08]">
        {[
          { icon: Grid3X3, active: true },
          { icon: Video, active: false },
          { icon: Heart, active: false },
        ].map((tab, i) => (
          <button
            key={i}
            className={`flex-1 flex items-center justify-center py-3 border-b-2 transition-all ${
              tab.active ? 'border-white text-white' : 'border-transparent text-zinc-600'
            }`}
          >
            <tab.icon className="w-5 h-5" />
          </button>
        ))}
      </div>

      {/* Posts grid */}
      <div className="grid grid-cols-3 gap-[1px] bg-white/[0.04]">
        {MOCK_POSTS_GRID.map((post) => (
          <div
            key={post.id}
            className="aspect-square bg-zinc-900 flex items-center justify-center relative group"
          >
            <div className="w-8 h-8 rounded bg-white/[0.06]" />
            <div className="absolute bottom-1 left-1 flex items-center gap-0.5">
              <Heart className="w-3 h-3 text-white/60" />
              <span className="text-[9px] text-white/60">{post.likes}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1" />
      <MobileBottomBar />
    </div>
  );
}

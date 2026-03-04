import { MobileStatusBar } from '../MobileStatusBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { MockAvatar } from '../MockAvatar';
import { Heart, MessageSquare, Repeat2, UserPlus, Coins, AtSign, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const MOCK_NOTIFICATIONS = [
  { id: '1', type: 'like', user: 'bob_dev', content: 'liked your post', time: '2m', read: false, icon: Heart },
  { id: '2', type: 'follow', user: 'crypto_sarah', content: 'started following you', time: '10m', read: false, icon: UserPlus },
  { id: '3', type: 'comment', user: 'defi_whale', content: 'replied to your post: "Great analysis!"', time: '30m', read: false, icon: MessageSquare },
  { id: '4', type: 'repost', user: 'nft_artist', content: 'reposted your video', time: '1h', read: true, icon: Repeat2 },
  { id: '5', type: 'tip', user: 'dao_voter', content: 'tipped you 50 $DHB', time: '2h', read: true, icon: Coins },
  { id: '6', type: 'mention', user: 'web3_dev', content: 'mentioned you in a post', time: '5h', read: true, icon: AtSign },
  { id: '7', type: 'like', user: 'music_prod', content: 'liked your comment', time: '1d', read: true, icon: Heart },
  { id: '8', type: 'follow', user: 'alpha_trader', content: 'started following you', time: '1d', read: true, icon: UserPlus },
];

const FILTER_TABS = ['All', 'Mentions', 'Likes', 'Follows'];

export function NotificationsScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-2 pb-3">
        <h1 className="text-white text-xl font-bold">Notifications</h1>
        <Settings2 className="w-5 h-5 text-zinc-400" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 px-4 pb-3">
        {FILTER_TABS.map((tab, i) => (
          <button
            key={tab}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              i === 0
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-zinc-500'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className="flex-1 divide-y divide-white/[0.04]">
        {MOCK_NOTIFICATIONS.map((notif) => (
          <div
            key={notif.id}
            className={cn(
              'flex items-start gap-3 px-4 py-3',
              !notif.read && 'bg-white/[0.02]'
            )}
          >
            <div className="relative">
              <MockAvatar name={notif.user} size="sm" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center">
                <notif.icon className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-zinc-300">
                <span className="text-white font-semibold">{notif.user}</span>{' '}
                {notif.content}
              </p>
              <span className="text-[11px] text-zinc-600 mt-0.5 block">{notif.time}</span>
            </div>
            {!notif.read && (
              <div className="w-2 h-2 rounded-full bg-white/40 flex-shrink-0 mt-1.5" />
            )}
          </div>
        ))}
      </div>

      <MobileBottomBar />
    </div>
  );
}

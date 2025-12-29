import { useState } from 'react';
import { Settings, Heart, MessageCircle, Repeat2, DollarSign, Users, Share, Bell } from 'lucide-react';
import { PageHeader } from '@/components/app/PageHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';

const tabs = [
  { label: 'All', value: 'all', icon: Bell },
  { label: 'Likes', value: 'likes', icon: Heart },
  { label: 'Comments', value: 'comments', icon: MessageCircle },
  { label: 'Shares', value: 'shares', icon: Share },
  { label: 'Tips', value: 'tips', icon: DollarSign },
  { label: 'Subs', value: 'subs', icon: Users },
];

interface Notification {
  id: string;
  type: 'repost' | 'subscription' | 'like' | 'tip' | 'comment' | 'share';
  users: { name: string; verified: boolean; avatar?: string }[];
  action: string;
  preview?: string;
  time: string;
}

const notifications: Notification[] = [
  {
    id: '1',
    type: 'repost',
    users: [{ name: 'oxdanny7', verified: true }],
    action: 'reposted a post you were mentioned in',
    preview: "Today's Gems of Base top gainers 💎 🚀",
    time: '25s',
  },
  {
    id: '2',
    type: 'subscription',
    users: [
      { name: 'StreamerBans', verified: true },
    ],
    action: 'and 4 others subscribed to your content',
    time: '8m',
  },
  {
    id: '3',
    type: 'like',
    users: [{ name: 'griffo', verified: false }],
    action: 'liked your reply',
    preview: 'This is partly why decentralised, censorship resistant and unstoppable apps like DeHub are essential for the advancement of...',
    time: '11m',
  },
  {
    id: '4',
    type: 'tip',
    users: [{ name: 'CryptoWhale', verified: true }],
    action: 'sent you a tip of 0.05 ETH',
    time: '2h',
  },
  {
    id: '5',
    type: 'comment',
    users: [{ name: 'BlockchainDev', verified: false }],
    action: 'commented on your post',
    preview: 'Great insights on the future of DeFi!',
    time: '3h',
  },
  {
    id: '6',
    type: 'share',
    users: [{ name: 'Web3Builder', verified: false }],
    action: 'and 1 other shared your post',
    preview: 'Building the future of decentralized social media',
    time: '5h',
  },
];

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'repost':
      return <Repeat2 className="w-4 h-4 text-green-400" />;
    case 'subscription':
      return <Users className="w-4 h-4 text-purple-400" />;
    case 'like':
      return <Heart className="w-4 h-4 text-red-400 fill-red-400" />;
    case 'tip':
      return <DollarSign className="w-4 h-4 text-yellow-400" />;
    case 'comment':
      return <MessageCircle className="w-4 h-4 text-blue-400" />;
    case 'share':
      return <Share className="w-4 h-4 text-cyan-400" />;
  }
};

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState('all');

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 bg-black/80 backdrop-blur-sm z-10 p-3 sm:p-4">
        <div className="bg-zinc-900 rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="font-bold text-white text-lg">Notifications</h1>
            <button className="p-2 rounded-full hover:bg-zinc-800 transition-colors">
              <Settings className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3 sm:px-4 py-2">
        <div className="bg-zinc-900 rounded-2xl p-2">
          <div className="flex justify-evenly">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex-1 flex items-center justify-center gap-2 px-2 sm:px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.value
                    ? 'bg-white text-black'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="px-3 sm:px-4 py-2">
        <div className="bg-zinc-900 rounded-2xl divide-y divide-zinc-800">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className="flex items-start gap-3 p-4 hover:bg-zinc-800/50 transition-colors cursor-pointer"
            >
              {/* Icon */}
              <div className="flex-shrink-0 mt-1">
                {getNotificationIcon(notification.type)}
              </div>

              {/* Avatar(s) */}
              <div className="flex-shrink-0">
                {notification.type === 'subscription' ? (
                  <div className="flex -space-x-2">
                    <Avatar className="w-10 h-10 border-2 border-zinc-900">
                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=sub1`} />
                      <AvatarFallback className="bg-purple-500 text-white text-xs">S</AvatarFallback>
                    </Avatar>
                    <Avatar className="w-10 h-10 border-2 border-zinc-900">
                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=sub2`} />
                      <AvatarFallback className="bg-zinc-600 text-white text-xs">+</AvatarFallback>
                    </Avatar>
                  </div>
                ) : (
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${notification.users[0].name}`} />
                    <AvatarFallback className="bg-zinc-700 text-white">
                      {notification.users[0].name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm">
                  <span className="font-semibold">{notification.users[0].name}</span>
                  {notification.users[0].verified && (
                    <VerifiedBadge className="inline-block mx-1 w-4 h-4" />
                  )}
                  <span className="text-zinc-400"> {notification.action}</span>
                </p>
                {notification.preview && (
                  <p className="text-zinc-500 text-sm mt-1 line-clamp-2">
                    {notification.preview}
                  </p>
                )}
              </div>

              {/* Time */}
              <span className="text-zinc-500 text-sm flex-shrink-0">
                {notification.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

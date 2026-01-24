import { useState } from 'react';
import { Settings, Heart, MessageCircle, Repeat2, DollarSign, Users, Share, Bell } from 'lucide-react';
import { PageHeader } from '@/components/app/PageHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/app/AuthGate';
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
  // Likes
  {
    id: '1',
    type: 'like',
    users: [{ name: 'griffo', verified: false }],
    action: 'liked your reply',
    preview: 'This is partly why decentralised, censorship resistant and unstoppable apps like DeHub are essential for the advancement of...',
    time: '11m',
  },
  {
    id: '2',
    type: 'like',
    users: [{ name: 'CryptoKing', verified: true }],
    action: 'liked your post',
    preview: 'Just deployed my first smart contract on Solana! The speed is incredible 🚀',
    time: '23m',
  },
  {
    id: '3',
    type: 'like',
    users: [{ name: 'Web3Maven', verified: false }],
    action: 'liked your photo',
    time: '45m',
  },
  {
    id: '4',
    type: 'like',
    users: [{ name: 'TokenTrader', verified: true }],
    action: 'liked your reply',
    preview: 'Absolutely agree with this take on DeFi governance...',
    time: '1h',
  },
  {
    id: '5',
    type: 'like',
    users: [{ name: 'BlockchainBabe', verified: false }],
    action: 'liked your post',
    preview: 'The future of social media is decentralized',
    time: '2h',
  },
  // Comments
  {
    id: '6',
    type: 'comment',
    users: [{ name: 'BlockchainDev', verified: false }],
    action: 'commented on your post',
    preview: 'Great insights on the future of DeFi!',
    time: '3h',
  },
  {
    id: '7',
    type: 'comment',
    users: [{ name: 'NFTArtist', verified: true }],
    action: 'replied to your comment',
    preview: 'Totally agree! The gas fees on Ethereum have been killing creativity...',
    time: '4h',
  },
  {
    id: '8',
    type: 'comment',
    users: [{ name: 'DeFiDegen', verified: false }],
    action: 'commented on your post',
    preview: 'What yield farming strategies are you using?',
    time: '5h',
  },
  {
    id: '9',
    type: 'comment',
    users: [{ name: 'MetaMike', verified: true }],
    action: 'mentioned you in a comment',
    preview: '@you should definitely check this out, it aligns with what you said about...',
    time: '6h',
  },
  // Shares
  {
    id: '10',
    type: 'share',
    users: [{ name: 'Web3Builder', verified: false }],
    action: 'shared your post',
    preview: 'Building the future of decentralized social media',
    time: '5h',
  },
  {
    id: '11',
    type: 'share',
    users: [{ name: 'CryptoInfluencer', verified: true }],
    action: 'shared your post with 50K followers',
    preview: 'This thread on tokenomics is a must-read 🧵',
    time: '7h',
  },
  {
    id: '12',
    type: 'share',
    users: [{ name: 'DAOmaster', verified: false }],
    action: 'shared your post',
    preview: 'Governance proposal analysis that everyone should see',
    time: '8h',
  },
  // Tips
  {
    id: '13',
    type: 'tip',
    users: [{ name: 'CryptoWhale', verified: true }],
    action: 'sent you a tip of 0.05 ETH',
    time: '2h',
  },
  {
    id: '14',
    type: 'tip',
    users: [{ name: 'GenerousGuru', verified: false }],
    action: 'sent you a tip of 25 USDC',
    preview: 'Thanks for the amazing content!',
    time: '1d',
  },
  {
    id: '15',
    type: 'tip',
    users: [{ name: 'SolanaSteve', verified: true }],
    action: 'sent you a tip of 2 SOL',
    preview: 'Your tutorial saved me hours of debugging!',
    time: '2d',
  },
  {
    id: '16',
    type: 'tip',
    users: [{ name: 'BitcoinBill', verified: true }],
    action: 'sent you a tip of 0.001 BTC',
    time: '3d',
  },
  // Subscriptions
  {
    id: '17',
    type: 'subscription',
    users: [{ name: 'StreamerBans', verified: true }],
    action: 'subscribed to your content',
    time: '8m',
  },
  {
    id: '18',
    type: 'subscription',
    users: [{ name: 'NewFollower42', verified: false }],
    action: 'subscribed to your premium tier',
    time: '1h',
  },
  {
    id: '19',
    type: 'subscription',
    users: [{ name: 'ContentCreator', verified: true }],
    action: 'and 12 others subscribed to your content',
    time: '3h',
  },
  {
    id: '20',
    type: 'subscription',
    users: [{ name: 'AlphaHunter', verified: false }],
    action: 'subscribed to your exclusive channel',
    time: '6h',
  },
  {
    id: '21',
    type: 'subscription',
    users: [{ name: 'DegenTrader', verified: true }],
    action: 'renewed their annual subscription',
    time: '1d',
  },
  // Reposts (for "All" tab)
  {
    id: '22',
    type: 'repost',
    users: [{ name: 'oxdanny7', verified: true }],
    action: 'reposted a post you were mentioned in',
    preview: "Today's Gems of Base top gainers 💎 🚀",
    time: '25s',
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
  const { isAuthenticated } = useAuth();

  // Block access for unauthenticated users (AuthGate handles loading state internally)
  if (!isAuthenticated) {
    return (
      <AuthGate description="Log in to view your notifications and stay updated." />
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-11 lg:top-0 bg-black z-10 p-3 sm:p-4">
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
          {notifications
            .filter((notification) => {
              if (activeTab === 'all') return true;
              if (activeTab === 'likes') return notification.type === 'like';
              if (activeTab === 'comments') return notification.type === 'comment';
              if (activeTab === 'shares') return notification.type === 'share' || notification.type === 'repost';
              if (activeTab === 'tips') return notification.type === 'tip';
              if (activeTab === 'subs') return notification.type === 'subscription';
              return true;
            })
            .map((notification) => (
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

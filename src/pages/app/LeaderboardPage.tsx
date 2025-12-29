import { useState } from 'react';
import { Search, Trophy, ArrowUp, ArrowDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';

interface LeaderboardUser {
  rank: number;
  change: number;
  name: string;
  handle: string;
  verified: boolean;
  tokens: string;
  followers: string;
  likes: string;
  earnings: string;
}

const leaderboardData: LeaderboardUser[] = [
  { rank: 1, change: 0, name: 'Crypto Whale', handle: '@whale_master', verified: true, tokens: '2.5M', followers: '125.0K', likes: '850.0K', earnings: '$125,000' },
  { rank: 2, change: 2, name: 'Diamond Hands', handle: '@diamond_hodl', verified: true, tokens: '1.8M', followers: '98.0K', likes: '720.0K', earnings: '$95,000' },
  { rank: 3, change: -1, name: 'Moon Rider', handle: '@to_the_moon', verified: false, tokens: '1.2M', followers: '75.0K', likes: '560.0K', earnings: '$67,000' },
  { rank: 4, change: 3, name: 'Stack Builder', handle: '@stack_em_high', verified: false, tokens: '850.0K', followers: '52.0K', likes: '420.0K', earnings: '$48,000' },
  { rank: 5, change: -2, name: 'Token Tiger', handle: '@token_tiger', verified: true, tokens: '650.0K', followers: '41.0K', likes: '315.0K', earnings: '$38,000' },
  { rank: 6, change: 1, name: 'Alpha Trader', handle: '@alpha_trade', verified: false, tokens: '520.0K', followers: '35.0K', likes: '285.0K', earnings: '$32,000' },
];

const getRankStyle = (rank: number) => {
  switch (rank) {
    case 1:
      return 'bg-yellow-500 text-black';
    case 2:
      return 'bg-zinc-400 text-black';
    case 3:
      return 'bg-amber-600 text-white';
    default:
      return 'bg-zinc-700 text-white';
  }
};

export default function LeaderboardPage() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="min-h-screen p-3 sm:p-4">
      {/* Header */}
      <div className="bg-zinc-900 rounded-2xl p-4 sm:p-6 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center">
            <Trophy className="w-6 h-6 text-zinc-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Leaderboard</h1>
            <p className="text-zinc-500 text-sm">Top performers in the community</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
          />
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-zinc-900 rounded-2xl overflow-hidden">
        {/* Table Header */}
        <div className="hidden sm:grid grid-cols-12 gap-4 px-4 sm:px-6 py-4 border-b border-zinc-800 text-zinc-500 text-sm font-medium">
          <div className="col-span-1">Rank</div>
          <div className="col-span-3">User</div>
          <div className="col-span-2 text-right">Tokens</div>
          <div className="col-span-2 text-right">Followers</div>
          <div className="col-span-2 text-right">Likes</div>
          <div className="col-span-2 text-right">Earnings</div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-zinc-800">
          {leaderboardData.map((user) => (
            <div
              key={user.rank}
              className="grid grid-cols-12 gap-2 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-zinc-800/50 transition-colors items-center"
            >
              {/* Rank */}
              <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${getRankStyle(user.rank)}`}>
                  {user.rank}
                </div>
                {user.change !== 0 && (
                  <span className={`text-xs flex items-center ${user.change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {user.change > 0 ? '+' : ''}{user.change}
                  </span>
                )}
              </div>

              {/* User */}
              <div className="col-span-10 sm:col-span-3 flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`} />
                  <AvatarFallback className="bg-zinc-700 text-white">
                    {user.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-white truncate">{user.name}</span>
                    {user.verified && <VerifiedBadge className="w-4 h-4 flex-shrink-0" />}
                  </div>
                  <span className="text-zinc-500 text-sm">{user.handle}</span>
                </div>
              </div>

              {/* Stats - Mobile */}
              <div className="col-span-12 sm:hidden grid grid-cols-4 gap-2 text-sm mt-2 pl-9">
                <div>
                  <span className="text-zinc-500 text-xs">Tokens</span>
                  <p className="text-white font-medium">{user.tokens}</p>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs">Followers</span>
                  <p className="text-white font-medium">{user.followers}</p>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs">Likes</span>
                  <p className="text-white font-medium">{user.likes}</p>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs">Earnings</span>
                  <p className="text-green-400 font-medium">{user.earnings}</p>
                </div>
              </div>

              {/* Stats - Desktop */}
              <div className="hidden sm:block col-span-2 text-right text-white font-medium">
                {user.tokens}
              </div>
              <div className="hidden sm:block col-span-2 text-right text-white font-medium">
                {user.followers}
              </div>
              <div className="hidden sm:block col-span-2 text-right text-white font-medium">
                {user.likes}
              </div>
              <div className="hidden sm:block col-span-2 text-right text-green-400 font-medium">
                {user.earnings}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

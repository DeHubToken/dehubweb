import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';

interface LeaderboardUser {
  rank: number;
  name: string;
  handle: string;
  verified: boolean;
  tokens: string;
}

const leaderboardData: LeaderboardUser[] = [
  { rank: 1, name: 'Crypto Whale', handle: '@whale_master', verified: true, tokens: '2.5M' },
  { rank: 2, name: 'Diamond Hands', handle: '@diamond_hodl', verified: true, tokens: '1.8M' },
  { rank: 3, name: 'Moon Rider', handle: '@to_the_moon', verified: false, tokens: '1.2M' },
  { rank: 4, name: 'Stack Builder', handle: '@stack_em_high', verified: false, tokens: '850K' },
  { rank: 5, name: 'Token Tiger', handle: '@token_tiger', verified: true, tokens: '650K' },
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

export function SidebarLeaderboard() {
  return (
    <div className="space-y-3">
      {leaderboardData.map((user) => (
        <div key={user.rank} className="flex items-center gap-3">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${getRankStyle(user.rank)}`}>
            {user.rank}
          </div>
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`} />
            <AvatarFallback className="bg-zinc-700 text-white text-xs">
              {user.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-white text-sm truncate">{user.name}</span>
              {user.verified && <VerifiedBadge className="w-3.5 h-3.5 flex-shrink-0" />}
            </div>
            <span className="text-zinc-500 text-xs">{user.tokens} tokens</span>
          </div>
        </div>
      ))}
      <button className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
        View full leaderboard
      </button>
    </div>
  );
}

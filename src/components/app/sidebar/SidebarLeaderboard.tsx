import { useState, useRef, useCallback } from 'react';
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

const extendedLeaderboardData: LeaderboardUser[] = [
  { rank: 6, name: 'Ape Legend', handle: '@ape_legend', verified: true, tokens: '520K' },
  { rank: 7, name: 'Bull Runner', handle: '@bull_run', verified: false, tokens: '480K' },
  { rank: 8, name: 'Yield Hunter', handle: '@yield_farm', verified: true, tokens: '425K' },
  { rank: 9, name: 'Block Master', handle: '@block_master', verified: false, tokens: '390K' },
  { rank: 10, name: 'Hash King', handle: '@hash_king', verified: true, tokens: '350K' },
  { rank: 11, name: 'Satoshi Jr', handle: '@satoshi_jr', verified: false, tokens: '320K' },
  { rank: 12, name: 'Degen Pro', handle: '@degen_pro', verified: true, tokens: '295K' },
  { rank: 13, name: 'Mint Master', handle: '@mint_master', verified: false, tokens: '270K' },
  { rank: 14, name: 'Gas Saver', handle: '@gas_saver', verified: true, tokens: '245K' },
  { rank: 15, name: 'Whale Catcher', handle: '@whale_catch', verified: false, tokens: '220K' },
];

// Generate 100 more leaderboard users
const generatedLeaderboardData: LeaderboardUser[] = Array.from({ length: 100 }, (_, i) => {
  const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Sigma', 'Theta', 'Zeta', 'Nova', 'Pulse'];
  const suffixes = ['Trader', 'Holder', 'Staker', 'Farmer', 'Hunter', 'Miner', 'Builder', 'Catcher', 'Master', 'King'];
  const name = `${prefixes[i % prefixes.length]} ${suffixes[Math.floor(i / 10) % suffixes.length]}`;
  const tokens = Math.floor(200 - (i * 1.5));
  return {
    rank: 16 + i,
    name,
    handle: `@${name.toLowerCase().replace(' ', '_')}`,
    verified: i % 4 === 0,
    tokens: `${tokens > 0 ? tokens : 1}K`,
  };
});

const ALL_USERS = [...leaderboardData, ...extendedLeaderboardData, ...generatedLeaderboardData];
const BATCH_SIZE = 10;

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
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      setVisibleCount(prev => Math.min(prev + BATCH_SIZE, ALL_USERS.length));
    }
  }, []);

  const visibleUsers = ALL_USERS.slice(0, visibleCount);

  return (
    <div className="relative">
      {/* Bottom fade */}
      <div className="absolute left-0 right-0 bottom-0 h-8 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none z-10" />
      
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="max-h-[280px] overflow-y-auto scrollbar-invisible space-y-3 pr-1 pb-2"
      >
        {visibleUsers.map((user) => (
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
      </div>
    </div>
  );
}

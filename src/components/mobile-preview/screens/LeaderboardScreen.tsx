import { MobileStatusBar } from '../MobileStatusBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { MockAvatar } from '../MockAvatar';
import { Trophy, Medal, TrendingUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const MOCK_LEADERBOARD = [
  { rank: 1, user: 'defi_whale', score: '125,400', change: '+12' },
  { rank: 2, user: 'crypto_sarah', score: '98,200', change: '+5' },
  { rank: 3, user: 'alice.eth', score: '87,650', change: '-1' },
  { rank: 4, user: 'bob_dev', score: '76,300', change: '+3' },
  { rank: 5, user: 'nft_artist', score: '65,100', change: '+8' },
  { rank: 6, user: 'dao_voter', score: '54,800', change: '0' },
  { rank: 7, user: 'music_prod', score: '43,200', change: '-2' },
  { rank: 8, user: 'web3_dev', score: '38,900', change: '+1' },
  { rank: 9, user: 'alpha_trader', score: '32,400', change: '+4' },
  { rank: 10, user: 'dao_builder', score: '28,100', change: '-3' },
];

const PERIOD_TABS = ['Daily', 'Weekly', 'Monthly', 'All Time'];

export function LeaderboardScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />

      <div className="px-4 pt-2 pb-1">
        <h1 className="text-white text-xl font-bold">Leaderboard</h1>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1.5 px-4 py-3">
        {PERIOD_TABS.map((tab, i) => (
          <button
            key={tab}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              i === 0 ? 'bg-white/10 text-white border border-white/20' : 'text-zinc-500'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Top 3 podium */}
      <div className="flex items-end justify-center gap-3 px-4 pb-4">
        {[MOCK_LEADERBOARD[1], MOCK_LEADERBOARD[0], MOCK_LEADERBOARD[2]].map((entry, i) => {
          const heights = ['h-20', 'h-28', 'h-16'];
          const ranks = ['2', '1', '3'];
          return (
            <div key={entry.user} className="flex flex-col items-center flex-1">
              <MockAvatar name={entry.user} size={i === 1 ? 'lg' : 'md'} />
              <span className="text-white text-xs font-semibold mt-1 truncate max-w-full">{entry.user}</span>
              <span className="text-zinc-500 text-[10px]">{entry.score}</span>
              <div className={cn(
                'w-full rounded-t-lg bg-white/[0.06] border border-white/[0.08] border-b-0 mt-2 flex items-start justify-center pt-2',
                heights[i]
              )}>
                <span className="text-white text-lg font-bold">#{ranks[i]}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rest of leaderboard */}
      <div className="flex-1 px-4">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.04]">
          {MOCK_LEADERBOARD.slice(3).map((entry) => (
            <div key={entry.rank} className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-zinc-500 text-sm font-mono w-6 text-center">{entry.rank}</span>
              <MockAvatar name={entry.user} size="sm" />
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm font-medium truncate block">{entry.user}</span>
              </div>
              <span className="text-zinc-400 text-sm font-mono">{entry.score}</span>
              <span className={cn(
                'text-[10px] w-8 text-right',
                entry.change.startsWith('+') ? 'text-zinc-300' : entry.change.startsWith('-') ? 'text-zinc-600' : 'text-zinc-600'
              )}>
                {entry.change !== '0' ? entry.change : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <MobileBottomBar />
    </div>
  );
}

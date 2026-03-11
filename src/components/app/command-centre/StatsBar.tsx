import { Users, UserCheck, Heart, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { getAccountInfo } from '@/lib/api/dehub';

export function StatsBar() {
  const { walletAddress, user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['command-centre-stats', walletAddress],
    queryFn: () => getAccountInfo(walletAddress!),
    enabled: !!walletAddress,
    staleTime: 60_000,
    placeholderData: user ?? undefined,
  });

  const followers = typeof profile?.followers === 'number'
    ? profile.followers
    : Array.isArray(profile?.followers) ? profile.followers.length : (profile?.follower_count ?? 0);

  const following = profile?.following_count
    ?? (typeof profile?.followings === 'number' ? profile.followings
    : Array.isArray(profile?.followings) ? profile.followings.length : 0);

  const likes = typeof profile?.likes === 'number'
    ? profile.likes
    : Array.isArray(profile?.likes) ? profile.likes.length : 0;

  const tipsMade = profile?.sentTips ?? 0;
  const tipsEarned = profile?.receivedTips ?? 0;

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const stats = [
    { label: 'Followers', value: fmt(followers), icon: Users },
    { label: 'Following', value: fmt(following), icon: UserCheck },
    { label: 'Likes', value: fmt(likes), icon: Heart },
    { label: 'Tips Made', value: fmt(tipsMade), icon: ArrowUpRight },
    { label: 'Tips Earned', value: fmt(tipsEarned), icon: ArrowDownLeft },
  ];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:p-4">
      <div className="grid grid-cols-5 divide-x divide-white/[0.06]">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center gap-1 px-2">
            <stat.icon className="w-4 h-4 text-white/60" />
            <span className="text-sm sm:text-base font-bold text-white">{stat.value}</span>
            <span className="text-[10px] sm:text-xs text-white/50">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

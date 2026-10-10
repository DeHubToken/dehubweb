import { useTranslation as _useCopy } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { getAccountInfo } from '@/lib/api/dehub';

export function StatsBar() {
  const { t: _copy } = _useCopy();
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
    { label: _copy("copy.a145ab342a4a", { defaultValue: "Followers" }), value: fmt(followers) },
    { label: _copy("copy.344b4271ca01", { defaultValue: "Following" }), value: fmt(following) },
    { label: _copy("copy.cca0662f9ddd", { defaultValue: "Likes" }), value: fmt(likes) },
    { label: _copy("copy.48ad64d3aace", { defaultValue: "Tips Made" }), value: fmt(tipsMade) },
    { label: _copy("copy.457d1b1a71ba", { defaultValue: "Tips Earned" }), value: fmt(tipsEarned) },
  ];

  return (
    <div data-page-bento className="rounded-2xl bg-zinc-900 border border-zinc-800">
      <div className="grid grid-cols-5 divide-x divide-white/[0.06] py-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center gap-0.5 px-2">
            <span className="text-sm sm:text-base font-bold text-white">{stat.value}</span>
            <span className="text-[10px] sm:text-xs text-white/50">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

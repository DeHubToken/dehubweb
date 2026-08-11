/**
 * Profile Link Embed
 * ==================
 * A `dehub.io/<username>` link rendered as a profile card. Same row shape as
 * the community and store cards, so a message quoting a person and a message
 * quoting a shop look like siblings rather than two different features.
 */

import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { getAccountByUsername } from '@/lib/api/dehub/users';
import { buildAvatarUrl } from '@/lib/media-url';
import { BadgeIcon } from '@/components/app/BadgeIcon';

interface ProfileLinkEmbedProps {
  username: string;
  fallback?: ReactNode;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function ProfileLinkEmbed({ username, fallback = null }: ProfileLinkEmbedProps) {
  const navigate = useNavigate();

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['profile-link-embed', username.toLowerCase()],
    queryFn: () => getAccountByUsername(username),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });

  if (isLoading) {
    return <div className="mt-2 h-16 rounded-xl bg-white/[0.04] animate-pulse" />;
  }

  // The username half of the route table is a catch-all: anything that is not
  // a known route is tried as a handle. A link to a page we have since renamed
  // therefore arrives here looking like a person who does not exist, and the
  // reader is better served by the link than by a card claiming a stranger.
  const address = user?.address || user?.wallet_address || '';
  if (isError || !user || (!user.username && !address)) return <>{fallback}</>;

  const handle = (user.username || username).replace('@', '');
  const displayName = user.displayName || user.display_name || handle;
  const avatarUrl = buildAvatarUrl(address, user.avatarImageUrl || user.avatarUrl || user.avatar_url);
  const followers = typeof user.followers === 'number'
    ? user.followers
    : (user.follower_count ?? (Array.isArray(user.followers) ? user.followers.length : 0));
  const bio = user.bio || user.aboutMe || '';

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/${handle}`);
      }}
      data-no-navigate
      className="w-full flex items-center gap-3 p-3 mt-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors text-left relative overflow-hidden"
    >
      <div className="w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center overflow-hidden flex-shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <UserRound className="w-5 h-5 text-zinc-500" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="relative inline-flex items-baseline shrink min-w-0">
            <span className="text-sm font-semibold text-white truncate">{displayName}</span>
            <BadgeIcon
              badgeBalance={user.badgeBalance ?? 0}
              username={handle}
              className="w-[9px] h-[9px] absolute -top-0.5 -right-2.5"
            />
          </span>
          {(user.isVerified || user.is_verified) && (
            <CheckCircle className="w-3.5 h-3.5 text-white shrink-0 ml-1" />
          )}
        </div>
        <p className="text-xs text-zinc-500 truncate mt-0.5">@{handle}</p>
        {bio && <p className="text-xs text-slate-50 truncate mt-0.5">{bio}</p>}
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-xs text-zinc-500">
            <span className="font-semibold text-zinc-300">{formatCount(followers)}</span> Followers
          </span>
        </div>
      </div>
    </button>
  );
}

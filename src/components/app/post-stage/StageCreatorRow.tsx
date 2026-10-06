/**
 * Creator row under the media on the phone post page: avatar (rounded 8),
 * name with the badge and verified mark, "@handle · N followers", and a
 * Follow button on the right that is never drawn on your own post.
 *
 * Follow state comes from the creator's profile plus the shared optimistic
 * override store, the same pair the live viewer uses, so this button and
 * every other Follow button for the same person always agree.
 */
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useDeHubProfile } from '@/hooks/use-dehub-profile';
import { toggleFollowFor, useFollowOverrides } from '@/hooks/use-follow';
import { BadgedName } from '@/components/app/BadgedName';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';

interface StageCreatorRowProps {
  name: string;
  avatar?: string;
  handle?: string;
  creatorId?: string;
  badgeBalance?: number;
  verified?: boolean;
  /** Extra controls between the name and Follow (PPV / gate badges). */
  trailing?: ReactNode;
}

/** 1200 -> 1.2K, 3400000 -> 3.4M. */
function formatFollowers(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.floor(n));
}

export function StageCreatorRow({ name, avatar, handle, creatorId, badgeBalance, verified, trailing }: StageCreatorRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { walletAddress, openLoginModal } = useAuth();
  const [avatarError, setAvatarError] = useState(false);
  const cleanHandle = handle?.replace('@', '');

  const { data: profile } = useDeHubProfile({
    userId: creatorId || undefined,
    address: walletAddress || undefined,
    enabled: !!creatorId,
  });
  const overrides = useFollowOverrides();
  const isFollowing = creatorId
    ? (overrides.get(creatorId.toLowerCase()) ?? profile?.isFollowing === true)
    : false;
  const isSelf = !!(walletAddress && creatorId && walletAddress.toLowerCase() === creatorId.toLowerCase());
  const followers = typeof profile?.followers === 'number' ? profile.followers : undefined;

  const openProfile = () => {
    if (cleanHandle) navigate(`/${cleanHandle}`);
    else if (creatorId) navigate(`/app/profile?id=${creatorId}`);
  };

  const onFollow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!creatorId) return;
    if (!walletAddress) {
      openLoginModal();
      return;
    }
    void toggleFollowFor(queryClient, creatorId, isFollowing, { name });
  };

  return (
    <div data-stage-creator className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={openProfile}
        disabled={!cleanHandle && !creatorId}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        {avatar && avatar.startsWith('http') && !avatarError ? (
          <img
            src={avatar}
            alt={name}
            data-stage-avatar
            className="h-10 w-10 shrink-0 rounded-lg object-cover"
            onError={() => setAvatarError(true)}
          />
        ) : (
          <span data-stage-avatar data-stage-avatar-fallback className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
            {(name || '?').charAt(0).toUpperCase()}
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1">
            <BadgedName
              badgeBalance={badgeBalance}
              username={cleanHandle || name}
              className="truncate text-[15px] font-bold leading-tight"
              wrapperClassName="min-w-0"
            >
              <span data-stage-ink>{name}</span>
            </BadgedName>
            {verified && <VerifiedBadge className="h-3.5 w-3.5 self-center" />}
          </span>
          <span data-stage-muted className="truncate text-[13px] leading-tight">
            {cleanHandle ? `@${cleanHandle}` : null}
            {cleanHandle && followers !== undefined ? ' · ' : null}
            {followers !== undefined
              ? t('postStage.followers', '{{value}} followers', { value: formatFollowers(followers) })
              : null}
          </span>
        </span>
      </button>
      {trailing}
      {!isSelf && creatorId && (
        <button
          type="button"
          onClick={onFollow}
          data-stage-follow={isFollowing ? 'following' : 'follow'}
          data-keep-white
          className="h-[34px] shrink-0 rounded-[10px] px-3.5 text-sm font-bold"
        >
          {isFollowing ? t('follow.following') : t('follow.follow')}
        </button>
      )}
    </div>
  );
}

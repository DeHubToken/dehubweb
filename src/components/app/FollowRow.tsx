import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Follow Row
 * ==========
 * One suggested account as a single line: avatar, name with badge, @handle
 * (or a short line such as "joined 6h ago"), and the same Follow button the
 * cover cards carry. Explore's clean list on phones uses it for Follow
 * suggestions and New members. The button takes its colours from
 * styles/follow-cards.css, so the row must sit inside [data-follow-cards].
 *
 * @module components/app/FollowRow
 */
import { memo } from 'react';
import Check from '@/components/ui/cut-icons/check';
import { BadgedName } from '@/components/app/BadgedName';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl, deviceWidth } from '@/lib/media-url';
import type { SuggestedAccount } from '@/lib/api/dehub';
import { suggestionName } from '@/components/app/FollowCoverCard';
import '@/styles/follow-cards.css';

interface FollowRowProps {
  user: SuggestedAccount;
  phase?: 'following' | 'leaving';
  onOpen: (user: SuggestedAccount) => void;
  onFollow: (user: SuggestedAccount) => void;
  /** Second line in place of the @handle, e.g. "joined 6h ago". */
  meta?: string;
  followedLabel?: string;
}

function FollowRowInner({ user, phase, onOpen, onFollow, meta, followedLabel }: FollowRowProps) {
  const { t: _copy } = _useCopy();
  const followed = phase !== undefined;
  const name = suggestionName(user);
  const avatarPath = user.avatarImageUrl || user.avatarUrl;
  const avatar = avatarPath ? buildAvatarUrl(user.address, avatarPath, deviceWidth(40)) : undefined;
  const handle = user.username ? `@${user.username}` : `${user.address.slice(0, 6)}...${user.address.slice(-4)}`;
  const followsYou = user.followsYou || user.reason === 'follows_you';

  return (
    <div
      data-follow-row
      data-followed={followed || undefined}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(user)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(user); }}
      className="flex w-full cursor-pointer items-center gap-3 py-2 text-left"
    >
      <Avatar className="h-10 w-10 shrink-0 rounded-full">
        {avatar && <AvatarImage src={avatar} alt="" className="rounded-full object-cover" />}
        <AvatarFallback className="rounded-full bg-zinc-800 text-[15px] font-semibold text-zinc-300">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <BadgedName
          badgeBalance={user.hideBadgeAndBalance ? 0 : user.badgeBalance}
          badgeLock={user.hideBadgeAndBalance ? null : user.badgeLock}
          username={user.username}
          className="truncate"
          wrapperClassName="max-w-full"
        >
          <span className="text-[15px] font-semibold text-white">{name}</span>
        </BadgedName>
        <span className="block truncate text-[12.5px] text-zinc-500">{meta ? `${handle} · ${meta}` : handle}</span>
      </span>
      <button
        type="button"
        data-fc-follow
        data-discovery-follow
        disabled={followed}
        onClick={(e) => {
          e.stopPropagation();
          onFollow(user);
        }}
      >
        {followed ? (
          <>
            <Check className="-ml-[1.2px] h-3.5 w-3.5" />
            {followedLabel ?? _copy('copy.344b4271ca01', { defaultValue: 'Following' })}
          </>
        ) : followsYou ? (
          _copy('follow.followBack', { defaultValue: 'Follow back' })
        ) : (
          _copy('copy.641d1ef657bd', { defaultValue: 'Follow' })
        )}
      </button>
    </div>
  );
}

export const FollowRow = memo(FollowRowInner);

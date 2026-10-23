import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Follow Cover Card
 * =================
 * One suggested account as a mini profile: their cover banner, the avatar
 * sitting over its lower edge, name and badge, @handle, two lines of bio, why
 * they were suggested (people you know who follow them, or that they follow
 * you), their follower count and a solid Follow button. A small X skips them.
 *
 * Used by the feed's follow row and by Explore. All colour, radius and glass
 * comes from styles/follow-cards.css, keyed off the theme, so this file only
 * carries structure. System, System Light and the Minimals draw no box at
 * all: the cards stand on the page with a hairline between them.
 *
 * Accounts with no cover get a blown-up, blurred copy of their own avatar, so
 * every card still has a banner in that person's colours.
 *
 * @module components/app/FollowCoverCard
 */

import { memo } from 'react';
import Check from "@/components/ui/cut-icons/check";
import X from "@/components/ui/cut-icons/close";
import { BadgedName } from '@/components/app/BadgedName';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl, buildCoverUrl, deviceWidth } from '@/lib/media-url';
import { formatCount } from '@/lib/feed-utils';
import type { SuggestedAccount } from '@/lib/api/dehub';
import '@/styles/follow-cards.css';

interface FollowCoverCardProps {
  user: SuggestedAccount;
  /** The follow has landed; the card shows Following for a moment before it leaves. */
  followed?: boolean;
  onOpen: (user: SuggestedAccount) => void;
  onFollow: (user: SuggestedAccount) => void;
  onDismiss: (user: SuggestedAccount) => void;
}

export function suggestionName(user: SuggestedAccount) {
  return user.displayName || user.username || `${user.address.slice(0, 6)}...`;
}

function FollowCoverCardInner({ user, followed = false, onOpen, onFollow, onDismiss }: FollowCoverCardProps) {
  const { t: _copy } = _useCopy();
  const name = suggestionName(user);
  const avatarPath = user.avatarImageUrl || user.avatarUrl;
  const avatar = avatarPath ? buildAvatarUrl(user.address, avatarPath, deviceWidth(56)) : undefined;
  const cover = user.coverImageUrl ? buildCoverUrl(user.address, user.coverImageUrl, deviceWidth(240)) : undefined;
  const mutuals = (user.mutualConnections ?? []).slice(0, 2);

  let reason: string | null = null;
  if (user.reason === 'follows_you' || user.followsYou) {
    reason = _copy('follow.followsYou', { defaultValue: 'Follows you' });
  } else if (mutuals.length) {
    const names = mutuals.map((m) => m.displayName || m.username || `${m.address.slice(0, 6)}...`).join(', ');
    reason = `${_copy('copy.d0f08798ff1a', { defaultValue: 'Followed by ' })}${names}`;
  }

  return (
    <article
      data-follow-card
      data-followed={followed || undefined}
      onClick={() => onOpen(user)}
      className="snap-start"
    >
      <div data-fc-cover aria-hidden="true">
        {cover ? (
          <img src={cover} alt="" loading="lazy" decoding="async" />
        ) : avatar ? (
          <img src={avatar} alt="" loading="lazy" decoding="async" data-fc-cover-wash />
        ) : null}
      </div>
      <button
        type="button"
        data-fc-dismiss
        aria-label={_copy('depin.dismiss', { defaultValue: 'Dismiss' })}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(user);
        }}
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <Avatar data-fc-avatar className="w-14 h-14 rounded-2xl">
        {avatar && <AvatarImage src={avatar} alt="" className="rounded-2xl object-cover" />}
        <AvatarFallback data-fc-avatar-fallback className="rounded-2xl text-lg font-semibold">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div data-fc-body>
        <BadgedName
          badgeBalance={user.hideBadgeAndBalance ? 0 : user.badgeBalance}
          username={user.username}
          className="truncate"
          wrapperClassName="max-w-full"
        >
          <span data-fc-name>{name}</span>
        </BadgedName>
        <span data-fc-handle>{user.username ? `@${user.username}` : `${user.address.slice(0, 6)}...${user.address.slice(-4)}`}</span>
        <p data-fc-bio>{user.aboutMe?.trim() || ' '}</p>
        <div data-fc-reason>
          {mutuals.length > 0 && !user.followsYou && (
            <span data-fc-mutuals aria-hidden="true">
              {mutuals.map((m) => {
                const src = m.avatarImageUrl ? buildAvatarUrl(m.address, m.avatarImageUrl, deviceWidth(18)) : undefined;
                return src ? <img key={m.address} src={src} alt="" loading="lazy" /> : <i key={m.address} />;
              })}
            </span>
          )}
          {reason && <span className="truncate">{reason}</span>}
        </div>
        <div data-fc-foot>
          <span data-fc-count>
            {_copy('accounts.followersCount', { defaultValue: '{{value}} followers', value: formatCount(user.followers ?? 0) })}
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
                <Check className="w-3.5 h-3.5" />
                {_copy('copy.344b4271ca01', { defaultValue: 'Following' })}
              </>
            ) : (
              _copy('copy.641d1ef657bd', { defaultValue: 'Follow' })
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

export const FollowCoverCard = memo(FollowCoverCardInner);

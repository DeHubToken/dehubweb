import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Follow Cover Card
 * =================
 * One suggested account as a mini profile: their cover banner, the avatar
 * sitting over its lower edge, name and badge, @handle, two lines of bio, why
 * they were suggested (people you know who follow them, or that they follow
 * you), their follower count and a solid Follow button. A bare X in the
 * banner's top corner skips them: just the glyph, no chip behind it.
 *
 * Used by the feed's follow row and by Explore. All colour, radius and glass
 * comes from styles/follow-cards.css, keyed off the theme, so this file only
 * carries structure. System, System Light and the Minimals draw no box at
 * all: the cards stand on the page with a hairline between them.
 *
 * The banner is the one their profile shows: their own, or the same default
 * banner the profile page picks for them when they never set one.
 *
 * Someone who already follows you gets Follow back on the button rather than
 * a line of its own; the reason line only carries mutual friends.
 *
 * @module components/app/FollowCoverCard
 */

import { memo } from 'react';
import Check from "@/components/ui/cut-icons/check";
import X from "@/components/ui/cut-icons/close";
import { BadgedName } from '@/components/app/BadgedName';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buildAvatarUrl, buildCoverUrl, deviceWidth } from '@/lib/media-url';
import { getDefaultBanner } from '@/components/app/profile/ProfileConstants';
import { formatCount } from '@/lib/feed-utils';
import type { SuggestedAccount } from '@/lib/api/dehub';
import '@/styles/follow-cards.css';

interface FollowCoverCardProps {
  user: SuggestedAccount;
  /** Following: the tap landed and the button says so. Leaving: the card folds away. */
  phase?: 'following' | 'leaving';
  onOpen: (user: SuggestedAccount) => void;
  onFollow: (user: SuggestedAccount) => void;
  onDismiss: (user: SuggestedAccount) => void;
}

export function suggestionName(user: SuggestedAccount) {
  return user.displayName || user.username || `${user.address.slice(0, 6)}...`;
}

function FollowCoverCardInner({ user, phase, onOpen, onFollow, onDismiss }: FollowCoverCardProps) {
  const followed = phase !== undefined;
  const { t: _copy } = _useCopy();
  const name = suggestionName(user);
  const avatarPath = user.avatarImageUrl || user.avatarUrl;
  const avatar = avatarPath ? buildAvatarUrl(user.address, avatarPath, deviceWidth(56)) : undefined;
  const cover = user.coverImageUrl
    ? buildCoverUrl(user.address, user.coverImageUrl, deviceWidth(240))
    : getDefaultBanner(user.address);
  const followsYou = user.followsYou || user.reason === 'follows_you';
  const mutuals = (user.mutualConnections ?? []).slice(0, 2);
  const bio = user.aboutMe?.trim();

  let reason: string | null = null;
  if (mutuals.length) {
    const names = mutuals.map((m) => m.displayName || m.username || `${m.address.slice(0, 6)}...`).join(', ');
    reason = _copy('copy.fef6a1a97127', { defaultValue: 'Followed by {{value1}}', value1: names });
  }

  return (
    <article
      data-follow-card
      data-followed={followed || undefined}
      data-leaving={phase === 'leaving' || undefined}
      onClick={() => onOpen(user)}
      className="snap-start"
    >
      {/* The skip X lives inside the banner so it is inset from the banner's
          own corner in every theme (the flat themes pad the card, not it). */}
      <div data-fc-cover>
        <img src={cover} alt="" loading="lazy" decoding="async" />
      <button
        type="button"
        data-fc-dismiss
        aria-label={_copy('depin.dismiss', { defaultValue: 'Dismiss' })}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(user);
        }}
      >
        <X className="w-4 h-4" />
      </button>
      </div>

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
        <p data-fc-bio data-empty={bio ? undefined : true}>
          {bio || _copy('copy.0c820caf16c0', { defaultValue: 'No bio yet' })}
        </p>
        {reason && (
        <div data-fc-reason>
          {mutuals.length > 0 && (
            <span data-fc-mutuals aria-hidden="true">
              {mutuals.map((m) => {
                const src = m.avatarImageUrl ? buildAvatarUrl(m.address, m.avatarImageUrl, deviceWidth(18)) : undefined;
                return src ? <img key={m.address} src={src} alt="" loading="lazy" /> : <i key={m.address} />;
              })}
            </span>
          )}
          <span className="truncate">{reason}</span>
        </div>
        )}
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
            ) : followsYou ? (
              _copy('follow.followBack', { defaultValue: 'Follow back' })
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

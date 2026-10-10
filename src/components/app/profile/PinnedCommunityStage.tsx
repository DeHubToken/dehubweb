/**
 * A pinned community worn by the profile header: the community's
 * art as a soft colour wash behind the profile details, closed off by a thin
 * sharp strip of the same art with its logo, name and a way in.
 *
 * The featured community uses the same wash and strip at every screen size.
 */

import { Pin, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Community } from '@/hooks/use-communities';
import { storageImage } from '@/lib/media-url';

/** The first pinned community with art is the one the header wears. */
export function featuredPinnedCommunity(pins: Array<{ communities?: Community | null }>): Community | null {
  for (const pin of pins) {
    if (pin.communities?.banner_url) return pin.communities;
  }
  return null;
}

/** Sits behind the profile details; the parent must be positioned and isolated. */
export function PinnedCommunityWash({ community }: { community: Community }) {
  if (!community.banner_url) return null;
  return (
    <div data-pinned-wash aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* A small image is plenty: the blur throws away every detail. */}
      <div
        className="absolute -inset-16 bg-cover bg-center"
        style={{ backgroundImage: `url(${storageImage(community.banner_url, 480)})` }}
      />
    </div>
  );
}

export function PinnedCommunityStrip({
  community,
  onOpen,
  onManagePins,
}: {
  community: Community;
  onOpen: () => void;
  /** Own profile only. */
  onManagePins?: () => void;
}) {
  const { t } = useTranslation();
  if (!community.banner_url) return null;
  return (
    <div data-pinned-strip className="relative flex h-[72px] items-center gap-3 overflow-hidden border-t border-white/[0.14] px-4 sm:px-6">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover"
        style={{ backgroundImage: `url(${storageImage(community.banner_url, 1100)})`, backgroundPosition: 'center 60%' }}
      />
      <div data-pinned-strip-shade aria-hidden className="absolute inset-0" />
      <button
        type="button"
        onClick={onOpen}
        className="relative flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-black/40 ring-1 ring-white/30">
          {community.avatar_url ? (
            <img src={storageImage(community.avatar_url, 64)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <Users className="h-4 w-4 text-white/80" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white">{community.name}</span>
          <span className="flex items-center gap-1 text-xs text-white opacity-80">
            <Pin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{t('comments.pinnedBadge')} · {community.member_count.toLocaleString()} {t('communities.members')}</span>
          </span>
        </span>
      </button>
      {onManagePins && (
        <button
          type="button"
          data-keep-dark
          onClick={onManagePins}
          aria-label={t('communities.pinToProfile')}
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] border border-white/20 bg-black/30 text-white/80 backdrop-blur-md transition-colors hover:bg-white/15 hover:text-white"
        >
          <Pin className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        data-keep-dark
        onClick={onOpen}
        className="relative h-8 flex-shrink-0 rounded-[10px] border border-white/20 bg-white/10 px-3 text-[13px] font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
      >
        {t('wallet.view')}
      </button>
    </div>
  );
}

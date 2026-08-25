/**
 * DeHub Link Embed
 * ================
 * Turns a parsed DeHub entity link into the right card. Every surface that
 * shows user-written text — feed cards, comments, DMs, community chat, the
 * composer — renders links through here, so a store link looks the same in a
 * DM as it does in the feed and a new entity kind reaches all of them at once.
 *
 * The fallback matters as much as the cards. Surfaces strip the URL out of the
 * text before rendering, on the assumption that the card replaces it — so an
 * embed that renders `null` when the entity fails to load (deleted, private,
 * API down) takes the link with it and leaves the reader with a message that
 * silently lost a third of its meaning. Every card here falls back to a chip
 * that still goes where the link went.
 */

import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { resolveNewPost } from '@/lib/api/dehub';
import type { DehubLinkMatch } from '@/lib/dehub-links';
import { dehubLinkLabel, findDehubLinks, stripDehubLinkMatches } from '@/lib/dehub-links';
import { CommunityLinkEmbed } from '@/components/app/communities/CommunityLinkEmbed';
import { CommunityInviteEmbed } from '@/components/app/communities/CommunityInviteEmbed';
import { StoreLinkEmbed } from '@/components/app/stores/StoreLinkEmbed';
import { EventLinkEmbed } from '@/components/app/events/EventLinkEmbed';
import { StageLinkEmbed } from '@/components/app/stages/StageLinkEmbed';
import { ProfileLinkEmbed } from '@/components/app/profile/ProfileLinkEmbed';
import { SharedPostEmbed } from '@/components/app/chat/SharedPostEmbed';
import { FilmLinkEmbed } from '@/components/cinema/FilmLinkEmbed';

/**
 * What a card renders when its entity could not be loaded: the link, still
 * clickable, still in-app.
 */
export function DehubLinkFallback({ link }: { link: DehubLinkMatch }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(link.path);
      }}
      data-no-navigate
      className="w-full flex items-center gap-2.5 px-3 py-2.5 mt-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
        <Link2 className="w-4 h-4 text-zinc-500" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white truncate">
          View {dehubLinkLabel(link.kind)}
        </p>
        <p className="text-xs text-zinc-500 truncate">dehub.io{link.path}</p>
      </div>
    </button>
  );
}

interface DehubLinkEmbedProps {
  link: DehubLinkMatch;
  /**
   * Posts render at a fixed 280px inside a DM bubble and full-bleed everywhere
   * else. Defaults to full width because the feed is the common case.
   */
  compact?: boolean;
  className?: string;
}

/** Resolves /newpost/<n> to its tokenId, then renders the ordinary post card. */
function NewPostSlugEmbed({
  newPostId,
  fullWidth,
  className,
  fallback,
}: {
  newPostId: string;
  fullWidth: boolean;
  className?: string;
  fallback: ReactNode;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['newpost-resolve', newPostId],
    queryFn: () => resolveNewPost(newPostId),
    // The slug→tokenId mapping never changes once assigned.
    staleTime: Infinity,
  });

  if (isLoading) {
    return <div className="mt-2 h-24 rounded-xl bg-white/[0.04] animate-pulse" />;
  }
  if (!data) return <>{fallback}</>;

  return (
    <SharedPostEmbed
      tokenId={String(data.tokenId)}
      fullWidth={fullWidth}
      className={className}
      fallback={fallback}
    />
  );
}

export function DehubLinkEmbed({ link, compact = false, className }: DehubLinkEmbedProps) {
  const fallback = <DehubLinkFallback link={link} />;

  switch (link.kind) {
    case 'post':
      // The off-chain slug form carries no tokenId, and everything downstream
      // keys on one — resolve it first, then render the same card.
      if (!link.tokenId && link.newPostId) {
        return (
          <NewPostSlugEmbed
            newPostId={link.newPostId}
            fullWidth={!compact}
            className={className}
            fallback={fallback}
          />
        );
      }
      return (
        <SharedPostEmbed
          tokenId={link.tokenId!}
          fullWidth={!compact}
          className={className}
          fallback={fallback}
        />
      );
    case 'profile':
      return <ProfileLinkEmbed username={link.username!} fallback={fallback} />;
    case 'community':
      return <CommunityLinkEmbed slug={link.slug!} fallback={fallback} />;
    case 'communityInvite':
      return <CommunityInviteEmbed code={link.code!} fallback={fallback} />;
    case 'store':
      return <StoreLinkEmbed storeId={link.storeId!} listingId={null} fallback={fallback} />;
    case 'listing':
      return (
        <StoreLinkEmbed
          storeId={link.storeId!}
          listingId={link.listingId!}
          fallback={fallback}
        />
      );
    case 'event':
      return <EventLinkEmbed eventNumber={link.eventNumber!} fallback={fallback} />;
    case 'stage':
      return <StageLinkEmbed stageId={link.stageId} stageShortId={link.stageShortId} fallback={fallback} />;
    case 'film':
      return <FilmLinkEmbed link={link} compact={compact} className={className} fallback={fallback} />;
    default:
      return fallback;
  }
}

/**
 * Render every DeHub link found in a block of text.
 *
 * Capped, because the cap is the difference between a rich message and a wall
 * of cards: a message that pastes six links gets two cards and keeps the rest
 * as text (the surfaces only strip what they carded — see `strippedForDisplay`).
 */
export const MAX_EMBEDS_PER_MESSAGE = 2;

export function DehubLinkEmbeds({
  links,
  compact = false,
}: {
  links: DehubLinkMatch[];
  compact?: boolean;
}) {
  if (links.length === 0) return null;
  return (
    <>
      {links.map((link) => (
        <DehubLinkEmbed key={`${link.kind}-${link.path}`} link={link} compact={compact} />
      ))}
    </>
  );
}

/**
 * The one call a surface needs: what to card, and what text to print now that
 * those links are being carded.
 *
 * Returns only the links that will actually be rendered, and text stripped of
 * exactly those — so a body with five links keeps three of them as readable
 * text instead of silently losing them to the cap.
 */
export function useDehubLinks(text?: string | null): {
  links: DehubLinkMatch[];
  displayText: string;
} {
  return useMemo(() => {
    const links = findDehubLinks(text).slice(0, MAX_EMBEDS_PER_MESSAGE);
    return { links, displayText: stripDehubLinkMatches(text, links) };
  }, [text]);
}

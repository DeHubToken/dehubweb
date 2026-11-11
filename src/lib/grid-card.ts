/**
 * Grid cards
 * ==========
 * In the feed, a post can carry a card: a stage, an event, a poll, a quoted
 * post, a link preview, a community, a shop item. In the profile grid the same
 * post used to be a plain text poster with the raw link printed in its words,
 * so a stage announcement looked like any other text post.
 *
 * This works out which card a grid post carries, so its tile can be a small
 * copy of that card (components/app/profile/GridCardTile) and a picture or
 * video tile can say what it is (Short, Comic, Earn) with a pill.
 */

import { findDehubLinks, type DehubLinkKind, type DehubLinkMatch } from '@/lib/dehub-links';
import { extractUrlsFromText } from '@/lib/api/link-preview';
import { parseDehubLink } from '@/lib/dehub-links';

export type GridCardKind =
  | 'stage' | 'event' | 'poll' | 'quote' | 'sharedPost' | 'link' | 'community'
  | 'shop' | 'profile' | 'film' | 'bounty' | 'app' | 'proposal'
  | 'short' | 'comic' | 'earn';

const LINK_KIND: Partial<Record<DehubLinkKind, GridCardKind>> = {
  stage: 'stage',
  event: 'event',
  community: 'community',
  communityInvite: 'community',
  post: 'sharedPost',
  profile: 'profile',
  film: 'film',
  bounty: 'bounty',
  app: 'app',
  proposal: 'proposal',
};

/** The card a text post's words point at, if any: first Riftn link, else first outside link. */
export interface TextCard {
  kind: GridCardKind;
  link?: DehubLinkMatch;
  url?: string;
}

export function textCardOf(post: { content?: string; title?: string; isQuotePost?: boolean; quotedPost?: unknown }): TextCard | null {
  if (post.isQuotePost && post.quotedPost) return { kind: 'quote' };
  const text = post.content || post.title || '';
  for (const link of findDehubLinks(text)) {
    const kind = LINK_KIND[link.kind];
    if (kind) return { kind, link };
  }
  const url = extractUrlsFromText(text).find((u) => !parseDehubLink(u));
  return url ? { kind: 'link', url } : null;
}

/** A picture or video tile that is more than a plain picture or video. */
export function mediaCardOf(post: { isShort?: boolean; layout?: string; bountyAmount?: number }): GridCardKind | null {
  if (post.isShort) return 'short';
  if (post.layout === 'comic') return 'comic';
  if (Number(post.bountyAmount) > 0) return 'earn';
  return null;
}

/** Words for a tile that shows a card: the link the card stands for is taken out. */
export function wordsWithoutLinks(text: string): string {
  return text.replace(/https?:\/\/\S+/g, '').replace(/\b(?:www\.)?(?:riftn\.com|dehub\.io)\/\S+/g, '').replace(/\s+/g, ' ').trim();
}

/** Host for a link card's footer: "youtube.com". */
export function linkHost(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

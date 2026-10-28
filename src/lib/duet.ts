/**
 * Duets: a creator records themselves next to someone else's video.
 *
 * A duet is posted as a quote of the original with the #duet tag, so the
 * backend keeps the link (quotedTokenId) and applies the creator's quote
 * policy. The duet-specific parts (the creator's "Allow duets" setting, the
 * Duets list and count, the notification and the tip split) live in
 * remix-links.
 */

export interface DuetOf {
  tokenId: string;
  username?: string;
}

const DUET_CATEGORY = 'duet';

export function duetCaption(creator?: string): string {
  return creator ? `Duet with @${creator} #duet` : 'Duet #duet';
}

export const duetsPath = (tokenId: string | number) => `/app/post/${tokenId}/duets`;

/** The original a feed item duets, read from the raw API post. */
export function duetOfPost(raw: {
  isQuotePost?: boolean;
  quotedTokenId?: number | string | null;
  quotedPost?: { tokenId?: number | string; mintername?: string; minterUsername?: string } | null;
  category?: string | string[] | null;
} | null | undefined): DuetOf | undefined {
  if (!raw?.isQuotePost) return undefined;
  const tokenId = raw.quotedTokenId ?? raw.quotedPost?.tokenId;
  if (tokenId == null || tokenId === '') return undefined;
  const categories = Array.isArray(raw.category) ? raw.category : raw.category ? [raw.category] : [];
  if (!categories.some(c => String(c).toLowerCase() === DUET_CATEGORY)) return undefined;
  const username = raw.quotedPost?.minterUsername || raw.quotedPost?.mintername;
  return { tokenId: String(tokenId), ...(username ? { username } : {}) };
}

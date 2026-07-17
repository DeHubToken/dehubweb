/**
 * Post Link Helpers
 * =================
 * Detect / build / strip DeHub post URLs (`/app/post/<tokenId>`).
 * Used to render shared posts as rich cards inside DM bubbles and to
 * build the share URL when sending a post into a direct message.
 * Mirrors the community-link-embed pattern.
 */

/** Extract the numeric post tokenId from a URL like /app/post/12345 */
export function extractPostTokenId(text?: string | null): string | null {
  if (!text) return null;
  const match = text.match(/\/app\/post\/(\d+)/);
  return match ? match[1] : null;
}

/** Check if text contains a DeHub post link */
export function hasPostLink(text?: string | null): boolean {
  return !!text && /\/app\/post\/\d+/.test(text);
}

/**
 * Strip post link URLs from display text (display-only — never use for API payloads).
 * Removes the full URL containing /app/post/<tokenId> along with surrounding whitespace.
 */
export function stripPostLinks(text: string): string {
  if (!text) return text;
  return text
    // Full URL form (with optional protocol/host)
    .replace(/(?:https?:\/\/)?[^\s)<>"']*\/app\/post\/\d+[^\s)<>"']*/gi, '')
    // Collapse leftover whitespace
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Build a shareable absolute URL for a post. */
export function buildPostShareUrl(tokenId: string | number): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dehub.io';
  return `${origin}/app/post/${tokenId}`;
}

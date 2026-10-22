// Text fitting for cross-posts. No Deno or network imports, so the rules can be
// tested under plain Node (see growth-autopost/posts.test.ts).

/** Character limits the platforms enforce on a post body. Absent means generous enough not to matter. */
export const TEXT_LIMIT: Record<string, number> = {
  twitter: 280, threads: 500, instagram: 2200, tiktok: 2200, linkedin: 3000, pinterest: 800, googlebusiness: 1500,
};

/** Farcaster's standard cast limit is in bytes, not characters. */
export const CAST_MAX_BYTES = 320;

export function clip(text: string, limit?: number): string {
  if (!limit || text.length <= limit) return text;
  return text.slice(0, limit - 1).trimEnd() + '…';
}

/** Farcaster's standard cast limit is 320 bytes; links travel as embeds instead. */
export function clipCastText(text: string, maxBytes = CAST_MAX_BYTES): string {
  const enc = new TextEncoder();
  if (enc.encode(text).length <= maxBytes) return text;
  let out = text;
  while (enc.encode(out + '…').length > maxBytes) out = out.slice(0, -1);
  return out.trimEnd() + '…';
}

/**
 * The body plus the link on its own line, shortening the body (never the link)
 * when the pair would run over the platform's limit.
 */
export function withLinkWithin(content: string, link: string, limit?: number): string {
  const withLink = link ? `${content}\n\n${link}` : content;
  if (!limit || withLink.length <= limit) return withLink;
  return clip(content, limit - (link ? link.length + 2 : 0)) + (link ? `\n\n${link}` : '');
}

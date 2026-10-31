/**
 * Article helpers shared by the feed cover, the reader and the composer.
 * Everything here works on the markdown body as stored, so the numbers the
 * writer sees while typing are the numbers readers see on the post.
 */

export const ARTICLE_BODY_MAX = 20000;
export const ARTICLE_BODY_MIN = 100;
/** Article summaries keep the base post cap whatever the author's tier. */
export const ARTICLE_SUMMARY_MAX = 500;

/** Markdown with its syntax stripped, close enough to what a reader reads. */
export function articlePlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function articleWordCount(markdown: string): number {
  const text = articlePlainText(markdown);
  return text ? text.split(' ').length : 0;
}

/** Minutes at 230 words a minute, never less than one. */
export function articleReadingMinutes(markdown: string): number {
  return Math.max(1, Math.round(articleWordCount(markdown) / 230));
}

export function articleSlug(text: string): string {
  return articlePlainText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'section';
}

export interface ArticleHeading { level: number; text: string; id: string; /** 1-based source line, matches react-markdown's node position. */ line: number }

/** The body's headings in order, with the same ids the reader puts on them. */
export function articleHeadings(markdown: string): ArticleHeading[] {
  const seen = new Map<string, number>();
  const out: ArticleHeading[] = [];
  let inFence = false;
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = articlePlainText(m[2]);
    if (!text) continue;
    out.push({ level: m[1].length, text, id: uniqueSlug(text, seen), line: i + 1 });
  }
  return out;
}

export function uniqueSlug(text: string, seen: Map<string, number>): string {
  const base = articleSlug(text);
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return n ? `${base}-${n + 1}` : base;
}

/** The body's first real paragraph, cut to the summary cap on a word. */
export function articleSummaryFromBody(markdown: string): string {
  const para = markdown
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .find(p => p && !/^(#{1,6}\s|>|[-*+]\s|\d+\.\s|!\[)/.test(p));
  const text = articlePlainText(para ?? '');
  if (text.length <= ARTICLE_SUMMARY_MAX) return text;
  const cut = text.slice(0, ARTICLE_SUMMARY_MAX - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 200))}…`;
}

const BARE_URL_LINE = /^<?(https?:\/\/[^\s<>]+?)>?$/;
const LINK_LINE = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/;
// A bare address in running text: not already the target of a markdown link
// `](`, an autolink `<`, or a link's own label `[`.
const INLINE_URL = /(^|[^(<[\w/])(https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'"])/g;

/**
 * The body as the reader renders it, with outside links made readable:
 * - a bare address in the text becomes a link (writers paste them, and plain
 *   markdown leaves them as grey text);
 * - a line that is only a link, or only an address, stands as its own block
 *   so the reader can show a preview card for it;
 * - an address followed straight away by a titled link to the same address
 *   (pasted, then linked) keeps only the titled link.
 * Code, existing links and autolinks are left alone.
 */
export function articleLinkBlocks(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let inFence = false;
  const nextContent = (from: number) => {
    for (let j = from; j < lines.length; j++) if (lines[j].trim()) return lines[j].trim();
    return '';
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; out.push(line); continue; }
    if (inFence) { out.push(line); continue; }
    const trimmed = line.trim();
    const bare = BARE_URL_LINE.exec(trimmed);
    if (bare) {
      const next = LINK_LINE.exec(nextContent(i + 1));
      if (next && next[2] === bare[1]) continue;
      out.push('', `<${bare[1]}>`, '');
      continue;
    }
    if (LINK_LINE.test(trimmed)) { out.push('', trimmed, ''); continue; }
    out.push(line.split(/(`[^`]*`|!?\[[^\]]*\]\([^)]*\)|<[^>\s]+>)/).map((part, k) => (k % 2 ? part : part.replace(INLINE_URL, '$1<$2>'))).join(''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

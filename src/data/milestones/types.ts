/**
 * Per-milestone article bodies.
 * =============================
 * The 78 posts in the milestone archive used to share nine blocks of prose.
 * `generatePostContent()` in blogPosts.ts keyword-matched each bullet point to
 * a category, dropped the bullet on the floor and returned a template — so
 * nineteen posts carried the same "finance" body word for word, seventeen more
 * shared the "product" one, and the actual facts (the Gate.io listing agent,
 * the Palawan power of attorney, the v2 contract freeze) survived only in the
 * seoDescription.
 *
 * Each milestone now owns its text, keyed by slug. Same reasoning as
 * MILESTONE_BANNERS: slugs are stable, positions are not.
 *
 * Two rules for anything added here:
 *
 *  1. Headings are `###` and `####` ONLY. BlockRenderer returns null for `#`
 *     and `##` (src/components/blog/content/BlockRenderer.tsx), so every `##`
 *     in the old templates rendered as nothing and the posts published as
 *     unheaded slabs of grey text.
 *  2. `**bold**`, links, `-` lists and `![alt](src)` images render. Italics and
 *     markdown tables do not — they publish as literal asterisks and pipes.
 *
 * Bodies stay inside the facts of each bullet point. Where a milestone has no
 * public detail beyond one line, the post is honest about that rather than
 * padded out to a word count.
 */
export interface MilestoneContent {
  /** One-line card summary. Replaces the identical excerpt all 78 posts shared. */
  excerpt: string;
  /** Full markdown body, `###` headings only. */
  content: string;
}

export type MilestoneContentMap = Record<string, MilestoneContent>;

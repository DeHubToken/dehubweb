/**
 * Which visibility a transcript write should carry.
 *
 * A transcript row is written many times over its life: pending while the
 * media is still transcoding, again once the media is reachable, again on each
 * retry, again on a force. Every one of those passes used to write the
 * visibility computed from the source, flat.
 *
 * For a post that is defensible — the post is the source of truth, so a post
 * that goes paid or gets marked mature should pull its transcript along. For a
 * stage it is not: there is nothing on the stage to read a visibility off, so
 * the resolver returns the constant `public`. An admin who locked a stage
 * transcript therefore watched the next sweeper pass publish it again, with
 * nothing in the logs to say why.
 *
 * So the write ratchets one way. A source that has become more restrictive
 * still reaches the transcript; nothing automatic ever relaxes one. Going back
 * the other way is a decision somebody makes, not a side effect of a retry.
 *
 * Kept free of imports and of Deno globals so it can be exercised directly
 * from the test suite rather than asserted against as source text.
 */

export type TranscriptVisibility = 'public' | 'members' | 'private';

/** Least to most restrictive. Anything unrecognised is treated as public. */
const RANK: Record<string, number> = { public: 0, members: 1, private: 2 };

export function visibilityRank(value: unknown): number {
  return RANK[String(value ?? '')] ?? 0;
}

/**
 * @param held      what the existing row carries, if there is one
 * @param resolved  what this run computed from the source
 */
export function nextVisibility(held: unknown, resolved: unknown): TranscriptVisibility {
  const computed = (RANK[String(resolved ?? '')] !== undefined
    ? String(resolved)
    : 'public') as TranscriptVisibility;
  const current = String(held ?? '');
  if (RANK[current] === undefined) return computed;
  return visibilityRank(current) > visibilityRank(computed)
    ? (current as TranscriptVisibility)
    : computed;
}

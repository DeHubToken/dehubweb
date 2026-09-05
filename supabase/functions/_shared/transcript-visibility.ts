/**
 * Which visibility a transcript write should carry.
 *
 * A transcript row is written many times over its life: pending while the media
 * transcodes, again once it is reachable, again per retry, again on a force.
 * Every one of those passes used to write the visibility computed from the
 * source, flat.
 *
 * For a post that is right — the post is the source of truth, so a post that
 * goes paid or gets marked mature should pull its transcript along, and a post
 * that goes free should let it back out. For a stage it is not: there is
 * nothing on the stage to read a visibility off, so the resolver returns the
 * constant `public`, and an admin who locked a stage transcript watched the
 * next sweeper pass publish it again with nothing in the logs to say why.
 *
 * The first fix for that was a ratchet — never write looser than the row
 * already carries. It closed the bug and opened a smaller one, because a
 * ratchet cannot tell WHY a row is restricted. A post that went from paid back
 * to free kept a private transcript for good, and only the admin panel could
 * undo it: a one-way door with nothing behind it.
 *
 * The missing fact was who set the value, and `transcripts.visibility_locked`
 * now carries it. A person's decision sticks in both directions. A derived
 * value follows its source in both directions. Nothing has to guess.
 *
 * Kept free of imports and of Deno globals so it can be exercised directly from
 * the test suite rather than asserted against as source text.
 */

export type TranscriptVisibility = 'public' | 'members' | 'private';

/** Least to most restrictive. Anything unrecognised is treated as public. */
const RANK: Record<string, number> = { public: 0, members: 1, private: 2 };

export function visibilityRank(value: unknown): number {
  return RANK[String(value ?? '')] ?? 0;
}

function known(value: unknown): TranscriptVisibility | null {
  const s = String(value ?? '');
  return RANK[s] === undefined ? null : (s as TranscriptVisibility);
}

export interface VisibilityDecision {
  /** What to write, or null to leave the column alone entirely. */
  visibility: TranscriptVisibility | null;
}

export interface VisibilityInput {
  /** What the existing row carries, if there is one. */
  held: unknown;
  /** True when a person set `held`, rather than a previous run deriving it. */
  locked: boolean;
  /** What this run computed from the source. */
  resolved: unknown;
  /**
   * Whether the source can actually speak to visibility. A post can; a stage
   * cannot, and its `resolved` is a constant carrying no information.
   */
  sourceKnowsVisibility: boolean;
  /** True on the write that creates the row. */
  isNew: boolean;
}

export function decideVisibility(input: VisibilityInput): VisibilityDecision {
  const computed = known(input.resolved) ?? 'public';

  // A new row has nothing to protect and takes the computed value, whatever
  // the source is. For a stage that is the sensible default it always was.
  if (input.isNew) return { visibility: computed };

  // Somebody chose this. Neither direction is ours to undo.
  if (input.locked) return { visibility: null };

  // A stage has no visibility to derive, so there is nothing honest to write:
  // leave whatever is there rather than stamping the constant over it.
  if (!input.sourceKnowsVisibility) return { visibility: null };

  // A post. Follow it, both ways — that is what "the post is the source of
  // truth" means, and the lock above is what protects a moderator's call.
  return { visibility: computed };
}

/**
 * The old ratchet, kept for the one caller that has no lock to read.
 *
 * @deprecated Prefer {@link decideVisibility}. This cannot tell a decision from
 * a derivation and so can only ever tighten.
 */
export function nextVisibility(held: unknown, resolved: unknown): TranscriptVisibility {
  const computed = known(resolved) ?? 'public';
  const current = known(held);
  if (current === null) return computed;
  return visibilityRank(current) > visibilityRank(computed) ? current : computed;
}

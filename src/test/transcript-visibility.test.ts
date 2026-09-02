/**
 * A transcript row is written many times — pending while the media
 * transcodes, again once it is reachable, again on each retry, again on a
 * force — and every one of those passes wrote the visibility computed from the
 * source.
 *
 * For a stage there is no visibility to compute: the resolver returns the
 * constant `public`. So an admin who locked a stage transcript watched the next
 * sweeper pass publish it again, and nothing in the logs said why.
 *
 * These exercise the rule that fixed it: a source that has become more
 * restrictive still reaches the transcript, and nothing automatic ever relaxes
 * one.
 */
import { describe, expect, it } from 'vitest';
import {
  nextVisibility,
  visibilityRank,
} from '../../supabase/functions/_shared/transcript-visibility.ts';

describe('nextVisibility', () => {
  it('keeps a locked transcript locked when the source says public', () => {
    // The stage case exactly: resolveMedia has no stage visibility to read, so
    // it answers 'public' on every single pass.
    expect(nextVisibility('private', 'public')).toBe('private');
    expect(nextVisibility('members', 'public')).toBe('members');
  });

  it('still lets a source that tightened pull the transcript with it', () => {
    expect(nextVisibility('public', 'private')).toBe('private');
    expect(nextVisibility('public', 'members')).toBe('members');
    expect(nextVisibility('members', 'private')).toBe('private');
  });

  it('takes the computed value when there is no row yet', () => {
    expect(nextVisibility(undefined, 'public')).toBe('public');
    expect(nextVisibility(null, 'private')).toBe('private');
    expect(nextVisibility('', 'members')).toBe('members');
  });

  it('leaves a matching pair alone', () => {
    expect(nextVisibility('private', 'private')).toBe('private');
    expect(nextVisibility('public', 'public')).toBe('public');
  });

  it('does not let an unknown value in the row unlock or lock anything', () => {
    // A value the ladder does not know is not evidence of a decision, so the
    // computed one wins rather than being ranked against nonsense.
    expect(nextVisibility('unlisted', 'members')).toBe('members');
    expect(nextVisibility('unlisted', 'public')).toBe('public');
  });

  it('falls back to public when the computed value is unknown', () => {
    expect(nextVisibility(undefined, 'whatever')).toBe('public');
    // …but never at the cost of unlocking a row that was locked.
    expect(nextVisibility('private', 'whatever')).toBe('private');
  });

  it('ranks the ladder least to most restrictive', () => {
    expect(visibilityRank('public')).toBeLessThan(visibilityRank('members'));
    expect(visibilityRank('members')).toBeLessThan(visibilityRank('private'));
    expect(visibilityRank(undefined)).toBe(visibilityRank('public'));
  });
});

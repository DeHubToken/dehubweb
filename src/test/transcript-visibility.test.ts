/**
 * A transcript row is written many times — pending while the media transcodes,
 * again once it is reachable, again on each retry, again on a force — and every
 * one of those passes wrote the visibility computed from the source.
 *
 * For a stage there is no visibility to compute: the resolver returns the
 * constant `public`. So an admin who locked a stage transcript watched the next
 * sweeper pass publish it again, and nothing in the logs said why.
 *
 * The first fix was a ratchet — never write looser than the row already carries.
 * It closed that and opened a smaller one: a ratchet cannot tell WHY a row is
 * restricted, so a post that went from paid back to free kept a private
 * transcript for good. These pin the rule that replaced it, which asks who set
 * the value instead of guessing from its direction.
 */
import { describe, expect, it } from 'vitest';
import {
  decideVisibility,
  nextVisibility,
  visibilityRank,
} from '../../supabase/functions/_shared/transcript-visibility.ts';

/** A post knows its own gating; a stage has nothing to derive one from. */
const POST = { sourceKnowsVisibility: true };
const STAGE = { sourceKnowsVisibility: false };

const decide = (over: Partial<Parameters<typeof decideVisibility>[0]>) =>
  decideVisibility({
    held: 'public',
    locked: false,
    resolved: 'public',
    sourceKnowsVisibility: true,
    isNew: false,
    ...over,
  }).visibility;

describe('decideVisibility', () => {
  it('takes the computed value when the row is being created', () => {
    expect(decide({ isNew: true, resolved: 'private', ...POST })).toBe('private');
    expect(decide({ isNew: true, resolved: 'public', ...STAGE })).toBe('public');
  });

  /** The original bug: a stage's `resolved` is a constant carrying no information. */
  it('never rewrites a stage transcript after it exists', () => {
    expect(decide({ held: 'private', resolved: 'public', ...STAGE })).toBeNull();
    expect(decide({ held: 'members', resolved: 'public', ...STAGE })).toBeNull();
    expect(decide({ held: 'public', resolved: 'public', ...STAGE })).toBeNull();
  });

  /** The bug the ratchet introduced: a post that went free stayed locked down. */
  it('lets a post that went free relax its transcript again', () => {
    expect(decide({ held: 'private', resolved: 'public', ...POST })).toBe('public');
    expect(decide({ held: 'private', resolved: 'members', ...POST })).toBe('members');
  });

  it('still lets a post that tightened pull its transcript with it', () => {
    expect(decide({ held: 'public', resolved: 'private', ...POST })).toBe('private');
    expect(decide({ held: 'members', resolved: 'private', ...POST })).toBe('private');
  });

  /** A person's decision is not ours to undo, in either direction. */
  it('leaves a locked row alone whichever way the source moved', () => {
    expect(decide({ held: 'private', resolved: 'public', locked: true, ...POST })).toBeNull();
    expect(decide({ held: 'public', resolved: 'private', locked: true, ...POST })).toBeNull();
    expect(decide({ held: 'private', resolved: 'public', locked: true, ...STAGE })).toBeNull();
  });

  it('falls back to public when the computed value is unknown', () => {
    expect(decide({ isNew: true, resolved: 'whatever', ...POST })).toBe('public');
  });
});

describe('nextVisibility', () => {
  /** Retained for callers with no lock to read; it can only tighten. */
  it('keeps the more restrictive of the two', () => {
    expect(nextVisibility('private', 'public')).toBe('private');
    expect(nextVisibility('public', 'private')).toBe('private');
    expect(nextVisibility(undefined, 'members')).toBe('members');
    expect(nextVisibility('unlisted', 'members')).toBe('members');
  });
});

describe('visibilityRank', () => {
  it('ranks the ladder least to most restrictive', () => {
    expect(visibilityRank('public')).toBeLessThan(visibilityRank('members'));
    expect(visibilityRank('members')).toBeLessThan(visibilityRank('private'));
    expect(visibilityRank(undefined)).toBe(visibilityRank('public'));
  });
});

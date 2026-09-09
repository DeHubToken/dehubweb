/**
 * The two rules the spend drawer checks before it offers you a post.
 * ==================================================================
 * Both exist so a person is never offered a choice the server is going to
 * refuse — that refusal costs no allowance, but it reads as broken, which is
 * the complaint the drawer was built to answer.
 *
 * Pinned here: one input box can tell a pasted link from a search term, and
 * the Boost/Second Wind age line cuts the right way round.
 */
import { describe, it, expect, vi } from 'vitest';
import { WEEK_MS, ageSuits, postIdFromInput } from '../spend-power-target';

describe('postIdFromInput', () => {
  it('reads a post id out of the three things people actually paste', () => {
    expect(postIdFromInput('https://dehub.io/app/post/2008')).toBe(2008);
    expect(postIdFromInput('/app/post/2008')).toBe(2008);
    expect(postIdFromInput('2008')).toBe(2008);
  });

  it('ignores the rest of a link', () => {
    expect(postIdFromInput('https://dehub.io/app/post/2008?ref=x#comments')).toBe(2008);
    expect(postIdFromInput('  https://dehub.io/app/post/7  ')).toBe(7);
  });

  it('treats anything else as a search term, which is what makes one box work', () => {
    expect(postIdFromInput('sunset over the harbour')).toBeNull();
    expect(postIdFromInput('')).toBeNull();
    expect(postIdFromInput('   ')).toBeNull();
    // A username with digits in it is a search, not a post.
    expect(postIdFromInput('mal2008')).toBeNull();
    // A profile link is not a post link.
    expect(postIdFromInput('https://dehub.io/maldoteth')).toBeNull();
  });
});

describe('ageSuits', () => {
  const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

  it('gives Boost the recent half and Second Wind the archive', () => {
    const fresh = iso(2 * 24 * 60 * 60 * 1000);
    const old = iso(WEEK_MS + 60_000);

    expect(ageSuits('boost', fresh)).toBe(true);
    expect(ageSuits('boost', old)).toBe(false);
    expect(ageSuits('second_wind', old)).toBe(true);
    expect(ageSuits('second_wind', fresh)).toBe(false);
  });

  it('puts a post exactly on the line in Boost, matching the server', () => {
    // The server's rule is `age > WEEK` for Second Wind, so the boundary
    // itself is still a Boost. Off by one here offers the wrong power and
    // eats a refusal.
    const now = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const exactly = new Date(now - WEEK_MS).toISOString();
      expect(ageSuits('boost', exactly)).toBe(true);
      expect(ageSuits('second_wind', exactly)).toBe(false);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('lets every other power through at any age', () => {
    for (const key of ['timeline_bomber', 'harpoon', 'deep_current', 'flak_jacket'] as const) {
      expect(ageSuits(key, iso(0))).toBe(true);
      expect(ageSuits(key, iso(400 * 24 * 60 * 60 * 1000))).toBe(true);
    }
  });

  it('passes a post whose date cannot be read rather than hiding it', () => {
    expect(ageSuits('boost', undefined)).toBe(true);
    expect(ageSuits('boost', 'not a date')).toBe(true);
    expect(ageSuits('second_wind', 'not a date')).toBe(true);
  });
});

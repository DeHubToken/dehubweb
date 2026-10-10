import { describe, it, expect } from 'vitest';
import { publicPollResult, publicProfileBadges } from '../../../server/post-share-details.js';
import { pollHasEnded, pollVotePercent, pollOptionWins } from '../poll-results';

const poll = { tokenId: 6501, question: 'Which layout?', isActive: true, expiresAt: '2026-10-09T19:30:05.887Z', totalVotes: 123, options: [
  { index: 0, text: 'New full width media', voteCount: 55 },
  { index: 1, text: 'Old bento boxes', voteCount: 68 },
] };
const now = Date.parse('2026-10-10T00:00:00Z');

describe('public poll conclusion', () => {
  it('uses expiry even when the backend active flag is stale', () => {
    const result = publicPollResult(poll, 6501, now);
    expect(result.ended).toBe(true);
    expect(result.totalVotes).toBe(123);
    expect(result.options.map(o => [o.percent, o.winner])).toEqual([[45, false], [55, true]]);
  });
  it('marks every tied winner and no winner for zero votes', () => {
    const tied = publicPollResult({ ...poll, totalVotes: 2, options: poll.options.map(o => ({ ...o, voteCount: 1 })) }, 6501, now);
    expect(tied.options.every(o => o.winner && o.percent === 50)).toBe(true);
    const empty = publicPollResult({ ...poll, totalVotes: 0, options: poll.options.map(o => ({ ...o, voteCount: 0 })) }, 6501, now);
    expect(empty.options.every(o => !o.winner && o.percent === 0)).toBe(true);
  });
  it('never exposes open results, accepts an explicit closure and rejects another post', () => {
    const open = publicPollResult({ ...poll, expiresAt: '2099-01-01' }, 6501, now);
    expect(open.ended).toBe(false);
    expect(open.totalVotes).toBeNull();
    expect(open.options.every(o => o.count === null && o.percent === null && !o.winner)).toBe(true);
    expect(publicPollResult({ ...poll, isActive: false, expiresAt: '2099-01-01' }, 6501, now).ended).toBe(true);
    expect(publicPollResult(poll, 7000, now)).toBeNull();
  });
});

describe('profile badge eligibility and order', () => {
  it('uses the profile override, higher earned tiers and retained locks', () => {
    expect(publicProfileBadges({ username: 'maldoteth', badgeBalance: 46707 }, null, .001)[0].name).toBe('Megalodon');
    expect(publicProfileBadges({ username: 'ma255', badgeBalance: 50000000 }, null, .001)[0].name).toBe('Megalodon');
    expect(publicProfileBadges({ username: 'holder', badgeBalance: 20000, badgeLock: { tier: 'Crocodile', requirement: 15000 } }, null, .001)[0].name).toBe('Crocodile');
  });
  it('respects hidden balances and only draws an earned equipped streamer badge', () => {
    const profile = { username: 'maldoteth', badgeBalance: 50000000, hideBadgeAndBalance: true };
    expect(publicProfileBadges(profile, null, .001)).toEqual([]);
    const progress = { totalStreams: 1, selectedBadgeId: 'first-light', cards: [{ id: 'first-light', earnedAt: null }] };
    expect(publicProfileBadges(profile, progress, .001)).toEqual([]);
  });
  it('never invents verification and preserves staking, streamer, new-member ordering', async () => {
    const { STREAMER_BADGE_IDS } = await import('../streamer-badge-art');
    const id = STREAMER_BADGE_IDS[0];
    const progress = { totalStreams: 1, selectedBadgeId: id, cards: [{ id, earnedAt: '2026-10-01' }] };
    const badges = publicProfileBadges({ username: 'maldoteth', isVerified: false }, progress, .001, true);
    expect(badges.map(b => b.kind)).toEqual(['staking', 'streamer', 'new']);
    expect(publicProfileBadges({ username: 'ordinary', badgeBalance: 0, isVerified: true }, null, .001)).toEqual([]);
  });
});

it('shares the same result arithmetic as the app', () => {
  expect(pollHasEnded(poll, now)).toBe(true);
  expect(pollVotePercent(55, 123)).toBe(45);
  expect(pollOptionWins(0, 0, true)).toBe(false);
});

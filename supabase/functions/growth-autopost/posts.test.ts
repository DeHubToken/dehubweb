import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  creatorOfDay, dhbUpdate, fitsPlatform, growthPulse, isUnfeaturable, leaderboard, liveStream,
  shortsOfWeek, slotFor, stage, textFor, textsFor, utmLink, weekKey,
} from './posts.ts';

const at = new Date('2026-10-22T16:00:00Z');
const PLATFORMS = ['twitter', 'threads', 'facebook', 'instagram', 'linkedin', 'pinterest', 'farcaster'];
const LIMITS: Record<string, number> = { twitter: 280, threads: 500, instagram: 2200, linkedin: 3000, pinterest: 800 };
const bytes = (s: string) => new TextEncoder().encode(s).length;

const longPost = {
  tokenId: 6552,
  name: 'A very long title '.repeat(40),
  description: '<p>Body with <b>tags</b> &amp; entities</p>',
  minterDisplayName: 'Maya Lens',
  mintername: 'mayalens',
  totalTips: 125000,
  likes: 812,
  contentRating: 'safe',
};

test('every platform text fits its limit, and farcaster fits 320 bytes', () => {
  const texts = textsFor(creatorOfDay(longPost, at), PLATFORMS);
  for (const [platform, text] of Object.entries(texts)) {
    if (platform === 'farcaster') assert.ok(bytes(text) <= 320, `farcaster is ${bytes(text)} bytes`);
    else assert.ok(text.length <= (LIMITS[platform] ?? 5000), `${platform} is ${text.length}`);
    assert.ok(fitsPlatform(platform, text));
  }
});

test('a long quote gives way before the credit, the numbers and the link', () => {
  const x = textFor(creatorOfDay(longPost, at), 'twitter');
  assert.ok(x.length <= 280);
  assert.match(x, /^Creator of the day: Maya Lens/);
  assert.match(x, /125K DHB in tips and 812 likes/);
  assert.match(x, /…”/);
  assert.ok(x.endsWith('https://dehub.io/post/6552?utm_source=twitter&utm_medium=social&utm_campaign=autopost_creator_of_day'));
});

test('credit is by name, never an @handle that would tag someone else', () => {
  for (const text of Object.values(textsFor(creatorOfDay(longPost, at), PLATFORMS))) assert.doesNotMatch(text, /@mayalens/);
});

test('every link is tagged for its own platform and kind', () => {
  const draft = growthPulse({ totals: { total: 120000 }, active: { weekly: 9000 }, newUsers: { thisWeek: 1500 }, growth: { weekly: 1.3 } }, at)!;
  for (const platform of ['twitter', 'threads', 'linkedin']) {
    const link = textFor(draft, platform).split('\n').pop()!;
    const url = new URL(link);
    assert.equal(url.searchParams.get('utm_source'), platform);
    assert.equal(url.searchParams.get('utm_medium'), 'social');
    assert.equal(url.searchParams.get('utm_campaign'), 'autopost_growth_pulse');
  }
  // Farcaster carries the link as an embed, so the text has none.
  assert.doesNotMatch(textFor(draft, 'farcaster'), /https?:\/\//);
});

test('utmLink keeps existing parameters and replaces stale tags', () => {
  const url = new URL(utmLink('https://dehub.io/leaderboard?tab=tips&utm_source=old', 'threads', 'leaderboard'));
  assert.equal(url.searchParams.get('tab'), 'tips');
  assert.equal(url.searchParams.get('utm_source'), 'threads');
});

test('mature, hidden, banned and adult-worded content is never featured', () => {
  assert.equal(isUnfeaturable({ ...longPost }), false);
  assert.equal(isUnfeaturable({ ...longPost, contentRating: undefined }), false);
  assert.equal(isUnfeaturable({ ...longPost, contentRating: 'mature' }), true);
  assert.equal(isUnfeaturable({ ...longPost, contentRating: 'pending' }), true);
  assert.equal(isUnfeaturable({ ...longPost, contentRating: 'blocked' }), true);
  assert.equal(isUnfeaturable({ ...longPost, isHidden: true }), true);
  assert.equal(isUnfeaturable({ ...longPost, minterUser: { isBanned: true } }), true);
  assert.equal(isUnfeaturable({ ...longPost, minterUser: { matureAccount: true } }), true);
  assert.equal(isUnfeaturable({ title: 'late night stream NSFW' }), true);
  assert.equal(isUnfeaturable({ name: 'New 18+ drop' }), true);
  assert.equal(isUnfeaturable({ name: 'Essex sunset' }), false);
  assert.equal(isUnfeaturable(null), true);
});

test('shorts of the week leaves mature shorts out', () => {
  const draft = shortsOfWeek([
    { tokenId: 1, name: 'spicy', contentRating: 'mature', minterDisplayName: 'A' },
    { tokenId: 2, name: 'Skate line', minterDisplayName: 'B' },
  ], at)!;
  assert.equal(draft.link, 'https://dehub.io/post/2');
  assert.doesNotMatch(textFor(draft, 'twitter'), /spicy/);
  assert.equal(shortsOfWeek([{ tokenId: 1, contentRating: 'mature' }], at), null);
});

test('leaderboard keeps hidden balances and empty weeks out', () => {
  const draft = leaderboard(
    [{ account: '0x1', userDisplayName: 'Ana', delta: 5000 }, { account: '0x2', username: 'ghost', delta: 900, hideBadgeAndBalance: true }],
    [{ account: '0x3', username: 'tipper', delta: 0 }],
    at,
  )!;
  const text = textFor(draft, 'twitter');
  assert.match(text, /1\. Ana \(5,000 DHB\)/);
  assert.doesNotMatch(text, /ghost|tipper/);
  assert.equal(leaderboard([], [], at), null);
});

test('dhb update states price, change and volume within X limits', () => {
  const text = textFor(dhbUpdate({ priceUsd: 0.0012345, change24h: 4.21, volume24h: 123456, liquidityUsd: 456000 }, at)!, 'twitter');
  assert.ok(text.length <= 280);
  assert.match(text, /DHB is at \$0\.00123\d \(\+4\.2% in 24h\)\./);
  assert.match(text, /volume \$123K, liquidity \$456K/);
  assert.equal(dhbUpdate({ priceUsd: NaN }, at), null);
});

test('live posts point at the stream or stage', () => {
  assert.equal(liveStream({ _id: 'a', tokenId: 77, title: 't', account: { displayName: 'Kai' } }, at).link, 'https://dehub.io/post/77');
  assert.equal(stage({ id: 'u', short_id: 12, title: 'AMA', status: 'live', listener_count: 80 }, at).link, 'https://dehub.io/stages/12');
});

test('weekly slots open only on their day, from an hour before', () => {
  const monday = new Date('2026-10-19T14:05:00Z');
  assert.equal(slotFor('growth_pulse', monday)?.toISOString(), '2026-10-19T15:00:00.000Z');
  assert.equal(slotFor('growth_pulse', new Date('2026-10-19T13:59:00Z')), null);
  assert.equal(slotFor('growth_pulse', new Date('2026-10-20T15:00:00Z')), null);
  // Past the slot, it goes now rather than waiting a week.
  const late = new Date('2026-10-22T20:00:00Z');
  assert.equal(slotFor('creator_of_day', late)?.getTime(), late.getTime());
  assert.equal(slotFor('live_now', late), null);
  assert.equal(weekKey(new Date('2026-01-01T00:00:00Z')), '2026-W01');
  assert.equal(weekKey(monday), '2026-W43');
});

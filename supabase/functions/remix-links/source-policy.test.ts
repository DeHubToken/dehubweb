import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockedReason } from './source-policy.ts';

const open = { tokenId: 7, postType: 'video', minter: '0xabc', visibility: 'public', contentRating: 'safe' };

test('a public, free, finished video may be reacted to', () => {
  assert.equal(blockedReason(open), null);
  assert.equal(blockedReason({ tokenId: 7, postType: 'video', minter: '0xabc' }), null, 'missing fields mean the defaults');
});

test('paid, locked and subscriber-only videos are refused', () => {
  for (const extra of [
    { is_ppv: true }, { streamInfo: { isPayPerView: true } }, { is_locked: true }, { streamInfo: { isLockContent: true } },
    { price: 5 }, { locked_price: 10 }, { plansDetails: [{ id: 1 }] }, { plans: ['gold'] },
  ]) {
    assert.match(blockedReason({ ...open, ...extra }) ?? '', /Paid and subscriber-only/, JSON.stringify(extra));
  }
});

test('private, hidden, adult, live and non-video posts are refused', () => {
  assert.match(blockedReason({ ...open, visibility: 'followers' }) ?? '', /public/);
  assert.match(blockedReason({ ...open, visibility: 'direct' }) ?? '', /public/);
  assert.ok(blockedReason({ ...open, isHidden: true }));
  assert.ok(blockedReason({ ...open, deleted: true }));
  assert.ok(blockedReason({ ...open, contentRating: 'mature' }));
  assert.ok(blockedReason({ ...open, spoilerText: 'spoilers' }));
  assert.match(blockedReason({ ...open, is_live: true }) ?? '', /Live/);
  assert.match(blockedReason({ ...open, postType: 'feed-images' }) ?? '', /Only videos/);
  assert.equal(blockedReason(null), 'Video not found.');
});

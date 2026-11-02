import { describe, expect, it } from 'vitest';
import { parseDmLock } from '../dm';

describe('parseDmLock', () => {
  it('is null for a message with no lock', () => {
    expect(parseDmLock(undefined, false)).toBeNull();
    expect(parseDmLock({}, false)).toBeNull();
    expect(parseDmLock({ price: 0 }, true)).toBeNull();
  });

  it('reads the lock and treats the sender as unlocked', () => {
    const mine = parseDmLock({ price: 25, kind: 'image', previewUrl: 'dm-images/a-locked.jpg', unlocked: false, ready: true }, true)!;
    expect(mine.unlocked).toBe(true);
    expect(mine.mine).toBe(true);
    const theirs = parseDmLock({ price: '25', kind: 'video', previewUrl: 'dm-images/a-locked.jpg', unlocked: false }, false)!;
    expect(theirs).toMatchObject({ price: 25, kind: 'video', unlocked: false, symbol: 'DHB', ready: true });
    expect(theirs.mediaUrl).toBeUndefined();
  });

  it('is not ready until the preview exists', () => {
    expect(parseDmLock({ price: 5, kind: 'image', previewUrl: null }, true)!.ready).toBe(false);
  });
});

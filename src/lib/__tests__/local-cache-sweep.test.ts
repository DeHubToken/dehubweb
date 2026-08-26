import { describe, it, expect, beforeEach } from 'vitest';
import { sweepLocalCaches } from '@/lib/local-cache-sweep';

/**
 * The point of the sweep is not tidiness. Both of these families write one key
 * per item and never delete any, and the 5 MB origin quota is shared with auth
 * tokens, wallet ciphertext and composer drafts — when it fills, setItem throws
 * into a catch and the NEWEST write is the one silently lost.
 */

const DAY = 24 * 60 * 60 * 1000;

function stamped(t: number, data: unknown = { name: 'x' }) {
  return JSON.stringify({ v: 1, t, data });
}

describe('sweepLocalCaches', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a fresh profile entry', () => {
    localStorage.setItem('dehub-profile-cache:alice', stamped(Date.now()));
    sweepLocalCaches();
    expect(localStorage.getItem('dehub-profile-cache:alice')).not.toBeNull();
  });

  it('drops a profile entry past its week', () => {
    localStorage.setItem('dehub-profile-cache:bob', stamped(Date.now() - 8 * DAY));
    sweepLocalCaches();
    expect(localStorage.getItem('dehub-profile-cache:bob')).toBeNull();
  });

  it('drops legacy unstamped entries — they can never be aged out otherwise', () => {
    localStorage.setItem('dehub-profile-cache:carol', JSON.stringify({ username: 'carol' }));
    localStorage.setItem('dehub-dm-fee-dm:0xabc', JSON.stringify({ required: true, fee: 100 }));
    sweepLocalCaches();
    expect(localStorage.getItem('dehub-profile-cache:carol')).toBeNull();
    expect(localStorage.getItem('dehub-dm-fee-dm:0xabc')).toBeNull();
  });

  it('drops a DM fee past its six hours but keeps a fresh one', () => {
    localStorage.setItem('dehub-dm-fee-dm:0xold', stamped(Date.now() - 7 * 60 * 60 * 1000));
    localStorage.setItem('dehub-dm-fee-dm:0xnew', stamped(Date.now()));
    sweepLocalCaches();
    expect(localStorage.getItem('dehub-dm-fee-dm:0xold')).toBeNull();
    expect(localStorage.getItem('dehub-dm-fee-dm:0xnew')).not.toBeNull();
  });

  it('caps the profile family at 200, newest first', () => {
    const now = Date.now();
    for (let i = 0; i < 260; i++) {
      // i=0 is the oldest, i=259 the newest.
      localStorage.setItem(`dehub-profile-cache:p${i}`, stamped(now - (260 - i) * 1000));
    }
    sweepLocalCaches();
    const left = Object.keys(localStorage).filter((k) => k.startsWith('dehub-profile-cache:'));
    expect(left.length).toBe(200);
    expect(localStorage.getItem('dehub-profile-cache:p259')).not.toBeNull();
    expect(localStorage.getItem('dehub-profile-cache:p0')).toBeNull();
  });

  it('leaves every other key alone', () => {
    localStorage.setItem('dehub_token', 'keep-me');
    localStorage.setItem('dehub-drafts-v1', 'keep-me-too');
    localStorage.setItem('dehub.theme', 'osaka');
    sweepLocalCaches();
    expect(localStorage.getItem('dehub_token')).toBe('keep-me');
    expect(localStorage.getItem('dehub-drafts-v1')).toBe('keep-me-too');
    expect(localStorage.getItem('dehub.theme')).toBe('osaka');
  });

  it('removes every expired key in one pass — the index does not shift under it', () => {
    const old = Date.now() - 30 * DAY;
    for (let i = 0; i < 10; i++) localStorage.setItem(`dehub-profile-cache:q${i}`, stamped(old));
    sweepLocalCaches();
    expect(Object.keys(localStorage).filter((k) => k.startsWith('dehub-profile-cache:')).length).toBe(0);
  });
});

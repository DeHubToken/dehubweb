/**
 * "Am I subscribed to this creator" has to mean *right now*.
 *
 * `isSubscribedToCreator` is what the subscriber gate reads to decide whether
 * to unlock a creator's paid content and show the "Subscribed" badge. It used
 * to answer on `sub.isActive` alone, which is a flag the API sets on purchase
 * and does not clear when the term runs out — so a subscription that expired
 * months ago still opened the gate.
 *
 * The same file already exports `isLiveSubscription` for exactly this, and its
 * docblock spells out the second half of the problem: a purchase that was
 * reserved but never confirmed on chain has no `endDate`, and
 * `new Date(undefined) > Date.now()` is `false` in a way that reads as
 * "not expired" if you write the comparison by hand.
 *
 * These tests pin the behaviour, not the implementation — they call the
 * exported function and assert what it answers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const store: Record<string, string> = {
  dehub_token: 'test-token',
  dehub_token_timestamp: String(Date.now()),
};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => {
    store[key] = val;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
});

const CREATOR = '0xC0FFEE0000000000000000000000000000000001';

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

/** A subscription row shaped the way `/api/subscription/me` returns them. */
function row(overrides: Record<string, unknown>) {
  return {
    _id: 'sub-1',
    planId: 'plan-1',
    subscriberAddress: '0xdead',
    creatorAddress: CREATOR.toLowerCase(),
    startDate: iso(-30 * DAY),
    endDate: iso(30 * DAY),
    isActive: true,
    ...overrides,
  };
}

function mockSubscriptions(rows: unknown[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ subscription: rows }),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('isSubscribedToCreator', () => {
  it('is true for a term that has not run out yet', async () => {
    const { isSubscribedToCreator } = await import('../subscriptions');
    mockSubscriptions([row({})]);
    await expect(isSubscribedToCreator(CREATOR)).resolves.toBe(true);
  });

  it('is false once the term has run out, even while isActive is still set', async () => {
    const { isSubscribedToCreator } = await import('../subscriptions');
    mockSubscriptions([row({ endDate: iso(-DAY), isActive: true })]);
    await expect(isSubscribedToCreator(CREATOR)).resolves.toBe(false);
  });

  it('is false for a reserved purchase that never got an end date', async () => {
    const { isSubscribedToCreator } = await import('../subscriptions');
    mockSubscriptions([row({ endDate: undefined, isActive: true })]);
    await expect(isSubscribedToCreator(CREATOR)).resolves.toBe(false);
  });

  it('is false when the end date is unparseable', async () => {
    const { isSubscribedToCreator } = await import('../subscriptions');
    mockSubscriptions([row({ endDate: 'whenever', isActive: true })]);
    await expect(isSubscribedToCreator(CREATOR)).resolves.toBe(false);
  });

  it('is true for a lifetime plan with no end date', async () => {
    const { isSubscribedToCreator } = await import('../subscriptions');
    mockSubscriptions([row({ endDate: undefined, isLifetime: true })]);
    await expect(isSubscribedToCreator(CREATOR)).resolves.toBe(true);
  });

  it('matches the creator case-insensitively', async () => {
    const { isSubscribedToCreator } = await import('../subscriptions');
    mockSubscriptions([row({ creatorAddress: CREATOR.toUpperCase() })]);
    await expect(isSubscribedToCreator(CREATOR)).resolves.toBe(true);
  });

  it('does not unlock one creator because another is subscribed', async () => {
    const { isSubscribedToCreator } = await import('../subscriptions');
    mockSubscriptions([row({ creatorAddress: '0xsomeoneelse' })]);
    await expect(isSubscribedToCreator(CREATOR)).resolves.toBe(false);
  });

  it('stays locked when the call fails', async () => {
    const { isSubscribedToCreator } = await import('../subscriptions');
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(isSubscribedToCreator(CREATOR)).resolves.toBe(false);
  });
});

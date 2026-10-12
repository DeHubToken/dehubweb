import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCheckoutSession } from './dpay';

vi.mock('./dehub', () => ({ getAuthToken: vi.fn(() => 'test-token') }));

afterEach(() => vi.unstubAllGlobals());

describe('card checkout', () => {
  it.each([false, true])('blocks embedded=%s before sending a payment request', async (embedded) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(createCheckoutSession({
      amount: 50,
      tokenSymbol: 'DHB',
      walletAddress: '0x123',
      tokensToReceive: 50_000,
      embedded,
    })).rejects.toThrow('Stripe has blocked this payment');

    expect(fetch).not.toHaveBeenCalled();
  });
});

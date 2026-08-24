/**
 * The delegation endpoints, and the two ways a URL here can be wrong.
 *
 * `apiCall` resolves against the bare origin, so every path needs the `/api`
 * prefix — a path copied from mobile's axios client (which sets a base URL
 * ending in `/api`) 404s on every call and surfaces as a generic "failed to
 * load". And an address or username goes into the path segment on revoke, so
 * it has to be encoded.
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

function mockOk(data: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(data) });
}

function mockFail(status: number, body: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: false, status, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('badges.ts', () => {
  it('fetchMyDelegations calls GET /api/badge/delegations with the token', async () => {
    const { fetchMyDelegations } = await import('../badges');
    const summary = {
      address: '0xabc',
      ownBadgeBalance: 5_000_000,
      ownTier: 'Killer Whale',
      effectiveTier: 'Killer Whale',
      slots: 10,
      slotsUsed: 2,
      grantableTier: 'Tiger Shark',
      granted: [],
      received: null,
    };
    mockOk({ result: summary });

    await expect(fetchMyDelegations()).resolves.toEqual(summary);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/badge/delegations');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
  });

  it('grantDelegation posts the recipient and unwraps the result', async () => {
    const { grantDelegation } = await import('../badges');
    mockOk({ result: { tier: 'Tiger Shark', slotsRemaining: 7 } });

    await expect(grantDelegation('someone')).resolves.toEqual({
      tier: 'Tiger Shark',
      slotsRemaining: 7,
    });
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ to: 'someone' });
  });

  it('surfaces the server’s own refusal wording rather than a status code', async () => {
    const { grantDelegation } = await import('../badges');
    mockFail(409, { error: 'No free delegation slots', reason: 'no_free_slots' });

    await expect(grantDelegation('someone')).rejects.toThrow('No free delegation slots');
  });

  it('revokeDelegation encodes the counterparty into the path', async () => {
    const { revokeDelegation } = await import('../badges');
    mockOk({ result: { ended: true } });

    await revokeDelegation('some one');
    expect(mockFetch.mock.calls[0][0]).toContain('/api/badge/delegations/some%20one');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('fetchBadgePatron returns null for an account wearing its own badge', async () => {
    const { fetchBadgePatron } = await import('../badges');
    mockOk({ result: null });

    await expect(fetchBadgePatron('someone')).resolves.toBeNull();
  });

  it('fetchBadgePatron unwraps a patron when there is one', async () => {
    const { fetchBadgePatron } = await import('../badges');
    const patron = {
      tier: 'Blue Whale',
      since: '2026-08-24T00:00:00.000Z',
      grantor: { address: '0xdef', username: 'maldoteth' },
    };
    mockOk({ result: patron });

    await expect(fetchBadgePatron('someone')).resolves.toEqual(patron);
  });
});

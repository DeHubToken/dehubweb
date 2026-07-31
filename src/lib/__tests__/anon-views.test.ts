import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseDisplayViewCount } from '@/hooks/use-anon-view-counts';
import { recordAnonViews, fetchAnonViewCounts } from '@/lib/anon-views-api';

describe('parseDisplayViewCount', () => {
  it('parses plain counts', () => {
    expect(parseDisplayViewCount('0 views')).toBe(0);
    expect(parseDisplayViewCount('7')).toBe(7);
    expect(parseDisplayViewCount('342 views')).toBe(342);
  });

  it('expands K/M/B suffixes back to numbers', () => {
    expect(parseDisplayViewCount('1.2K views')).toBe(1200);
    expect(parseDisplayViewCount('3.5M views')).toBe(3_500_000);
    expect(parseDisplayViewCount('2B')).toBe(2_000_000_000);
  });

  it('handles thousands separators and lowercase suffixes', () => {
    expect(parseDisplayViewCount('1,234 views')).toBe(1234);
    expect(parseDisplayViewCount('1.5k views')).toBe(1500);
  });

  it('passes numbers straight through', () => {
    expect(parseDisplayViewCount(4096)).toBe(4096);
  });

  it('returns null for values it cannot read, so callers keep the original', () => {
    expect(parseDisplayViewCount(undefined)).toBeNull();
    expect(parseDisplayViewCount('')).toBeNull();
    expect(parseDisplayViewCount('no views yet')).toBeNull();
    expect(parseDisplayViewCount(NaN)).toBeNull();
  });
});

describe('anon views API', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends token ids and a device id when recording', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, recorded: 2, submitted: 2 }),
    });

    const result = await recordAnonViews(['12', '34']);

    expect(result).toEqual({ success: true, recorded: 2, submitted: 2 });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.tokenIds).toEqual(['12', '34']);
    expect(body.deviceId).toBeTruthy();
  });

  it('reuses the same device id across calls', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, recorded: 1, submitted: 1 }) });

    await recordAnonViews(['1']);
    await recordAnonViews(['2']);

    const first = JSON.parse(fetchMock.mock.calls[0][1].body).deviceId;
    const second = JSON.parse(fetchMock.mock.calls[1][1].body).deviceId;
    expect(second).toBe(first);
  });

  it('makes no request for an empty batch', async () => {
    expect(await recordAnonViews([])).toBeNull();
    expect(await fetchAnonViewCounts([])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null rather than throwing when recording fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(await recordAnonViews(['1'])).toBeNull();

    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await recordAnonViews(['1'])).toBeNull();
  });

  it('returns the counts map, and an empty map on failure', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, counts: { '12': 5 } }),
    });
    expect(await fetchAnonViewCounts(['12', '34'])).toEqual({ '12': 5 });

    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await fetchAnonViewCounts(['12'])).toEqual({});
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recordAnonViews } from '@/lib/anon-views-api';
import { resolveViewCount } from '@/lib/engagement';

describe('resolveViewCount', () => {
  it('prefers totalViews, which counts everyone', () => {
    expect(resolveViewCount({ totalViews: 1200, views: 900 })).toBe(1200);
  });

  it('falls back to views when a response predates totalViews', () => {
    // Undercounts by the signed-out half, which is what shipped before —
    // better than rendering nothing off a cached or older payload.
    expect(resolveViewCount({ views: 900 })).toBe(900);
    expect(resolveViewCount({ view_count: 42 })).toBe(42);
  });

  it('treats a zero total as a real answer, not a missing one', () => {
    expect(resolveViewCount({ totalViews: 0, views: 900 })).toBe(0);
  });

  it('returns 0 for anything unusable', () => {
    expect(resolveViewCount(null)).toBe(0);
    expect(resolveViewCount(undefined)).toBe(0);
    expect(resolveViewCount({})).toBe(0);
    expect(resolveViewCount({ totalViews: NaN })).toBe(0);
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null rather than throwing when recording fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(await recordAnonViews(['1'])).toBeNull();

    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await recordAnonViews(['1'])).toBeNull();
  });
});

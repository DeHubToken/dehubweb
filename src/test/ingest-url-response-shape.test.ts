import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The encoder screen's Server field was empty for every self-hosted stream.
 *
 * `GET /api/live/{id}/ingesturl` answers `{ ingestUrl }` with no `{ result }`
 * envelope — verified against production on 2026-09-15, where the 131-byte
 * body was exactly that object. The client read `res.result.ingestUrl`, got
 * undefined, and a mediamtx stream has no hardcoded fallback to hide behind,
 * so the creator was handed a key and a blank server. The same applies to
 * `/key`. Both helpers now accept either shape and always return the typed
 * envelope their callers were written against.
 */

const mocks = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock('@/lib/api/dehub/core', () => ({ apiCall: mocks.apiCall, authedUpload: vi.fn() }));

import { getStreamIngestUrl, getStreamKey } from '@/lib/api/dehub/livestream';

const KEY = '0168e7fa02d484a36e7de7ded2ea96cb8aa6c1f5688546d3';
const URL = `rtmp://live.dehub.io/ba0ca5a1c22a8f4a98d8b4fe-rtmp?user=dehub&pass=${KEY}`;

beforeEach(() => {
  mocks.apiCall.mockReset();
});

describe('getStreamIngestUrl', () => {
  it('reads the bare { ingestUrl } body the API actually sends', async () => {
    mocks.apiCall.mockResolvedValue({ ingestUrl: URL });
    await expect(getStreamIngestUrl('6aa9ca2c')).resolves.toEqual({ result: { ingestUrl: URL } });
    expect(mocks.apiCall).toHaveBeenCalledWith(
      '/api/live/6aa9ca2c/ingesturl',
      expect.objectContaining({ requiresAuth: true })
    );
  });

  it('still accepts an enveloped body', async () => {
    mocks.apiCall.mockResolvedValue({ result: { ingestUrl: URL } });
    await expect(getStreamIngestUrl('6aa9ca2c')).resolves.toEqual({ result: { ingestUrl: URL } });
  });

  it('answers an empty string rather than undefined when neither shape carries a URL', async () => {
    mocks.apiCall.mockResolvedValue({});
    await expect(getStreamIngestUrl('6aa9ca2c')).resolves.toEqual({ result: { ingestUrl: '' } });
    mocks.apiCall.mockResolvedValue(null);
    await expect(getStreamIngestUrl('6aa9ca2c')).resolves.toEqual({ result: { ingestUrl: '' } });
  });
});

describe('getStreamKey', () => {
  it('reads the bare { streamKey } body', async () => {
    mocks.apiCall.mockResolvedValue({ streamKey: KEY });
    await expect(getStreamKey('6aa9ca2c')).resolves.toEqual({
      result: { streamKey: KEY, ingestUrl: '' },
    });
  });

  it('still accepts an enveloped body', async () => {
    mocks.apiCall.mockResolvedValue({ result: { streamKey: KEY, ingestUrl: URL } });
    await expect(getStreamKey('6aa9ca2c')).resolves.toEqual({
      result: { streamKey: KEY, ingestUrl: URL },
    });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestSession } from '../session-request';
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

describe('session request recovery', () => {
  it('reuses the proof once through the relay without asking for another signature', async () => {
    const response = new Response('{}', { status: 201 });
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(response);
    vi.stubGlobal('fetch', fetchMock);
    const init = { method: 'POST', body: JSON.stringify({ sig: 'proof', timestamp: 123 }) };
    await expect(requestSession('/api/web/auth', init)).resolves.toBe(response);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.dehub.io/api/web/auth');
    expect(fetchMock.mock.calls[1][0]).toBe('https://dehub.io/_api/api/web/auth');
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  });
  it('returns HTTP refusals directly and stops after two transport failures', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await requestSession('/api/web/auth', { method: 'POST' })).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockReset().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(requestSession('/api/web/auth', { method: 'POST' })).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

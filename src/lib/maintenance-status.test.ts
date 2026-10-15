import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseMaintenanceStatus, readMaintenanceStatus } from './maintenance-status';

afterEach(() => vi.unstubAllGlobals());

describe('maintenance status', () => {
  it('requires an explicit boolean, never a truthy string or error body', () => {
    expect(parseMaintenanceStatus({ enabled: true })).toEqual({ enabled: true });
    expect(parseMaintenanceStatus({ enabled: false })).toEqual({ enabled: false });
    for (const value of [null, {}, { enabled: 'false' }, { error: 'unavailable' }]) expect(parseMaintenanceStatus(value)).toBeNull();
  });
  it('distinguishes a confirmed reopening from an unavailable status endpoint', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"enabled":false}', { status: 200 }))
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    expect(await readMaintenanceStatus()).toEqual({ enabled: false });
    expect(await readMaintenanceStatus()).toBeNull();
    expect(await readMaintenanceStatus()).toBeNull();
    expect(fetch).toHaveBeenCalledWith('https://dehub.io/maintenance.json', expect.objectContaining({ cache: 'no-store', credentials: 'omit' }));
  });
});

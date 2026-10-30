import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiCall } from '@/lib/api/dehub/core';
import { getLiveStream, getStreamActivities } from '@/lib/api/dehub/livestream';

vi.mock('@/lib/api/dehub/core', () => ({ apiCall: vi.fn(), authedUpload: vi.fn() }));

describe('live read requests', () => {
  beforeEach(() => vi.clearAllMocks());
  it('rejects placeholders before requesting details or activities', async () => {
    await expect(getLiveStream('gallery-live-stream')).rejects.toThrow('Invalid stream id');
    await expect(getStreamActivities('gallery-live-stream')).rejects.toThrow('Invalid stream id');
    expect(apiCall).not.toHaveBeenCalled();
  });
  it('preserves real stream requests and activity pagination', async () => {
    const id = '507f1f77bcf86cd799439011';
    vi.mocked(apiCall).mockResolvedValueOnce({ result: { title: 'Live' } }).mockResolvedValueOnce([]);
    await expect(getLiveStream(id)).resolves.toEqual({ result: { title: 'Live' } });
    await expect(getStreamActivities(id, { page: 2, unit: 50 })).resolves.toEqual({ result: [] });
    expect(apiCall).toHaveBeenCalledWith(`/api/live/${id}`);
    expect(apiCall).toHaveBeenCalledWith(`/api/live/${id}/activities`, { params: { limit: 50, skip: 50, order: 'desc' } });
  });
});

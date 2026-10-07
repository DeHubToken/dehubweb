import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiCall } from '../core';
import { getUserScheduledStreams } from '../livestream';

vi.mock('../core', () => ({ apiCall: vi.fn(), authedUpload: vi.fn() }));

describe('scheduled stream discovery', () => {
  beforeEach(() => vi.mocked(apiCall).mockReset());

  it.each([false, true])('normalizes broadcast identifiers and dates (envelope=%s)', async envelope => {
    const rows = [{ _id: 'room-1', tokenId: 42, title: 'Next show', status: 'SCHEDULED', scheduledFor: '2026-10-14T16:00:00.000Z' }];
    vi.mocked(apiCall).mockResolvedValue(envelope ? { result: rows } : rows);
    const result = await getUserScheduledStreams('0xabc');
    expect(result.result[0]).toMatchObject({ streamId: 'room-1', tokenId: 42, scheduledAt: rows[0].scheduledFor });
    expect(apiCall).toHaveBeenCalledWith('/api/live/user/0xabc/scheduled', { params: { futureOnly: 'false' }, requiresAuth: true });
  });

  it('retains overdue scheduled streams so their host can still start them', async () => {
    vi.mocked(apiCall).mockResolvedValue([{ streamId: 'room-old', status: 'scheduled', scheduledAt: '2020-01-01T12:00:00.000Z' }]);
    expect((await getUserScheduledStreams('0xabc')).result[0].streamId).toBe('room-old');
  });
});

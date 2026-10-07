import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintPost, type MintPostParams } from '../content';
import { authedUpload } from '../core';

vi.mock('../core', () => ({ apiCall: vi.fn(), authedUpload: vi.fn() }));

const base: MintPostParams = {
  name: 'Scheduled broadcast', description: 'Next week', postType: 'live',
  chainId: 56, category: ['General'], minterAddress: '0xabc', mintOptOut: true,
};
const when = '2026-10-14T16:00:00.000Z';

describe('mint scheduling transport', () => {
  beforeEach(() => {
    vi.mocked(authedUpload).mockReset();
    vi.mocked(authedUpload).mockResolvedValue({ createdTokenId: '42', stream: { _id: 'stream-42' } });
  });

  it('sends a broadcast start time without deferring publication of its post', async () => {
    const result = await mintPost({ ...base, scheduledFor: when });
    const body = vi.mocked(authedUpload).mock.calls[0][1] as FormData;
    expect(body.get('postType')).toBe('live');
    expect(body.get('scheduledFor')).toBe(when);
    expect(body.has('scheduledAt')).toBe(false);
    expect(result.stream?._id).toBe('stream-42');
  });

  it('keeps ordinary post publication on its existing schedule field', async () => {
    await mintPost({ ...base, postType: 'feed-simple', scheduledAt: when });
    const body = vi.mocked(authedUpload).mock.calls[0][1] as FormData;
    expect(body.get('scheduledAt')).toBe(when);
    expect(body.has('scheduledFor')).toBe(false);
  });

  it('leaves immediate broadcasts unscheduled', async () => {
    await mintPost(base);
    const body = vi.mocked(authedUpload).mock.calls[0][1] as FormData;
    expect(body.has('scheduledAt')).toBe(false);
    expect(body.has('scheduledFor')).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../core', () => ({ apiCall: vi.fn() }));

import { apiCall } from '../core';
import { addGifComment } from '../comments';
import { replyIdOf } from '@/lib/reply-delivery';

describe('GIF reply delivery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the accepted comment ID so the new row can be replied to immediately', async () => {
    vi.mocked(apiCall).mockResolvedValue({ result: true, commentId: 2229 });
    const result = await addGifComment({ tokenId: 6014, gifUrl: 'https://media.giphy.com/reply.gif', parentId: '2228' });

    expect(replyIdOf(result)).toBe(2229);
    expect(apiCall).toHaveBeenCalledWith('/api/comment_gif', expect.objectContaining({
      requiresAuth: true,
      body: expect.objectContaining({ streamTokenId: 6014, commentId: '2228' }),
    }));
  });

  it('rejects a refused GIF instead of marking it posted', async () => {
    vi.mocked(apiCall).mockResolvedValue({ result: false, error: 'Cannot reply to a hidden or deleted comment' });
    await expect(addGifComment({ tokenId: 6014, gifUrl: 'https://media.giphy.com/reply.gif', parentId: '2228' }))
      .rejects.toThrow('Cannot reply to a hidden or deleted comment');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { authedUpload } from '@/lib/api/dehub/core';
import { resolveDraftImages, startDraftImage } from '../draftImages';

vi.mock('@/lib/api/dehub/core', () => ({
  authedUpload: vi.fn(),
  UploadHttpError: class extends Error {},
}));

const photo = (name: string) => new File([name], name, { type: 'image/jpeg' });

describe('composer photos uploaded early', () => {
  it('sends ids for uploaded photos and files for the rest, in order', async () => {
    const [a, b, c] = [photo('a'), photo('b'), photo('c')];
    vi.mocked(authedUpload)
      .mockResolvedValueOnce({ draftImageId: 'id-a' })
      .mockRejectedValueOnce(new Error('offline'));
    startDraftImage(a);
    startDraftImage(c);
    const early = await resolveDraftImages([a, b, c]);
    expect(early).toEqual({ ids: ['id-a', null, null], send: [b, c] });
  });

  it('returns null when nothing went up early', async () => {
    expect(await resolveDraftImages([photo('x')])).toBeNull();
  });
});

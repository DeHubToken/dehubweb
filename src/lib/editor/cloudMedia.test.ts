import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const storage = { uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }) };
  const invoke = vi.fn(async (_fn: string, { body }: { body: Record<string, any>; headers?: Record<string, string> }): Promise<{ data: any; error: any }> => {
    switch (body.action) {
      case 'prepare':
        return { data: {
          original: { path: `0xabc/${body.id}/original.${body.ext}`, token: 't1' },
          thumb: body.thumbnail ? { path: `0xabc/${body.id}/thumb.jpg`, token: 't2' } : null,
        }, error: null };
      case 'commit': return { data: { asset: { id: body.row.id } }, error: null };
      case 'sign': return { data: { urls: Object.fromEntries(body.paths.map((p: string) => [p, `https://signed/${p}`])), ttl: 3600 }, error: null };
      default: return { data: { ok: true }, error: null };
    }
  });
  return { storage, invoke };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke }, storage: { from: () => mocks.storage } },
}));
vi.mock('@/lib/api/dehub/core', () => ({ ensureFreshToken: vi.fn().mockResolvedValue('token') }));

import { deleteEditorAsset, getSignedAssetUrl, uploadEditorAsset } from './cloudMedia';

const actions = () => mocks.invoke.mock.calls.map(([, { body }]) => body.action);

beforeEach(() => vi.clearAllMocks());

describe('editor storage goes through the verified edge function', () => {
  it('uploads media and its thumbnail to server-issued slots, then commits the row', async () => {
    await uploadEditorAsset({
      wallet: '0xABC', id: 'asset1', name: 'clip', kind: 'audio',
      blob: new Blob(['audio']), mimeType: 'audio/mpeg', thumbnail: new Blob(['thumb']),
    });
    expect(mocks.storage.uploadToSignedUrl.mock.calls.map(([path]) => path)).toEqual([
      '0xabc/asset1/original.mp3', '0xabc/asset1/thumb.jpg',
    ]);
    expect(actions()).toEqual(['prepare', 'commit']);
    const [, { headers }] = mocks.invoke.mock.calls[0];
    expect(headers?.['x-dehub-token']).toBe('token');
  });

  it('caches signed reads per wallet', async () => {
    await getSignedAssetUrl('wallet-a', 'wallet-a/x/original.mp3');
    await getSignedAssetUrl('wallet-a', 'wallet-a/x/original.mp3');
    await getSignedAssetUrl('wallet-b', 'wallet-a/x/original.mp3');
    expect(actions()).toEqual(['sign', 'sign']);
  });

  it('discards the uploaded file when the row cannot be committed', async () => {
    mocks.invoke.mockImplementationOnce(async (_f, { body }) => ({
      data: { original: { path: `0xabc/${body.id}/original.mp3`, token: 't' }, thumb: null }, error: null,
    }));
    mocks.invoke.mockImplementationOnce(async () => ({ data: { error: 'metadata rejected' }, error: null }));
    await expect(uploadEditorAsset({ wallet: '0xabc', id: 'failed', name: 'clip', kind: 'audio',
      blob: new Blob(['audio']), mimeType: 'audio/mpeg' })).rejects.toThrow('metadata rejected');
    const discard = mocks.invoke.mock.calls.find(([, { body }]) => body.action === 'discard');
    expect(discard?.[1].body.paths).toEqual(['0xabc/failed/original.mp3']);
  });

  it('removes by id and lets the server find the files', async () => {
    await deleteEditorAsset('owner', { id: 'asset1', storage_path: 'original', thumbnail_path: 'thumb' });
    expect(mocks.invoke.mock.calls[0][1].body).toEqual({ action: 'remove', id: 'asset1' });
  });
});

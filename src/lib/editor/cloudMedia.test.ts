import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const storage = {
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.com/audio' }, error: null }),
  };
  const query: Record<string, any> = {};
  for (const method of ['insert', 'select', 'single', 'delete', 'eq']) query[method] = vi.fn(() => query);
  return {
    storage,
    query,
    walletScopedClient: vi.fn(() => ({ storage: { from: vi.fn(() => storage) } })),
    withWalletHeader: vi.fn().mockResolvedValue({ data: { id: 'asset' }, error: null }),
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => mocks.query } }));
vi.mock('@/lib/supabase-wallet-client', () => ({
  walletScopedClient: mocks.walletScopedClient,
  withWalletHeader: mocks.withWalletHeader,
}));

import { deleteEditorAsset, getSignedAssetUrl, uploadEditorAsset } from './cloudMedia';

beforeEach(() => vi.clearAllMocks());

describe('editor storage wallet scope', () => {
  it('uploads media and its thumbnail through the wallet-scoped storage client', async () => {
    await uploadEditorAsset({
      wallet: '0xABC', id: 'asset', name: 'clip', kind: 'audio',
      blob: new Blob(['audio']), mimeType: 'audio/mpeg', thumbnail: new Blob(['thumb']),
    });
    expect(mocks.walletScopedClient).toHaveBeenCalledWith('0xabc');
    expect(mocks.storage.upload.mock.calls.map(([path]) => path)).toEqual([
      '0xabc/asset/original.mp3', '0xabc/asset/thumb.jpg',
    ]);
  });

  it('scopes signed reads and their cache to the requesting wallet', async () => {
    await getSignedAssetUrl('wallet-a', 'asset/original.mp3');
    await getSignedAssetUrl('wallet-a', 'asset/original.mp3');
    await getSignedAssetUrl('wallet-b', 'asset/original.mp3');
    expect(mocks.walletScopedClient.mock.calls).toEqual([['wallet-a'], ['wallet-b']]);
    expect(mocks.storage.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('uses the same scoped storage for cleanup when the metadata write fails', async () => {
    mocks.withWalletHeader.mockResolvedValueOnce({ data: null, error: new Error('metadata rejected') });
    await expect(uploadEditorAsset({ wallet: 'owner', id: 'failed', name: 'clip', kind: 'audio',
      blob: new Blob(['audio']), mimeType: 'audio/mpeg' })).rejects.toThrow('metadata rejected');
    expect(mocks.storage.remove).toHaveBeenCalledWith(['owner/failed/original.mp3']);
  });

  it('scopes removal of both the original and thumbnail', async () => {
    await deleteEditorAsset('owner', { id: 'asset', storage_path: 'original', thumbnail_path: 'thumb' });
    expect(mocks.walletScopedClient).toHaveBeenCalledWith('owner');
    expect(mocks.storage.remove).toHaveBeenCalledWith(['original', 'thumb']);
  });
});

import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), token: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/api/dehub/core', () => ({ ensureFreshToken: mocks.token }));
import { assetNodePatch, loadFlowAssets } from './assets';
beforeEach(() => { vi.resetAllMocks(); mocks.token.mockResolvedValue('fresh-owner-token'); });
it('renews an owned private URL and removes stale media fields', async () => {
  mocks.invoke.mockResolvedValue({ data: { jobs: [{ id: 'owned', kind: 'video', url: 'https://private.test/fresh' }], nextOffset: null }, error: null });
  const assets = await loadFlowAssets('owner', ['owned']);
  expect(mocks.invoke).toHaveBeenCalledWith('creator-library', { headers: { 'x-dehub-token': 'fresh-owner-token', 'x-wallet-address': 'owner' }, body: { action: 'list', offset: 0, includeHidden: true } });
  const patch = assetNodePatch({ id: 'input', type: 'videoInputNode', data: { videoUrl: 'expired', imageUrl: 'stale' } }, assets.get('owned')!);
  expect(patch.videoUrl).toBe('https://private.test/fresh'); expect(patch.imageUrl).toBeUndefined(); expect(patch.capturedFrameUrl).toBeUndefined();
});
it('refuses wrong-kind or missing media instead of preserving stale URLs', async () => {
  const node = { id: 'input', type: 'videoInputNode', data: { videoUrl: 'expired' } };
  expect(() => assetNodePatch(node, { id: 'owned', kind: 'image', url: 'image' })).toThrow('creatorFlow.missingSavedMedia');
  expect(() => assetNodePatch(node, { id: 'owned', kind: 'video' })).toThrow('creatorFlow.missingSavedMedia');
  mocks.invoke.mockResolvedValue({ data: { jobs: [], nextOffset: null }, error: null });
  expect((await loadFlowAssets('owner', ['deleted'])).has('deleted')).toBe(false);
});
it('renews auth for each page and returns only requested owned assets', async () => {
  mocks.token.mockResolvedValueOnce('first-token').mockResolvedValueOnce('renewed-token');
  mocks.invoke.mockResolvedValueOnce({ data: { jobs: [{ id: 'unrequested', kind: 'audio', url: 'private' }], nextOffset: 20 }, error: null })
    .mockResolvedValueOnce({ data: { jobs: [{ id: 'owned', kind: 'audio', url: 'fresh' }], nextOffset: 40 }, error: null });
  const assets = await loadFlowAssets('owner', ['owned', 'owned']);
  expect([...assets.keys()]).toEqual(['owned']);
  expect(mocks.invoke).toHaveBeenCalledTimes(2);
  expect(mocks.invoke).toHaveBeenLastCalledWith('creator-library', { headers: { 'x-dehub-token': 'renewed-token', 'x-wallet-address': 'owner' }, body: { action: 'list', offset: 20, includeHidden: true } });
});
it('stops malformed pagination instead of repeatedly reading private media', async () => {
  mocks.invoke.mockResolvedValue({ data: { jobs: [], nextOffset: 0 }, error: null });
  expect((await loadFlowAssets('owner', ['missing'])).size).toBe(0);
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
it('propagates authentication and library failures without falling back to stale media', async () => {
  mocks.token.mockRejectedValueOnce(new Error('Session expired'));
  await expect(loadFlowAssets('owner', ['owned'])).rejects.toThrow('Session expired');
  expect(mocks.invoke).not.toHaveBeenCalled();
  mocks.invoke.mockResolvedValue({ data: { error: 'Not your asset' }, error: null });
  await expect(loadFlowAssets('owner', ['owned'])).rejects.toThrow('Not your asset');
});
it('restores transcript-only output as text and rejects it as an audio input', () => {
  const transcript = { id: 'owned', kind: 'audio', transcript: 'A bell is ringing.' };
  expect(assetNodePatch({ id: 'text', type: 'audioGenNode', data: { audioTask: 'transcribe', audioUrl: 'expired' } }, transcript)).toMatchObject({ outputText: 'A bell is ringing.', audioUrl: undefined });
  expect(() => assetNodePatch({ id: 'audio', type: 'audioInputNode', data: {} }, transcript)).toThrow('creatorFlow.missingSavedMedia');
});

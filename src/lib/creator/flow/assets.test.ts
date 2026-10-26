import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ page: vi.fn() }));
vi.mock('@/lib/creator/cloudLibrary', () => ({ loadCloudGenerationPage: mocks.page }));
import { assetNodePatch, loadFlowAssets } from './assets';
beforeEach(() => vi.clearAllMocks());
it('renews an owned private URL and removes stale media fields', async () => {
  mocks.page.mockResolvedValue({ jobs: [{ id: 'owned', kind: 'video', url: 'https://private.test/fresh' }], nextOffset: null });
  const assets = await loadFlowAssets('owner', ['owned']);
  const patch = assetNodePatch({ id: 'input', type: 'videoInputNode', data: { videoUrl: 'expired', imageUrl: 'stale' } }, assets.get('owned')!);
  expect(patch.videoUrl).toBe('https://private.test/fresh'); expect(patch.imageUrl).toBeUndefined(); expect(patch.capturedFrameUrl).toBeUndefined();
});
it('refuses wrong-kind or missing media instead of preserving stale URLs', async () => {
  const node = { id: 'input', type: 'videoInputNode', data: { videoUrl: 'expired' } };
  expect(() => assetNodePatch(node, { id: 'owned', kind: 'image', url: 'image' })).toThrow('creatorFlow.missingSavedMedia');
  expect(() => assetNodePatch(node, { id: 'owned', kind: 'video' })).toThrow('creatorFlow.missingSavedMedia');
  mocks.page.mockResolvedValue({ jobs: [], nextOffset: null });
  expect((await loadFlowAssets('owner', ['deleted'])).has('deleted')).toBe(false);
});
it('restores transcript-only output as text and rejects it as an audio input', () => {
  const transcript = { id: 'owned', kind: 'audio', transcript: 'A bell is ringing.' };
  expect(assetNodePatch({ id: 'text', type: 'audioGenNode', data: { audioTask: 'transcribe', audioUrl: 'expired' } }, transcript)).toMatchObject({ outputText: 'A bell is ringing.', audioUrl: undefined });
  expect(() => assetNodePatch({ id: 'audio', type: 'audioInputNode', data: {} }, transcript)).toThrow('creatorFlow.missingSavedMedia');
});

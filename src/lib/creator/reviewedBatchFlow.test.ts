import { beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
const mocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), upload: vi.fn(), media: vi.fn(), owned: vi.fn(), scope: vi.fn(), merge: vi.fn(), switch: vi.fn(), id: 0 }));
vi.mock('./cloudLibrary', () => ({ saveCloudGeneration: mocks.upload }));
vi.mock('../editor/mediaStore', () => ({ getMedia: mocks.media }));
vi.mock('./flow/assets', () => ({ loadFlowAssets: mocks.owned }));
vi.mock('./flow/types', () => ({ uid: () => `newbatch${mocks.id++}` }));
vi.mock('./flow/api', () => ({ listFlows: mocks.list, saveFlows: mocks.save, remoteToFlow: (row: unknown) => row }));
vi.mock('@/store/creatorFlowStore', () => ({ useCreatorFlowStore: { getState: () => ({ setScope: mocks.scope, loadFlowsFromDB: mocks.merge, switchFlow: mocks.switch }) } }));
import { openReviewedBatch, prepareReviewedBatch } from './reviewedBatchFlow';
import { batchSnapshot, makeReviewedBatch } from './reviewedBatch';
const batch = () => makeReviewedBatch('campaign', 'campaign', 'Launch', 'owner', [{ id: 'variant', label: 'Variant', draft: { kind: 'image', prompt: 'Tea', owner: 'owner' }, references: [] }]);
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); localStorage.setItem('dehub_wallet', 'owner');
  vi.stubGlobal('crypto', webcrypto); mocks.id = 0;
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:immutable-copy') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  mocks.owned.mockResolvedValue(new Map());
  mocks.list.mockResolvedValue({ flows: [] }); mocks.save.mockResolvedValue({ ok: true });
});
const referenced = (prompt = 'Tea', url = 'https://private.test/expired') => makeReviewedBatch('film', 'project', 'Film', 'owner', [{ id: 'shot', label: 'Shot',
  draft: { kind: 'image', prompt, owner: 'owner', references: [{ url, label: 'Reference' }] }, references: [{ sourceId: 'media', url, label: 'Reference' }] }]);
const media = (content: string) => ({ blob: { size: content.length, type: 'image/png', arrayBuffer: async () => new TextEncoder().encode(content).buffer } });
it('binds the actual reference bytes so replacing content under the same media ID creates a new batch and private copy', async () => {
  mocks.media.mockResolvedValue(media('original'));
  const first = await prepareReviewedBatch(referenced(), () => true);
  const firstAsset = mocks.upload.mock.calls[0][1].id;
  mocks.list.mockResolvedValue({ flows: [first] }); mocks.media.mockResolvedValue(media('replacement'));
  const second = await prepareReviewedBatch(referenced(), () => true);
  expect(second.id).not.toBe(first.id);
  expect(mocks.upload.mock.calls[1][1].id).not.toBe(firstAsset);
  expect(mocks.save.mock.calls[1][0][0].id).toBe(second.id);
  expect(first.data.nodes![1].data.batchSource).not.toEqual(second.data.nodes![1].data.batchSource);
});
it('treats a renewed signed URL as the same content and reuses its existing Flow', async () => {
  mocks.media.mockResolvedValue(media('same bytes'));
  const first = await prepareReviewedBatch(referenced(), () => true);
  mocks.list.mockResolvedValue({ flows: [first] }); mocks.upload.mockClear(); mocks.save.mockClear();
  expect(await prepareReviewedBatch(referenced('Tea', 'https://private.test/renewed'), () => true)).toBe(first);
  expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it('uses a verified owned copy for a prompt-only revision even when the original playback URL expired', async () => {
  mocks.media.mockResolvedValue(media('same bytes'));
  const first = await prepareReviewedBatch(referenced(), () => true);
  const assetId = mocks.upload.mock.calls[0][1].id;
  mocks.list.mockResolvedValue({ flows: [first] }); mocks.upload.mockClear();
  mocks.owned.mockResolvedValue(new Map([[assetId, { id: assetId, kind: 'image', url: 'fresh-owned-link' }]]));
  const second = await prepareReviewedBatch(referenced('Changed prompt'), () => true);
  expect(second.id).not.toBe(first.id); expect(mocks.upload).not.toHaveBeenCalled();
  expect(second.data.nodes!.find(node => node.type === 'imageInputNode')!.data.inputAssetId).toBe(assetId);
});
it('creates a separate owner-bound Flow without replacing any current draft or starting jobs', async () => {
  const flow = await prepareReviewedBatch(batch(), () => true);
  expect(flow.isPublic).toBe(false); expect(flow.data.nodes).toHaveLength(2);
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.save.mock.calls[0][0]).toHaveLength(1);
  expect(mocks.merge).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  openReviewedBatch(flow, 'owner');
  expect(mocks.scope).toHaveBeenCalledWith('owner'); expect(mocks.merge).toHaveBeenCalledWith([flow]); expect(mocks.switch).toHaveBeenCalledWith(flow.id);
});
it('reopens the existing reviewed batch and preserves its paid job IDs and completed outputs', async () => {
  const saved = { id: 'existing', data: { nodes: [{ data: { batchSnapshot: batchSnapshot(batch()) } }, { data: { jobId: 'original-job', outputAssetId: 'finished' } }] } };
  mocks.list.mockResolvedValue({ flows: [saved] });
  expect(await prepareReviewedBatch(batch(), () => true)).toBe(saved);
  expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
});
it('rejects account changes during async lookup before saving or opening a Flow', async () => {
  mocks.list.mockImplementation(async () => { localStorage.setItem('dehub_wallet', 'other'); return { flows: [] }; });
  await expect(prepareReviewedBatch(batch(), () => true)).rejects.toThrow('creator.batchOwnerChanged');
  expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.merge).not.toHaveBeenCalled();
});

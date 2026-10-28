import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), upload: vi.fn(), download: vi.fn(), scope: vi.fn(), merge: vi.fn(), switch: vi.fn() }));
vi.mock('./cloudLibrary', () => ({ saveCloudGeneration: mocks.upload }));
vi.mock('./assetDownload', () => ({ assetToFile: mocks.download }));
vi.mock('./flow/api', () => ({ listFlows: mocks.list, saveFlows: mocks.save, remoteToFlow: (row: unknown) => row }));
vi.mock('@/store/creatorFlowStore', () => ({ useCreatorFlowStore: { getState: () => ({ setScope: mocks.scope, loadFlowsFromDB: mocks.merge, switchFlow: mocks.switch }) } }));
import { openReviewedBatch, prepareReviewedBatch } from './reviewedBatchFlow';
import { batchSnapshot, makeReviewedBatch } from './reviewedBatch';
const batch = () => makeReviewedBatch('campaign', 'campaign', 'Launch', 'owner', [{ id: 'variant', label: 'Variant', draft: { kind: 'image', prompt: 'Tea', owner: 'owner' }, references: [] }]);
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); localStorage.setItem('dehub_wallet', 'owner');
  vi.stubGlobal('crypto', { subtle: { digest: vi.fn(async () => new Uint8Array(32).fill(1).buffer) } });
  mocks.list.mockResolvedValue({ flows: [] }); mocks.save.mockResolvedValue({ ok: true });
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

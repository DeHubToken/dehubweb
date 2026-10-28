import { beforeEach, expect, it, vi } from 'vitest';
import type { FlowNode } from './types';
const mocks = vi.hoisted(() => ({ state: {} as Record<string, unknown>, pay: vi.fn(), quote: vi.fn(), assistant: vi.fn(), startImage: vi.fn(), jobs: [] as Array<Record<string, unknown>> }));
vi.mock('@/hooks/use-ai-quote', () => ({ fetchJobQuote: mocks.quote }));
vi.mock('@/lib/ai-payment', () => ({ payForJob: mocks.pay }));
vi.mock('@/lib/creator/generationEngine', () => ({ DEFAULT_VOICE_ID: 'voice', hostDataUrl: vi.fn() }));
vi.mock('@/constants/image-models.constants', () => ({ IMAGE_MODELS: {} }));
vi.mock('@/constants/video-models.constants', () => ({ VIDEO_MODELS: {}, snapVideoDuration: vi.fn(), getVideoResolutions: vi.fn() }));
vi.mock('@/store/creatorFlowStore', () => ({ useCreatorFlowStore: { getState: () => mocks.state } }));
vi.mock('@/store/generationStore', () => ({ useGenerationStore: { getState: () => ({ jobs: mocks.jobs, startImage: mocks.startImage }), subscribe: vi.fn() } }));
vi.mock('./assistant', () => ({ streamAssistant: mocks.assistant }));
vi.mock('./assets', () => ({ flowAssetId: (node: FlowNode) => node.data.outputAssetId || '', loadFlowAssets: vi.fn(), assetNodePatch: vi.fn() }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('@/i18n/copy', () => ({ translateCopy: (key: string) => key }));
import { executeRun, payForPlan, planRun } from './runner';
import { readReceipt } from './recovery';

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); localStorage.setItem('dehub_wallet', 'owner'); localStorage.setItem('dehub_token', 'token');
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_name: string, callback: () => unknown) => callback() } });
  mocks.jobs = [];
  const nodes: FlowNode[] = [{ id: 'free', type: 'assistantNode', position: { x: 0, y: 0 }, data: { label: 'Free', localPrompt: 'A bell' } },
    { id: 'paid', type: 'imageGenNode', position: { x: 0, y: 0 }, data: { label: 'Paid' } }];
  mocks.state = { activeFlowId: 'flow', scopeVersion: 0, nodes, edges: [{ id: 'wire', source: 'free', target: 'paid', targetHandle: 'prompt' }],
    updateNodeData: (id: string, patch: Record<string, unknown>) => { const node = nodes.find(node => node.id === id)!; node.data = { ...node.data, ...patch }; }, setIsRunning: vi.fn() };
  mocks.quote.mockResolvedValue({ priceDhb: 100 }); mocks.pay.mockResolvedValue('accepted-transfer');
  mocks.assistant.mockResolvedValue('A ringing bell');
  mocks.startImage.mockImplementation((request: { clientJobId: string }) => {
    mocks.jobs.push({ id: request.clientJobId, status: 'done', url: 'fresh-image' }); return request.clientJobId;
  });
});
it('retains the accepted payment and reserved UUID when a free predecessor fails, then resumes without paying twice', async () => {
  const plan = await planRun(['free', 'paid']);
  const hash = await payForPlan(plan);
  const reserved = readReceipt('owner', 'flow')!.jobIds.paid;
  mocks.assistant.mockRejectedValueOnce(new Error('Interrupted'));
  expect((await executeRun(plan, hash)).failures).toBe(2);
  expect(readReceipt('owner', 'flow')!.txHash).toBe(hash);
  expect(mocks.startImage).not.toHaveBeenCalled();
  const resume = await planRun(['paid']);
  expect(resume.items.map(item => item.nodeId)).toEqual(['free', 'paid']);
  expect(await payForPlan(resume)).toBe(hash);
  await expect(executeRun(resume, hash)).rejects.toThrow('Confirm retry');
  expect((await executeRun(resume, hash, { retryInterruptedFree: true })).failures).toBe(0);
  expect(mocks.pay).toHaveBeenCalledTimes(1);
  expect(mocks.startImage.mock.calls[0][0].clientJobId).toBe(reserved);
  expect(readReceipt('owner', 'flow')).toBeNull();
});
it('saves accepted money under its original owner before rejecting an account switch', async () => {
  const plan = await planRun(['free', 'paid']);
  mocks.pay.mockImplementation(async () => { localStorage.setItem('dehub_wallet', 'other'); mocks.state.scopeVersion = 1; return 'accepted-transfer'; });
  await expect(payForPlan(plan)).rejects.toThrow('original account');
  expect(readReceipt('owner', 'flow')!.txHash).toBe('accepted-transfer');
  expect(readReceipt('other', 'flow')).toBeNull();
  expect(mocks.startImage).not.toHaveBeenCalled();
});
it('restores a completed assistant output from the receipt after the graph lost it', async () => {
  const plan = await planRun(['free', 'paid']); const hash = await payForPlan(plan);
  mocks.startImage.mockImplementationOnce(() => { throw new Error('Interrupted before submission'); });
  expect((await executeRun(plan, hash)).failures).toBe(1);
  const free = (mocks.state.nodes as FlowNode[]).find(node => node.id === 'free')!;
  delete free.data.outputText;
  const resumed = await planRun(['paid']);
  expect(free.data.outputText).toBe('A ringing bell');
  expect((await executeRun(resumed, hash)).failures).toBe(0);
  expect(mocks.assistant).toHaveBeenCalledTimes(1);
  expect(mocks.pay).toHaveBeenCalledTimes(1);
});
it('blocks a fresh payment when cross-tab locking is unavailable', async () => {
  const plan = await planRun(['free', 'paid']);
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  await expect(payForPlan(plan)).rejects.toThrow('safely coordinate');
  expect(mocks.pay).not.toHaveBeenCalled();
});
it('does not settle an old assistant into a graph reopened after an account switchback', async () => {
  const plan = await planRun(['free', 'paid']); const hash = await payForPlan(plan);
  const reopened = (mocks.state.nodes as FlowNode[]).map(node => ({ ...node, data: { ...node.data, outputText: 'New account view' } }));
  mocks.assistant.mockImplementationOnce(async () => { mocks.state.scopeVersion = 2; mocks.state.nodes = reopened; return 'Old response'; });
  await expect(executeRun(plan, hash)).rejects.toThrow('original account');
  expect(reopened[0].data.outputText).toBe('New account view');
  expect(mocks.startImage).not.toHaveBeenCalled();
  expect(readReceipt('owner', 'flow')!.txHash).toBe(hash);
});
it('rejects changed prices and a switch away and back during the fresh quote before payment', async () => {
  const plan = await planRun(['free', 'paid']);
  mocks.quote.mockResolvedValueOnce({ priceDhb: 200 });
  await expect(payForPlan(plan)).rejects.toThrow('price changed');
  expect(mocks.pay).not.toHaveBeenCalled();
  mocks.quote.mockImplementationOnce(async () => { mocks.state.scopeVersion = 2; return { priceDhb: 100 }; });
  await expect(payForPlan(plan)).rejects.toThrow('original account');
  expect(mocks.pay).not.toHaveBeenCalled();
});

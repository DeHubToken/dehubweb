import { saveCloudGeneration } from './cloudLibrary';
import { assetToFile } from './assetDownload';
import { listFlows, remoteToFlow, saveFlows, type RemoteFlow } from './flow/api';
import { batchSnapshot, reviewedBatchGraph, type ReviewedBatch } from './reviewedBatch';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { uid, type Flow } from './flow/types';

async function digest(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
/** Save a separate private Flow; returning to the same reviewed snapshot reopens it. */
export async function prepareReviewedBatch(batch: ReviewedBatch, isCurrent: () => boolean): Promise<RemoteFlow> {
  batch = JSON.parse(JSON.stringify(batch)) as ReviewedBatch;
  const check = () => { if (!isCurrent() || localStorage.getItem('dehub_wallet')?.toLowerCase() !== batch.owner) throw new Error('creator.batchOwnerChanged'); };
  check();
  const snapshot = batchSnapshot(batch), revision = await digest(snapshot), id = uid();
  check();
  const saved = (await listFlows()).flows;
  const existing = saved.find(flow => flow.data.nodes?.[0]?.data.batchSnapshot === snapshot);
  check();
  if (existing) {
    if (existing.data.nodes?.[0]?.data.batchSnapshot !== snapshot) throw new Error('creator.batchConflict');
    return existing;
  }
  if (saved.length >= 100) throw new Error('creator.batchFlowLimit');
  const assets = new Map<string, string>();
  for (const reference of batch.items.flatMap(item => item.references)) {
    if (assets.has(reference.sourceId)) continue;
    const assetId = `batchref${(await digest(`${batch.owner}:${batch.type}:${batch.sourceId}:${reference.sourceId}`)).slice(0, 32)}`;
    check();
    const file = await assetToFile(reference.url, 'reference', 'application/octet-stream', { maxBytes: 25 * 1024 * 1024, signal: AbortSignal.timeout(30_000) });
    if (!file.size || !file.type.startsWith('image/')) throw new Error('creator.batchMissingReference');
    check();
    const url = URL.createObjectURL(file);
    try { await saveCloudGeneration(batch.owner, { id: assetId, kind: 'image', prompt: reference.label, resolvedPrompt: reference.label,
      model: 'import', modelName: reference.label, aspect: '1:1', status: 'done', stage: '', createdAt: Date.now(), url }); }
    finally { URL.revokeObjectURL(url); }
    check(); assets.set(reference.sourceId, assetId);
  }
  const graph = reviewedBatchGraph(batch, revision, assets), now = Date.now();
  const flow: Flow = { id, name: batch.title || `${batch.type} batch`, nodes: graph.nodes, edges: graph.edges, nodeCounters: {}, createdAt: now, updatedAt: now, isPublic: false };
  check(); await saveFlows([flow]); check();
  return { id, name: flow.name, isPublic: false, coverUrl: null, data: { ...graph, nodeCounters: {}, createdAt: now, updatedAt: now }, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
}

export function openReviewedBatch(flow: RemoteFlow, owner: string): void {
  if (localStorage.getItem('dehub_wallet')?.toLowerCase() !== owner) throw new Error('creator.batchOwnerChanged');
  const store = useCreatorFlowStore.getState();
  store.setScope(owner);
  store.loadFlowsFromDB([remoteToFlow(flow)]);
  useCreatorFlowStore.getState().switchFlow(flow.id);
}

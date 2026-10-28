import { saveCloudGeneration } from './cloudLibrary';
import { getMedia } from '../editor/mediaStore';
import { loadFlowAssets } from './flow/assets';
import { listFlows, remoteToFlow, saveFlows, type RemoteFlow } from './flow/api';
import { batchSnapshot, reviewedBatchGraph, type ReviewedBatch } from './reviewedBatch';
import { useCreatorFlowStore } from '@/store/creatorFlowStore';
import { uid, type Flow } from './flow/types';

async function digest(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function contentRevision(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer()), chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return digest(btoa(chunks.join('')));
}
/** Save a separate private Flow; returning to the same reviewed snapshot reopens it. */
export async function prepareReviewedBatch(batch: ReviewedBatch, isCurrent: () => boolean): Promise<RemoteFlow> {
  batch = JSON.parse(JSON.stringify(batch)) as ReviewedBatch;
  const check = () => { if (!isCurrent() || localStorage.getItem('dehub_wallet')?.toLowerCase() !== batch.owner) throw new Error('creator.batchOwnerChanged'); };
  check();
  batchSnapshot(batch);
  const files = new Map<string, Blob>(), revisions = new Map<string, string>();
  for (const reference of batch.items.flatMap(item => item.references)) {
    if (!files.has(reference.sourceId)) {
      const stored = await getMedia(reference.sourceId); check();
      if (!stored?.blob.size || stored.blob.size > 25 * 1024 * 1024 || !stored.blob.type.startsWith('image/')) throw new Error('creator.batchMissingReference');
      files.set(reference.sourceId, stored.blob);
      revisions.set(reference.sourceId, await contentRevision(stored.blob)); check();
    }
    reference.contentRevision = revisions.get(reference.sourceId);
  }
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
  const referenceIds = new Map<string, string>();
  for (const reference of batch.items.flatMap(item => item.references)) referenceIds.set(reference.sourceId, `batchref${(await digest(`${batch.owner}:${reference.sourceId}:${reference.contentRevision}`)).slice(0, 32)}`);
  check();
  const owned = await loadFlowAssets(batch.owner, [...referenceIds.values()]); check();
  for (const reference of batch.items.flatMap(item => item.references)) {
    if (assets.has(reference.sourceId)) continue;
    const assetId = referenceIds.get(reference.sourceId)!;
    if (owned.get(assetId)?.kind === 'image' && owned.get(assetId)?.url) { assets.set(reference.sourceId, assetId); continue; }
    check();
    const file = files.get(reference.sourceId)!;
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

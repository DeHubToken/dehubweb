import { invokeAi } from '@/lib/ai-invoke';
import { callCreatorLibrary } from './cloudLibrary';
import { assetToFile, throwIfAssetAborted } from './assetDownload';
import { importOneFile } from '@/lib/editor/importFiles';
import { useEditorStore } from '@/store/editorStore';
import { zipFiles } from '@/lib/editor/zip';
import { validateLayerSet, selectedLayers, layerExportManifest, type ImageLayerSet, type LayerChoice } from './imageLayersContract';

export interface LayerJob { id: string; status: string; savePending?: boolean; sourceDigest?: string; requestId?: string; appId?: string }
export async function layerJobs(wallet: string, sourceAssetId: string): Promise<LayerJob[]> {
  return (await callCreatorLibrary(wallet, { action: 'layer-jobs', sourceAssetId })).jobs;
}
export async function collectLayers(wallet: string, job: LayerJob): Promise<ImageLayerSet | null> {
  if (job.requestId && job.appId && !['succeeded','failed','canceled','cancelled','refund_pending'].includes(job.status)) {
    const { data, error } = await invokeAi<{ error?: string }>('fal-ai-tools', { body: { requestId: job.requestId, appId: job.appId } });
    if (error || data?.error) throw error || new Error(data!.error);
  }
  const result = await callCreatorLibrary(wallet, { action: 'layer-set', id: job.id });
  return result.layerSet ? validateLayerSet(result.layerSet) : null;
}
export async function submitLayers(sourceAssetId: string, clientJobId: string, txHash: string, acceptedPriceDhb: number, sourceDigest?: string) {
  const { data, error } = await invokeAi<{ error?: string; submissionUnconfirmed?: boolean }>('fal-ai-tools', { body: { tool: 'qwen-image-layered', sourceAssetId, sourceDigest, clientJobId, txHash, acceptedPriceDhb } });
  if (error || data?.error) throw error || new Error(data!.error);
}
export async function importLayers(set: ImageLayerSet, choices: LayerChoice[], wallet: string, currentOwner: () => boolean, signal: AbortSignal) {
  const target = useEditorStore.getState(), projectId = target.projectId, at = target.currentTime;
  const layers = selectedLayers(set, choices), imported: { mediaId: string; label: string; hidden: boolean }[] = [];
  for (const layer of layers) {
    throwIfAssetAborted(signal);
    if (!currentOwner() || useEditorStore.getState().projectId !== projectId) throw new Error('The target editor changed');
    const file = await assetToFile(layer.url, `layer-${layer.index + 1}.png`, 'image/png', { signal });
    const bitmap = await createImageBitmap(file);
    try { if (bitmap.width !== set.width || bitmap.height !== set.height) throw new Error('Layer canvas changed'); } finally { bitmap.close(); }
    const mediaId = await importOneFile(file, { wallet, signal });
    if (!mediaId) throw new Error('Could not import every layer');
    imported.push({ mediaId, label: `Layer ${layer.index + 1}`, hidden: layer.hidden });
  }
  throwIfAssetAborted(signal);
  if (!currentOwner() || useEditorStore.getState().projectId !== projectId) throw new Error('The target editor changed');
  useEditorStore.getState().addImageLayers(imported, at);
  window.dispatchEvent(new CustomEvent('editor:storage-usage-changed'));
}
export async function exportLayers(set: ImageLayerSet, choices: LayerChoice[], signal: AbortSignal) {
  const files = [];
  for (const layer of selectedLayers(set, choices)) files.push({ name: `layer-${layer.index + 1}.png`, blob: await assetToFile(layer.url, `layer-${layer.index + 1}.png`, 'image/png', { signal }) });
  files.push({ name: 'manifest.json', blob: new Blob([JSON.stringify(layerExportManifest(set, choices), null, 2)], { type: 'application/json' }) });
  throwIfAssetAborted(signal);
  const url = URL.createObjectURL(await zipFiles(files));
  const link = document.createElement('a'); link.href = url; link.download = `layers-${set.id}.zip`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

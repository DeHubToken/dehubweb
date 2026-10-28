import { serviceClient } from './auth.ts';
import { layerCanvas, LayerValidationError, validateLayerPng } from './creator-layer-png.ts';

export const LAYER_MODEL = 'qwen-image-layered';
export const LAYER_ENDPOINT = 'fal-ai/qwen-image-layered';
export const LAYER_COUNT = 4;
export const layerAssetId = (jobId: string, index: number) => `${jobId}-layer-${index}`;
export const layerManifest = (jobId: string, sourceAssetId: string, images: any, sourceDigest?: string, seed?: unknown) => ({ version: 1, id: jobId, sourceAssetId, sourceDigest, seed: typeof seed === 'number' && Number.isFinite(seed) ? seed : null,
  operation: 'decompose', format: 'png',
  layers: Array.from({ length: LAYER_COUNT }, (_, index) => ({ id: layerAssetId(jobId, index), index, rawUrl: images?.[index]?.url ?? null })) });
export const layerInput = (imageUrl: string) => ({ image_url: imageUrl, num_layers: LAYER_COUNT,
  output_format: 'png', num_inference_steps: 28, guidance_scale: 5, acceleration: 'regular', enable_safety_checker: true, sync_mode: false });

/** The four returned images include any background; never invent a fifth layer. */
export function layerOutputs(result: any): string[] {
  if (!Array.isArray(result.layerImages) || result.layerImages.length !== LAYER_COUNT ||
    !Array.isArray(result.layerSafety) || result.layerSafety.length !== LAYER_COUNT || result.layerSafety.some((value: unknown) => value !== false)) throw new LayerValidationError('The provider did not return four safe layers.');
  return result.layerImages.map((image: any) => {
    if (typeof image?.url !== 'string') throw new LayerValidationError('Missing layer output');
    let url: URL;
    try { url = new URL(image.url); } catch { throw new LayerValidationError('Invalid layer output URL'); }
    if (url.protocol !== 'https:' || url.username || url.password || !(url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media'))) throw new LayerValidationError('Invalid layer output host');
    return url.toString();
  });
}
async function downloadLayer(url: string) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  const limit = 12 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > limit) throw new LayerValidationError('Layer output is too large');
  if (!response.ok || response.redirected || !response.body) throw new Error('Could not save layer output');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
      if (size > limit) throw new LayerValidationError('Layer output is too large'); chunks.push(part.value); }
  } finally { void reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes, ...await validateLayerPng(bytes) };
}

/** Parent result is journalled first. Repeated archive attempts reuse every child ID. */
export async function archiveLayerSet(job: any, result: any, db = serviceClient()) {
  const urls = layerOutputs(result), wallet = job.wallet_address;
  if (result.layerSet?.id !== job.id || result.layerSet.layers?.length !== LAYER_COUNT || result.layerSet.layers.some((layer: any, index: number) => layer.id !== layerAssetId(job.id, index) || layer.index !== index || layer.rawUrl !== result.layerImages[index].url)) throw new Error('Invalid durable layer manifest');
  const layers: Array<{ id: string; index: number; width: number; height: number }> = [];
  for (let index = 0; index < LAYER_COUNT; index++) {
    const id = layerAssetId(job.id, index), path = `${wallet}/${id}/original`;
    const previous = await db.from('creator_assets').select('ready,storage_path,metadata').eq('wallet_address', wallet).eq('id', id).maybeSingle();
    if (previous.error) throw previous.error;
    let width: number, height: number;
    if ((previous.data?.ready || previous.data?.metadata?.layerValidated === true) && previous.data.storage_path === path && previous.data.metadata?.layerSetId === job.id && previous.data.metadata?.layerIndex === index) {
      ({ width, height } = previous.data.metadata);
    } else {
      const output = await downloadLayer(urls[index]); ({ width, height } = output);
      if (layers.length && (layers[0].width !== width || layers[0].height !== height)) throw new LayerValidationError('Layer canvas sizes do not match');
      const uploaded = await db.storage.from('creator-assets').upload(path, new Blob([output.bytes], { type: 'image/png' }), { upsert: true, contentType: 'image/png' });
      if (uploaded.error) throw uploaded.error;
      const saved = await db.from('creator_assets').upsert({ id, wallet_address: wallet, storage_path: path, ready: false,
        metadata: { kind: 'image', model: LAYER_MODEL, modelName: 'Qwen Image Layers', prompt: `Layer ${index + 1}`, createdAt: Date.parse(job.created_at),
          layerSetId: job.id, layerIndex: index, layerCount: LAYER_COUNT, layerValidated: true, width, height } });
      if (saved.error) throw saved.error;
    }
    if (!Number.isInteger(width) || !Number.isInteger(height) || layers.length && (layers[0].width !== width || layers[0].height !== height)) throw new Error('Layer canvas sizes do not match');
    layerCanvas(width, height);
    layers.push({ id, index, width, height });
  }
  // Processing work only stages. A terminal cancellation may have won while these
  // files downloaded; only an immutable succeeded decision grants publication.
  if (job.status !== 'succeeded') { result.savePending = true; return; }
  // Publish the validated set atomically after terminal success owns delivery.
  const published = await db.from('creator_assets').update({ ready: true }).eq('wallet_address', wallet).in('id', layers.map(layer => layer.id)).select('id');
  if (published.error || published.data?.length !== LAYER_COUNT) throw published.error || new Error('Could not publish every saved layer');
  // The terminal guard permits only these delivery fields to change after success.
  // Keep the original manifest and provider result immutable for durable recovery.
  result.libraryId = job.id; delete result.savePending;
}

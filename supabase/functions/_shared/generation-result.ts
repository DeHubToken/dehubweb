import { serviceClient } from './auth.ts';

const mediaFields = ['imageUrl', 'image', 'videoUrl', 'audioUrl', 'modelUrl'] as const;

/** Only discard inline bytes after the private library upload has succeeded. */
export function compactGenerationResult(result: Record<string, any>, storagePath: string | null) {
  if (!storagePath) return;
  const archived = result.videoUrl || result.modelUrl || result.imageUrl || result.audioUrl || result.image;
  for (const field of mediaFields) {
    if (result[field] === archived && typeof result[field] === 'string' && result[field].startsWith('data:')) {
      result.storedMedia = { ...result.storedMedia, [field]: storagePath };
      delete result[field];
    }
  }
}

/** Keep the existing web/mobile response contract, including old saved tickets. */
export async function hydrateGenerationResult(job: any, db = serviceClient()): Promise<any> {
  if (job?.result?.layerSet) {
    if (job.result.savePending || !job.result.libraryId) return { status: 'saving', savePending: true, jobId: job.id };
    const result = { ...job.result, layerSet: { ...job.result.layerSet, layers: [] } };
    if (job.result.layerSet.id !== job.id || job.result.layerSet.layers?.length !== 4) throw new Error('Invalid layer manifest');
    for (const [index, layer] of job.result.layerSet.layers.entries()) {
      if (layer.id !== `${job.id}-layer-${index}` || layer.index !== index) throw new Error('Invalid layer reference');
      const asset = await db.from('creator_assets').select('metadata,ready,storage_path').eq('wallet_address', job.wallet_address).eq('id', layer.id).maybeSingle();
      const meta = asset.data?.metadata;
      if (asset.error || !asset.data?.ready || asset.data.storage_path !== `${job.wallet_address}/${layer.id}/original` || meta?.layerSetId !== job.id || !Number.isInteger(meta.width) || !Number.isInteger(meta.height)) throw new Error('Saved layers are temporarily unavailable');
      if (index && (result.layerSet.width !== meta.width || result.layerSet.height !== meta.height)) throw new Error('Invalid layer canvas');
      result.layerSet.width = meta.width; result.layerSet.height = meta.height;
      const signed = await db.storage.from('creator-assets').createSignedUrl(`${job.wallet_address}/${layer.id}/original`, 3600);
      if (signed.error || !signed.data?.signedUrl) throw new Error('Saved layers are temporarily unavailable');
      result.layerSet.layers.push({ ...layer, width: meta.width, height: meta.height, url: signed.data.signedUrl });
    }
    delete result.layerImages; delete result.layerSafety;
    return result;
  }
  if (!job?.result?.storedMedia) return job?.result;
  const result = { ...job.result };
  for (const field of mediaFields) {
    const path = result.storedMedia[field];
    if (!path) continue;
    if (typeof path !== 'string' || !path.startsWith(`${job.wallet_address}/${job.id}/`)) throw new Error('Invalid saved media reference');
    const { data, error } = await db.storage.from('creator-assets').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw new Error('Saved media is temporarily unavailable. Check your library before retrying.');
    result[field] = data.signedUrl;
  }
  delete result.storedMedia;
  return result;
}

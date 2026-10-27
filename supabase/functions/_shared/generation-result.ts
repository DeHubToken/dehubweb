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

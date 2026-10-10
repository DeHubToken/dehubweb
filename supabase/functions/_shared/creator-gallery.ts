import { serviceClient } from './auth.ts';
import { freePosterPng } from './creator-gallery-policy.ts';

/** Publish only the finished server-rendered Poster; never read private chat history. */
export async function publishFreePoster(request: Parameters<typeof freePosterPng>[0], priceDhb: number, id: string, response: Response): Promise<void> {
  if (!response.ok) return;
  try {
    const png = freePosterPng(request, priceDhb, await response.clone().json());
    if (!png) return;
    const db = serviceClient();
    const bucket = db.storage.from('creator-public-posters');
    const path = `${id}.png`;
    const upload = await bucket.upload(path, png, { contentType: 'image/png', upsert: false });
    if (upload.error) throw upload.error;
    const { error } = await db.from('creator_public_posters').insert({
      id, image_url: bucket.getPublicUrl(path).data.publicUrl, skill_slug: 'dehub-poster', price_dhb: 0,
    });
    if (error) throw error;
  } catch (error) {
    // Publishing must not discard a successfully generated result from its owner.
    console.error('[creator-gallery] Poster publication failed', id, error instanceof Error ? error.message : 'storage unavailable');
  }
}

import { getTextPostShareImageUrl } from './api/dehub/og-image';

/** Use the same public-data card as link previews and native sharing. */
export async function buildPostShareImage({ postId }: { postId: string }): Promise<Blob> {
  const response = await fetch(getTextPostShareImageUrl(postId), {
    credentials: 'omit',
    signal: AbortSignal.timeout(15000),
  });
  // A post that may not show its own card (mature, restricted) answers with the brand card.
  if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/png') || response.headers.get('X-DeHub-Share-Card') === 'brand') {
    throw new Error('Post share image unavailable');
  }
  return response.blob();
}

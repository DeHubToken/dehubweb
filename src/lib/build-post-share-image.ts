import { getTextPostShareImageUrl } from './api/dehub/og-image';

/** Use the same public-data card as link previews and native sharing. */
export async function buildPostShareImage({ postId }: { postId: string }): Promise<Blob> {
  const response = await fetch(getTextPostShareImageUrl(postId), {
    credentials: 'omit',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/png')) {
    throw new Error('Post share image unavailable');
  }
  return response.blob();
}

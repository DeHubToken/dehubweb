/**
 * Pictures inside an article upload as soon as they are picked, and go into
 * the body as `![caption](url#w=..&h=..)`. The size on the address lets the
 * reader hold each picture's space before it loads.
 */
import { authedUpload } from '@/lib/api/dehub/core';

async function pictureSize(file: File): Promise<{ w: number; h: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return size.w > 0 && size.h > 0 ? size : null;
  } catch {
    return null;
  }
}

export async function uploadArticleImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const [res, size] = await Promise.all([
    authedUpload<{ url?: string }>('/api/article_image', formData, { timeoutMs: 3 * 60 * 1000, unwrapResult: true }),
    pictureSize(file),
  ]);
  if (typeof res?.url !== 'string' || !/^https?:\/\//.test(res.url)) throw new Error('Upload failed');
  return size ? `${res.url}#w=${size.w}&h=${size.h}` : res.url;
}

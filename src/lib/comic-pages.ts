/**
 * Comic pages are shrunk in the browser before upload, so a 50-page comic
 * fits the 100 MB request cap and nobody resizes their art by hand first.
 * Pages already small enough, and animated GIFs, go up untouched.
 */
const MAX_EDGE = 2048;
const SHRINK_ABOVE_BYTES = 1_500_000;
const JPEG_QUALITY = 0.88;

async function shrinkPage(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE_BYTES || file.type === 'image/gif' || !file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/** Shrinks big pages a few at a time, keeping their order. */
export async function shrinkComicPages(files: File[]): Promise<File[]> {
  const out: File[] = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      out[i] = await shrinkPage(files[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
  return out;
}

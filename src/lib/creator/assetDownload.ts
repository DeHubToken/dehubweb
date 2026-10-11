import { MAX_EDITOR_MEDIA_BYTES } from '@/lib/editor/mediaLimits';

export interface AssetDownloadOptions { signal?: AbortSignal; maxBytes?: number }

export function throwIfAssetAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Import cancelled', 'AbortError');
}

/** Download a finished asset without buffering an oversized response. */
export async function assetToFile(url: string, filename: string, mime: string, options: AssetDownloadOptions = {}): Promise<File> {
  const { signal } = options;
  throwIfAssetAborted(signal);
  const res = await fetch(url, { signal });
  return responseToFile(res, filename, mime, options);
}

export async function responseToFile(res: Response, filename: string, mime: string, options: AssetDownloadOptions = {}): Promise<File> {
  const { signal, maxBytes = MAX_EDITOR_MEDIA_BYTES } = options;
  if (signal?.aborted) {
    await res.body?.cancel().catch(() => {});
    throwIfAssetAborted(signal);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`Could not download the asset (${res.status})`);
  }
  if (Number(res.headers.get('content-length')) > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new Error('Generated media is too large');
  }
  const type = res.headers.get('content-type') || mime;
  if (!res.body) {
    const blob = await res.blob();
    throwIfAssetAborted(signal);
    if (blob.size > maxBytes) throw new Error('Generated media is too large');
    return new File([blob], filename, { type: blob.type || mime });
  }
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let bytes = 0;
  let cancel: Promise<void> | undefined;
  const stop = () => { cancel ??= reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    throwIfAssetAborted(signal);
    while (true) {
      const { done, value } = await reader.read();
      throwIfAssetAborted(signal);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        stop();
        throw new Error('Generated media is too large');
      }
      chunks.push(new Blob([value.slice().buffer as ArrayBuffer]));
    }
    return new File(chunks, filename, { type });
  } catch (error) {
    stop();
    throw error;
  } finally {
    signal?.removeEventListener('abort', stop);
    await cancel;
    reader.releaseLock();
  }
}

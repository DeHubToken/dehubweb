import { serviceClient } from './auth.ts';

/** Copy provider output to the owner's private library before its URL expires. */
export async function archiveGeneration(wallet: string, id: string, metadata: Record<string, unknown>, url?: string): Promise<void> {
  const db = serviceClient();
  const existing = await db.from('creator_assets').select('ready').eq('wallet_address', wallet).eq('id', id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.ready) return;
  let path: string | null = null;
  if (url) {
    if (!url.startsWith('data:')) {
      const parsed = new URL(url);
      // Only provider-owned asset hosts; never fetch a caller's internal URL.
      const hosts = ['fal.media', 'replicate.delivery', 'kie.ai', 'kieai.red', 'kieai.net', 'tempfile.ai', 'storage.googleapis.com', 'replicate.com'];
      if (parsed.protocol !== 'https:' || !hosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
        throw new Error('Provider asset needs saving through the client');
      }
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(45000), redirect: 'error' });
    if (!response.ok) throw new Error('Could not collect provider output');
    // Edge memory is bounded; larger media remains available for the client upload path.
    const limit = 96 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('Save large media through the client'); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Provider returned no media');
    const chunks: ArrayBuffer[] = [];
    let bytes = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new Error('Save large media through the client'); }
      chunks.push(Uint8Array.from(part.value).buffer);
    }
    const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'application/octet-stream' });
    if (!blob.size || blob.size > 524288000) throw new Error('Generated media exceeds the storage limit');
    path = `${wallet}/${id}/original`;
    const upload = await db.storage.from('creator-assets').upload(path, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
    if (upload.error) throw upload.error;
  }
  const { error } = await db.from('creator_assets').upsert({ id, wallet_address: wallet, storage_path: path, metadata, ready: true });
  if (error) throw error;
}

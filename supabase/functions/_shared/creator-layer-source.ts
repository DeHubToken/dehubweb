import { serviceClient } from './auth.ts';
import { validateLayerPng } from './creator-layer-png.ts';
const ID = /^[a-zA-Z0-9_-]{6,80}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const LIMIT = 12 * 1024 * 1024;
async function sourceBytes(path: string, db: ReturnType<typeof serviceClient>) {
  const signed = await db.storage.from('creator-assets').createSignedUrl(path, 86400);
  if (signed.error || !signed.data?.signedUrl) throw new Error('Saved image is temporarily unavailable');
  const response = await fetch(signed.data.signedUrl, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > LIMIT) throw new Error('Choose an image up to 12 MiB');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > LIMIT) throw new Error('Choose an image up to 12 MiB'); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return { bytes, url: signed.data.signedUrl };
}
/** The first release accepts fully validated 8-bit RGB/RGBA PNG sources. */
export async function layerSourceFormat(bytes: Uint8Array) {
  if (bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) {
    await validateLayerPng(bytes, true); return 'image/png';
  }
  throw new Error('Choose a saved PNG image, up to 12 MiB and four megapixels');
}
export async function prepareLayerSource(wallet: string, id: string, digest?: string, db = serviceClient()): Promise<{sourceAssetId:string;sourceDigest:string;sourcePreviewUrl:string}> {
  if (!ID.test(id) || digest !== undefined && !DIGEST.test(digest)) throw new Error('Invalid layer source');
  const path = digest ? `${wallet}/__layer_sources/${id}/${digest}/original` : `${wallet}/${id}/original`;
  if (!digest) {
    const owned = await db.from('creator_assets').select('metadata,storage_path').eq('wallet_address',wallet).eq('id',id).eq('ready',true).maybeSingle();
    if (owned.error || owned.data?.metadata?.kind !== 'image' || owned.data?.storage_path !== path) throw new Error('Choose one saved image');
  }
  const source = await sourceBytes(path,db), mime = await layerSourceFormat(source.bytes);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',source.bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  if (digest && hash !== digest) throw new Error('Saved source changed. Review the image again.');
  const snapshot = `${wallet}/__layer_sources/${id}/${hash}/original`;
  if (!digest) {
    const copied = await db.storage.from('creator-assets').upload(snapshot,new Blob([source.bytes],{type:mime}),{upsert:false,contentType:mime});
    if (copied.error && String(copied.error.statusCode) !== '409' && !/already exists|duplicate/i.test(copied.error.message)) throw copied.error;
    // Re-read the immutable object, including an existing object won by another tab.
    return await prepareLayerSource(wallet,id,hash,db);
  }
  return { sourceAssetId:id, sourceDigest:hash, sourcePreviewUrl:source.url };
}

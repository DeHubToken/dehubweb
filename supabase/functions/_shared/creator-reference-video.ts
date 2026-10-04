const CHUNK_BYTES = 512 * 1024;
const MAX_BYTES = 200 * 1024 * 1024;

/** Read MP4/MOV movie metadata; pixel data is never decoded here. */
export function movieDuration(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 4; i + 32 < bytes.length; i++) {
    if (bytes[i] !== 109 || bytes[i + 1] !== 118 || bytes[i + 2] !== 104 || bytes[i + 3] !== 100) continue;
    const boxSize = view.getUint32(i - 4);
    const version = bytes[i + 4];
    if ((version !== 0 && version !== 1) || boxSize < (version ? 44 : 32) || i - 4 + boxSize > bytes.length) continue;
    const scaleOffset = i + (version ? 24 : 16);
    const scale = view.getUint32(scaleOffset);
    const duration = version ? Number(view.getBigUint64(scaleOffset + 4)) : view.getUint32(scaleOffset + 4);
    const seconds = duration / scale;
    if (scale && Number.isFinite(seconds) && seconds > 0) return seconds;
  }
  return null;
}

export function allowedReferenceVideo(url: string, storageHost: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      (u.hostname === storageHost || u.hostname === 'storage.googleapis.com' || u.hostname.endsWith('.fal.media'));
  } catch { return false; }
}

/** Verify the billable duration from the actual clip before charging. */
export async function referenceVideoDuration(url: string, maxSeconds: number, storageHost: string): Promise<number> {
  if (!allowedReferenceVideo(url, storageHost)) throw new Error('Upload the reference clip or choose one from your library');
  const range = async (value: string) => {
    const response = await fetch(url, { headers: { Range: value }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.body) throw new Error('Could not read the reference clip');
    const total = Number(response.headers.get('content-range')?.split('/')[1] ?? response.headers.get('content-length'));
    if (total > MAX_BYTES) { await response.body.cancel(); throw new Error('Use a reference clip under 200 MB'); }
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (size < CHUNK_BYTES) {
        const { value: part, done } = await reader.read();
        if (done) break;
        const kept = part.subarray(0, CHUNK_BYTES - size);
        parts.push(kept); size += kept.length;
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return bytes;
  };
  let seconds = movieDuration(await range(`bytes=0-${CHUNK_BYTES - 1}`));
  if (seconds === null) seconds = movieDuration(await range(`bytes=-${CHUNK_BYTES}`));
  if (seconds === null) throw new Error('Use an MP4 or MOV clip with readable duration metadata');
  if (seconds < 3 || seconds > maxSeconds) throw new Error(`Use a reference clip between 3 and ${maxSeconds} seconds`);
  return Math.ceil(seconds);
}

import { VIRAL_MOTION_TEMPLATES } from './viral-templates.ts';

const CHUNK_BYTES = 512 * 1024;
const MAX_BYTES = 200 * 1024 * 1024;
interface Box { type: string; start: number; payload: number; end: number }
function boxHeader(bytes: Uint8Array, start: number, limit: number): Box | null {
  if (start + 8 > bytes.length) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size = view.getUint32(start), header = 8;
  if (size === 1) {
    if (start + 16 > bytes.length) return null;
    size = Number(view.getBigUint64(start + 8)); header = 16;
  } else if (size === 0) size = limit - start;
  if (!Number.isSafeInteger(size) || size < header || start + size > limit) return null;
  return { type: String.fromCharCode(...bytes.subarray(start + 4, start + 8)), start, payload: start + header, end: start + size };
}
function children(bytes: Uint8Array, start: number, end: number): Box[] | null {
  const result: Box[] = [];
  while (start < end && result.length < 128) {
    const box = boxHeader(bytes, start, end);
    if (!box) return null;
    result.push(box); start = box.end;
  }
  return start === end ? result : null;
}

/** Parse a real moov/trak/mdia/stbl hierarchy, never an arbitrary mvhd byte match. */
export function movieDuration(bytes: Uint8Array): number | null {
  try {
    const moov = children(bytes, 0, bytes.length)?.find(box => box.type === 'moov');
    if (!moov) return null;
    const boxes = children(bytes, moov.payload, moov.end);
    if (!boxes || boxes.some(box => box.type === 'mvex')) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), durations: number[] = [];
    for (const trak of boxes.filter(box => box.type === 'trak')) {
      const mdia = children(bytes, trak.payload, trak.end)?.find(box => box.type === 'mdia');
      if (!mdia) continue;
      const media = children(bytes, mdia.payload, mdia.end), handler = media?.find(box => box.type === 'hdlr');
      if (!handler || handler.payload + 12 > handler.end || String.fromCharCode(...bytes.subarray(handler.payload + 8, handler.payload + 12)) !== 'vide') continue;
      const header = media?.find(box => box.type === 'mdhd'), minf = media?.find(box => box.type === 'minf');
      const table = minf && children(bytes, minf.payload, minf.end)?.find(box => box.type === 'stbl');
      const samples = table && children(bytes, table.payload, table.end);
      const timing = samples?.find(box => box.type === 'stts'), sizes = samples?.find(box => box.type === 'stsz');
      if (!header || !timing || !sizes || sizes.payload + 12 > sizes.end) return null;
      const version = bytes[header.payload];
      if (version !== 0 && version !== 1) return null;
      const scaleOffset = header.payload + (version ? 20 : 12);
      if (scaleOffset + (version ? 12 : 8) > header.end || timing.payload + 8 > timing.end) return null;
      const scale = view.getUint32(scaleOffset), declared = version ? Number(view.getBigUint64(scaleOffset + 4)) : view.getUint32(scaleOffset + 4);
      const entries = view.getUint32(timing.payload + 4);
      if (!scale || !entries || entries > 60000 || timing.payload + 8 + entries * 8 !== timing.end) return null;
      let ticks = 0, count = 0;
      for (let i = 0; i < entries; i++) {
        const offset = timing.payload + 8 + i * 8, n = view.getUint32(offset), delta = view.getUint32(offset + 4);
        if (!n || !delta) return null;
        count += n; ticks += n * delta;
      }
      if (!Number.isSafeInteger(ticks) || count < 25 || count !== view.getUint32(sizes.payload + 8) || Math.abs(ticks - declared) > scale / 10) return null;
      if (!view.getUint32(sizes.payload + 4) && sizes.payload + 12 + count * 4 !== sizes.end) return null;
      const seconds = ticks / scale;
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      durations.push(seconds);
    }
    return durations.length ? Math.max(...durations) : null;
  } catch { return null; }
}

export function allowedReferenceVideo(url: string, storageHost: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      (u.hostname === storageHost || u.hostname === 'storage.googleapis.com' || u.hostname.endsWith('.fal.media') ||
        VIRAL_MOTION_TEMPLATES.some(template => template.preview === url));
  } catch { return false; }
}

/** Bound metadata reads; pixel data is never decoded here. */
export async function referenceVideoDuration(url: string, maxSeconds: number, storageHost: string): Promise<number> {
  if (!allowedReferenceVideo(url, storageHost)) throw new Error('Upload the reference clip or choose one from your library');
  const signal = AbortSignal.timeout(15000);
  let total = 0, requests = 0;
  const range = async (offset: number): Promise<Uint8Array> => {
    if (++requests > 4) throw new Error('Use an MP4 or MOV clip with readable duration metadata');
    const response = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + CHUNK_BYTES - 1}` }, redirect: 'error', signal });
    if (!response.ok || !response.body) throw new Error('Could not read the reference clip');
    const contentRange = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
    const length = Number(contentRange?.[3] ?? response.headers.get('content-length'));
    if (length > MAX_BYTES) { await response.body.cancel(); throw new Error('Use a reference clip under 200 MB'); }
    if (!Number.isSafeInteger(length) || length < 8 || (total && length !== total) ||
        (response.status === 206 ? !contentRange || Number(contentRange[1]) !== offset : offset !== 0 || length > CHUNK_BYTES)) {
      await response.body.cancel(); throw new Error('Could not verify the reference clip byte range');
    }
    total = length;
    const expected = Math.min(CHUNK_BYTES, total - offset), reader = response.body.getReader(), parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (size < expected) {
        const { value, done } = await reader.read(); if (done) break;
        const kept = value.subarray(0, expected - size); parts.push(kept); size += kept.length;
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (size !== expected) throw new Error('Incomplete reference clip metadata');
    const bytes = new Uint8Array(size); let at = 0;
    for (const part of parts) { bytes.set(part, at); at += part.length; }
    return bytes;
  };
  let offset = 0, cacheOffset = 0, cache = await range(0), moov: Uint8Array | null = null, ftyp = false, mdat = false, count = 0;
  while (offset < total && ++count <= 128) {
    if (offset < cacheOffset || offset + 16 > cacheOffset + cache.length) { cacheOffset = offset; cache = await range(offset); }
    const relative = offset - cacheOffset, box = boxHeader(cache, relative, total - cacheOffset);
    if (!box) throw new Error('Invalid MP4 or MOV container');
    const absoluteEnd = cacheOffset + box.end;
    if (box.type === 'ftyp' && offset === 0) ftyp = true;
    if (box.type === 'mdat' && box.end > box.payload) mdat = true;
    if (box.type === 'moov') {
      if (moov || box.end - box.start > CHUNK_BYTES) throw new Error('Use a clip with a smaller metadata index');
      if (box.end > cache.length) { cacheOffset = offset; cache = await range(offset); }
      const start = offset - cacheOffset; moov = cache.slice(start, start + box.end - box.start);
    }
    offset = absoluteEnd;
  }
  const seconds = ftyp && mdat && offset === total && moov ? movieDuration(moov) : null;
  if (seconds === null) throw new Error('Use an unfragmented MP4 or MOV clip with readable video sample timing');
  if (seconds < 3 || seconds > maxSeconds) throw new Error(`Use a reference clip between 3 and ${maxSeconds} seconds`);
  return Math.ceil(seconds);
}

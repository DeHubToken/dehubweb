const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export class LayerValidationError extends Error { permanent = true; }
export function layerCanvas(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 4194304) throw new LayerValidationError('Unsupported layer dimensions');
  return { width, height };
}
/** Verify structure, every CRC and exactly one bounded noninterlaced RGBA raster. */
export async function validateLayerPng(bytes: Uint8Array, allowRgb = false) {
  const fail = () => { throw new LayerValidationError('Invalid RGBA PNG layer'); };
  if (bytes.length < 57 || bytes.length > 12 * 1024 * 1024 || [137,80,78,71,13,10,26,10].some((value, index) => bytes[index] !== value)) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8, width = 0, height = 0, channels = 4, count = 0, data = false, afterData = false, ended = false, palette = false;
  const compressed: Uint8Array[] = [];
  while (pos + 12 <= bytes.length) {
    if (++count > 2048) fail();
    const size = view.getUint32(pos), type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    if (size > bytes.length - pos - 12 || !/^[A-Za-z]{4}$/.test(type) || /[a-z]/.test(type[2])) fail();
    let crc = 0xffffffff;
    for (let i = pos + 4; i < pos + 8 + size; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(pos + size + 8)) fail();
    if (count === 1) {
      if (type !== 'IHDR' || size !== 13) fail();
      width = view.getUint32(pos + 8); height = view.getUint32(pos + 12); layerCanvas(width, height);
      channels = bytes[pos+17] === 2 && allowRgb ? 3 : bytes[pos+17] === 6 ? 4 : 0;
      if (bytes[pos + 16] !== 8 || !channels || bytes[pos + 18] || bytes[pos + 19] || bytes[pos + 20]) fail();
    } else if (type === 'IHDR' || type === 'acTL' || type === 'fcTL' || type === 'fdAT' || type === 'tRNS') fail();
    if (data && type !== 'IDAT') afterData = true;
    if (type === 'IDAT') {
      if (afterData) fail();
      data = true; compressed.push(bytes.slice(pos + 8, pos + 8 + size));
    } else if (type === 'PLTE') {
      if (data || palette || !size || size % 3 || size > 768) fail(); palette = true;
    } else if (!['IHDR','IEND'].includes(type) && type[0] === type[0].toUpperCase()) fail();
    pos += size + 12;
    if (type === 'IEND') { if (size || !data || pos !== bytes.length) fail(); ended = true; break; }
  }
  if (!ended) fail();
  const row = width * channels + 1, expected = row * height;
  const reader = new Blob(compressed.map(part => part.buffer as ArrayBuffer)).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      if (total + part.value.length > expected) fail();
      for (let i = 0; i < part.value.length; i++) if ((total + i) % row === 0 && part.value[i] > 4) fail();
      total += part.value.length;
    }
    if (total !== expected) fail();
  } catch (error) { if (error instanceof LayerValidationError) throw error; throw new LayerValidationError('Invalid compressed PNG layer'); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return { width, height };
}

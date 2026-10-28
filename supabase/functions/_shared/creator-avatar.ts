import { pcmSpeechSamples, frameSpeechPcm } from './speech-audio.ts';

export const AVATAR_MODEL = 'kling-avatar-v2';
export const AVATAR_ENDPOINT = 'fal-ai/kling-video/ai-avatar/v2/standard';
export const AVATAR_RATE_USD = 0.0562;
export interface AvatarInputs { imageDataUrl: string; audioDataUrl: string; rightsConfirmed: boolean; inputDigest?: string; acceptedPriceDhb?: number }

function inline(value: unknown, kinds: string[], max: number) {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 + 100) throw new Error('Avatar input is too large');
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || !kinds.includes(match[1]) || match[2].length % 4) throw new Error('Choose a local PNG portrait and PCM WAV audio');
  let binary: string;
  try { binary = atob(match[2]); } catch { throw new Error('Invalid avatar input encoding'); }
  if (!binary.length || binary.length > max || btoa(binary) !== match[2]) throw new Error('Invalid avatar input encoding');
  return { bytes: Uint8Array.from(binary, char => char.charCodeAt(0)), mime: match[1] };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
async function portrait(bytes: Uint8Array, mime: string) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0;
  if (mime === 'image/png' && bytes.length >= 45 && [137,80,78,71,13,10,26,10].every((x,i) => bytes[i] === x)) {
    let pos = 8, first = true, data = false, ended = false, channels = 0;
    const compressed: Uint8Array[] = [];
    while (pos + 12 <= bytes.length) {
      const size = v.getUint32(pos), type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
      if (size > bytes.length - pos - 12) throw new Error('Invalid PNG portrait');
      let crc = 0xffffffff;
      for (let i = pos + 4; i < pos + 8 + size; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
      if (((crc ^ 0xffffffff) >>> 0) !== v.getUint32(pos + 8 + size)) throw new Error('Invalid PNG portrait');
      if (first) {
        if (type !== 'IHDR' || size !== 13) throw new Error('Invalid PNG portrait');
        width = v.getUint32(pos + 8); height = v.getUint32(pos + 12); first = false;
        channels = bytes[pos + 17] === 2 ? 3 : bytes[pos + 17] === 6 ? 4 : 0;
        if (bytes[pos + 16] !== 8 || !channels || bytes[pos + 18] || bytes[pos + 19] || bytes[pos + 20]) throw new Error('Choose a standard RGB or RGBA PNG portrait');
      } else if (type === 'IHDR' || type === 'acTL') throw new Error('Choose a still portrait');
      if (type === 'IDAT') { data = true; compressed.push(bytes.slice(pos + 8, pos + 8 + size)); }
      pos += size + 12;
      if (type === 'IEND') { if (size || !data || pos !== bytes.length) throw new Error('Invalid PNG portrait'); ended = true; break; }
    }
    if (!ended) throw new Error('Invalid PNG portrait');
    if (width !== height || width < 512 || width > 2048) throw new Error('Choose a square PNG portrait, 512–2048 pixels');
    const stream = new Blob(compressed.map(bytes => bytes.buffer as ArrayBuffer)).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const rowBytes = 1 + width * channels, expected = rowBytes * height;
    let total = 0;
    try {
      while (true) {
        const part = await stream.read(); if (part.done) break;
        if (total + part.value.length > expected) throw new Error('Invalid PNG portrait');
        for (let i = 0; i < part.value.length; i++) if ((total + i) % rowBytes === 0 && part.value[i] > 4) throw new Error('Invalid PNG portrait');
        total += part.value.length;
      }
      if (total !== expected) throw new Error('Invalid PNG portrait');
    } finally { await stream.cancel().catch(() => {}); stream.releaseLock(); }
  }
  if (!width || mime !== 'image/png') throw new Error('Choose a square PNG portrait, 512–2048 pixels');
}

function base64(bytes: Uint8Array) {
  let text = '';
  for (let pos = 0; pos < bytes.length; pos += 8192) text += String.fromCharCode(...bytes.subarray(pos, pos + 8192));
  return btoa(text);
}

/** Only inline bytes are accepted. The provider receives these exact prepared bytes. */
export async function prepareAvatar(value: unknown, prompt = '.') {
  if (!value || typeof value !== 'object') throw new Error('Choose a portrait and WAV audio');
  const input = value as AvatarInputs;
  if (input.rightsConfirmed !== true) throw new Error('Confirm permission to animate this portrait and use this audio');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1000) throw new Error('Use a prompt of up to 1000 characters');
  const image = inline(input.imageDataUrl, ['image/png'], 5 * 1024 * 1024);
  await portrait(image.bytes, image.mime);
  const audio = inline(input.audioDataUrl, ['audio/wav', 'audio/x-wav'], 30 * 48000 + 4096);
  const timing = pcmSpeechSamples(audio.bytes.buffer as ArrayBuffer, 24000);
  if (timing.durationSeconds < 5 || timing.durationSeconds > 30) throw new Error('Choose 5–30 seconds of mono 24 kHz 16-bit PCM WAV audio');
  const seconds = Math.ceil(timing.durationSeconds);
  // Canonical whole-second audio keeps the paid duration identical to provider input.
  // The final fraction is silence; speech samples are never truncated or resampled.
  const samples = new Uint8Array(seconds * 48000);
  const view = new DataView(audio.bytes.buffer);
  for (let pos = 12; pos + 8 <= audio.bytes.length;) {
    const size = view.getUint32(pos + 4, true);
    if (String.fromCharCode(...audio.bytes.subarray(pos, pos + 4)) === 'data') samples.set(audio.bytes.subarray(pos + 8, pos + 8 + size));
    pos += 8 + size + size % 2;
  }
  const wav = frameSpeechPcm(samples.buffer, 24000);
  const preparedAudio = `data:audio/wav;base64,${base64(new Uint8Array(wav))}`;
  const digestBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([AVATAR_MODEL, input.imageDataUrl, preparedAudio, prompt])));
  const inputDigest = [...new Uint8Array(digestBytes)].map(x => x.toString(16).padStart(2,'0')).join('');
  return { durationSeconds: seconds, inputDigest, input: { image_url: input.imageDataUrl, audio_url: preparedAudio, prompt, enable_safety_checker: true } };
}

export function verifyAvatarQuote(avatar: AvatarInputs, prepared: { inputDigest: string }, priceDhb: number) {
  if (avatar.inputDigest !== prepared.inputDigest || avatar.acceptedPriceDhb !== priceDhb) throw new Error('The portrait, audio or price changed. Review a new quote before paying.');
}

/**
 * Some browsers (Firefox) hand back encoded video chunks without
 * `metadata.decoderConfig`, and may emit H.264 as Annex B (start codes)
 * instead of the length-prefixed form MP4 needs. mp4-muxer then crashes at
 * finalize reading `decoderConfig.colorSpace`. This fills the config in from
 * the keyframe itself and rewrites Annex B chunks to length-prefixed NALs.
 */

type VideoMuxerCodec = "avc" | "hevc" | "vp9" | "av1";
type ChunkInit = { type: EncodedVideoChunkType; timestamp: number; duration?: number; data: Uint8Array };
type Output = { chunk: EncodedVideoChunk; meta?: EncodedVideoChunkMetadata };

const DEFAULT_COLOR_SPACE: VideoColorSpaceInit = { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false };

/** Split length-prefixed (4 byte) NAL units; null if the bytes are not that shape. */
export function splitLengthPrefixed(bytes: Uint8Array): Uint8Array[] | null {
  const nals: Uint8Array[] = [];
  let i = 0;
  while (i + 4 <= bytes.length) {
    const size = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
    i += 4;
    if (size === 0 || i + size > bytes.length || bytes[i] & 0x80) return null;
    nals.push(bytes.subarray(i, i + size));
    i += size;
  }
  return i === bytes.length && nals.length ? nals : null;
}

/** Split Annex B (00 00 01 / 00 00 00 01 start codes) NAL units. */
export function splitAnnexB(bytes: Uint8Array): Uint8Array[] {
  const starts: Array<{ at: number; code: number }> = [];
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1) {
      const four = i > 0 && bytes[i - 1] === 0;
      starts.push({ at: four ? i - 1 : i, code: four ? 4 : 3 });
      i += 2;
    }
  }
  return starts
    .map((s, n) => bytes.subarray(s.at + s.code, n + 1 < starts.length ? starts[n + 1].at : bytes.length))
    .filter((nal) => nal.length > 0);
}

function isAnnexB(bytes: Uint8Array): boolean {
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 1) return true;
  if (bytes.length >= 3 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1) return !splitLengthPrefixed(bytes);
  return false;
}

export function toLengthPrefixed(nals: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(nals.reduce((sum, nal) => sum + 4 + nal.length, 0));
  let i = 0;
  for (const nal of nals) {
    out[i] = nal.length >>> 24; out[i + 1] = nal.length >>> 16; out[i + 2] = nal.length >>> 8; out[i + 3] = nal.length;
    out.set(nal, i + 4);
    i += 4 + nal.length;
  }
  return out;
}

/** Build an avcC box payload from in-band SPS/PPS NAL units. */
export function avcDecoderConfig(nals: Uint8Array[], width: number, height: number): VideoDecoderConfig | null {
  const sps = nals.filter((nal) => (nal[0] & 0x1f) === 7);
  const pps = nals.filter((nal) => (nal[0] & 0x1f) === 8);
  if (!sps.length || !pps.length || sps[0].length < 4) return null;
  const size = 7 + sps.reduce((s, n) => s + 2 + n.length, 0) + pps.reduce((s, n) => s + 2 + n.length, 0);
  const avcC = new Uint8Array(size);
  let i = 0;
  avcC.set([1, sps[0][1], sps[0][2], sps[0][3], 0xff, 0xe0 | sps.length], 0);
  i = 6;
  for (const nal of sps) { avcC[i] = nal.length >> 8; avcC[i + 1] = nal.length; avcC.set(nal, i + 2); i += 2 + nal.length; }
  avcC[i++] = pps.length;
  for (const nal of pps) { avcC[i] = nal.length >> 8; avcC[i + 1] = nal.length; avcC.set(nal, i + 2); i += 2 + nal.length; }
  const hex = (b: number) => b.toString(16).padStart(2, "0").toUpperCase();
  return {
    codec: `avc1.${hex(sps[0][1])}${hex(sps[0][2])}${hex(sps[0][3])}`,
    codedWidth: width,
    codedHeight: height,
    description: avcC,
    colorSpace: DEFAULT_COLOR_SPACE,
  };
}

function chunkBytes(chunk: EncodedVideoChunk): Uint8Array | null {
  if (typeof chunk.copyTo !== "function" || !chunk.byteLength) return null;
  const bytes = new Uint8Array(chunk.byteLength);
  chunk.copyTo(bytes);
  return bytes;
}

/**
 * Drop empty fields so a partial config a browser sends later can't wipe what
 * the muxer already holds (mp4-muxer merges configs with Object.assign), and
 * complete a colour space with missing fields so the colr box is valid.
 */
export function cleanDecoderConfig<T extends { description?: AllowSharedBufferSource; colorSpace?: VideoColorSpaceInit }>(config: T): T {
  const out = Object.fromEntries(Object.entries(config).filter(([, value]) => value != null)) as T;
  if (out.description && !out.description.byteLength) delete out.description;
  const colorSpace = out.colorSpace;
  if (colorSpace && (colorSpace.primaries == null || colorSpace.transfer == null || colorSpace.matrix == null)) {
    out.colorSpace = {
      primaries: colorSpace.primaries ?? DEFAULT_COLOR_SPACE.primaries,
      transfer: colorSpace.transfer ?? DEFAULT_COLOR_SPACE.transfer,
      matrix: colorSpace.matrix ?? DEFAULT_COLOR_SPACE.matrix,
      fullRange: colorSpace.fullRange ?? false,
    };
  }
  return out;
}

/**
 * Wraps a muxer's addVideoChunk so every chunk reaches it with a usable
 * decoder config. `makeChunk` is injectable for tests.
 */
export function videoDecoderConfigFixer(
  options: { codec: string; muxerCodec: VideoMuxerCodec; width: number; height: number },
  makeChunk: (init: ChunkInit) => EncodedVideoChunk = (init) => new EncodedVideoChunk(init),
) {
  let haveConfig = false;
  let haveDescription = false;
  let annexB = false;
  const fix = (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): Output => {
    let config = meta?.decoderConfig ? cleanDecoderConfig(meta.decoderConfig) : undefined;
    if (options.muxerCodec === "avc") {
      const needDescription = !haveDescription && !config?.description;
      if (annexB || needDescription) {
        const bytes = chunkBytes(chunk);
        if (bytes && (annexB || isAnnexB(bytes))) {
          annexB = true;
          const nals = splitAnnexB(bytes);
          if (needDescription && chunk.type === "key") config = avcDecoderConfig(nals, options.width, options.height) ?? config;
          chunk = makeChunk({ type: chunk.type, timestamp: chunk.timestamp, duration: chunk.duration ?? undefined, data: toLengthPrefixed(nals) });
        } else if (bytes && needDescription && chunk.type === "key") {
          config = avcDecoderConfig(splitLengthPrefixed(bytes) ?? [], options.width, options.height) ?? config;
        }
      }
      // A config without avcC would leave the MP4 unplayable; wait for one that has it.
      if (config && !config.description) config = undefined;
    } else if (!config && !haveConfig && options.muxerCodec !== "hevc") {
      config = { codec: options.codec, codedWidth: options.width, codedHeight: options.height };
    }
    if (config && options.muxerCodec === "vp9" && !config.colorSpace) config = { ...config, colorSpace: DEFAULT_COLOR_SPACE };
    if (config) haveConfig = true;
    if (config?.description) haveDescription = true;
    return { chunk, meta: config ? { ...meta, decoderConfig: config } : meta && { ...meta, decoderConfig: undefined } };
  };
  return Object.assign(fix, { hasConfig: () => haveConfig });
}

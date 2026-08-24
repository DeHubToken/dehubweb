// Parse the ADTS AAC elementary stream Agora's recorder writes.
//
// ADTS is a bare sequence of frames, each carrying its own 7- or 9-byte header
// and no index of any kind. Stripping those headers and recording each frame's
// length is all it takes to feed an MP4 sample table.

const SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000,
  24000, 22050, 16000, 12000, 11025, 8000, 7350,
];

/** Audio samples an AAC-LC access unit represents. */
export const AAC_SAMPLES_PER_FRAME = 1024;

export interface AdtsStream {
  frames: Uint8Array[];
  sampleRate: number;
  channels: number;
  /** AudioSpecificConfig for the esds DecoderSpecificInfo. */
  asc: Uint8Array;
  /** Frames skipped because their header did not parse. */
  resyncs: number;
}

export function isAdts(b: Uint8Array): boolean {
  return b.length > 7 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0;
}

/**
 * Build the 2-byte AudioSpecificConfig an MP4 decoder needs.
 *
 * ADTS stores the audio object type biased by one (`profile`), so it has to be
 * added back — getting this wrong yields a file that demuxes cleanly and then
 * refuses to decode.
 */
function audioSpecificConfig(profile: number, freqIndex: number, channels: number): Uint8Array {
  const objectType = profile + 1;
  return Uint8Array.of(
    ((objectType & 0x1f) << 3) | ((freqIndex >> 1) & 0x07),
    ((freqIndex & 0x01) << 7) | ((channels & 0x0f) << 3),
  );
}

export function parseAdts(b: Uint8Array): AdtsStream {
  const frames: Uint8Array[] = [];
  let sampleRate = 0;
  let channels = 0;
  let asc: Uint8Array | null = null;
  let resyncs = 0;
  let pos = 0;

  while (pos + 7 <= b.length) {
    // Syncword is 12 bits; the next 4 (id, layer, protection) must show layer 0.
    if (!(b[pos] === 0xff && (b[pos + 1] & 0xf6) === 0xf0)) {
      pos++;
      resyncs++;
      continue;
    }

    const protectionAbsent = b[pos + 1] & 0x01;
    const profile = (b[pos + 2] >> 6) & 0x03;
    const freqIndex = (b[pos + 2] >> 2) & 0x0f;
    const channelConfig = ((b[pos + 2] & 0x01) << 2) | ((b[pos + 3] >> 6) & 0x03);
    const frameLength =
      ((b[pos + 3] & 0x03) << 11) | (b[pos + 4] << 3) | ((b[pos + 5] >> 5) & 0x07);

    const headerLength = protectionAbsent ? 7 : 9;
    if (
      freqIndex >= SAMPLE_RATES.length ||
      channelConfig === 0 ||
      frameLength <= headerLength ||
      pos + frameLength > b.length
    ) {
      pos++;
      resyncs++;
      continue;
    }

    if (!asc) {
      sampleRate = SAMPLE_RATES[freqIndex];
      channels = channelConfig;
      asc = audioSpecificConfig(profile, freqIndex, channelConfig);
    }

    frames.push(b.subarray(pos + headerLength, pos + frameLength));
    pos += frameLength;
  }

  if (!asc || !frames.length) throw new Error('no ADTS frames found');
  return { frames, sampleRate, channels, asc, resyncs };
}

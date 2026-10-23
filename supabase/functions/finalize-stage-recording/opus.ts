// Lift the Opus packets out of a MediaRecorder WebM, untouched, so they can be
// filed in an MP4 instead.
//
// Why bother: an iPhone plays recordings through AVPlayer, and AVPlayer has no
// WebM demuxer at all — Safari only plays WebM because WebKit brought its own.
// Every stage hosted from a browser was a dead play button in the iOS app.
// AVPlayer does play Opus in an MP4 (iOS 17+), and so do Chrome, Firefox,
// Safari 17+ and media3, so one MP4 serves every player we ship, with the audio
// bytes exactly as the host's browser encoded them.

import { ID, readChildren, readSize, readUint, type RawElement } from './ebml.ts';
import { opusPacketSamples, parseOpusHead, type OpusHead } from './mp4.ts';

const TrackEntry = 0xae;
const TrackNumber = 0xd7;
const CodecID = 0x86;
const CodecPrivate = 0x63a2;
const Block = 0xa1;

export interface OpusStream {
  head: OpusHead;
  packets: Uint8Array[];
  durations: number[];
  /** Streams after the first, appended because a voice switch restarted the recorder. */
  joinedStreams: number;
  /** Streams that could not be joined (different channel layout) and were left out. */
  droppedStreams: number;
}

interface Track {
  number: number;
  head: OpusHead;
}

function opusTrack(b: Uint8Array, tracks: RawElement): Track | null {
  for (const entry of readChildren(b, tracks.dataStart, tracks.end)) {
    if (entry.id !== TrackEntry) continue;
    let number = 0;
    let codec = '';
    let priv: Uint8Array | null = null;
    for (const f of readChildren(b, entry.dataStart, entry.end)) {
      if (f.id === TrackNumber) number = readUint(b, f.dataStart, f.end - f.dataStart);
      else if (f.id === CodecID) codec = String.fromCharCode(...b.subarray(f.dataStart, f.end));
      else if (f.id === CodecPrivate) priv = b.subarray(f.dataStart, f.end);
    }
    if (codec.replace(/\0+$/, '') === 'A_OPUS' && number && priv) {
      return { number, head: parseOpusHead(priv) };
    }
  }
  return null;
}

/** The packets of one Segment's clusters that belong to `track`, in order. */
function segmentPackets(b: Uint8Array, kids: RawElement[], track: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const cluster of kids) {
    if (cluster.id !== ID.Cluster) continue;
    for (const el of readChildren(b, cluster.dataStart, cluster.end)) {
      let at: number;
      let end: number;
      if (el.id === ID.SimpleBlock) {
        at = el.dataStart;
        end = el.end;
      } else if (el.id === ID.BlockGroup) {
        const inner = readChildren(b, el.dataStart, el.end).find((x) => x.id === Block);
        if (!inner) continue;
        at = inner.dataStart;
        end = inner.end;
      } else {
        continue;
      }
      // Block header: track number (vint), int16 relative timestamp, flags.
      const t = readSize(b, at);
      if (t.size !== track) continue;
      const flags = b[at + t.width + 2];
      // Lacing packs several packets into one block. MediaRecorder never does
      // it for audio; refusing beats filing a laced block as one packet.
      if (flags & 0x06) throw new Error('laced blocks are not supported');
      const payload = b.subarray(at + t.width + 3, end);
      if (payload.length) out.push(payload);
    }
  }
  return out;
}

/**
 * Every Opus packet in the file. A voice-effect switch used to restart the
 * recorder, which appends a second complete WebM to the first; its packets
 * are joined on rather than dropped, as long as it decodes the same way.
 */
export function extractOpus(b: Uint8Array): OpusStream {
  const segments: RawElement[][] = [];
  const top = readChildren(b, 0, b.length);
  if (!top.some((e) => e.id === ID.EBML)) throw new Error('not a WebM/Matroska file');

  // A sized Segment ends where it says, so a following stream sits beside it at
  // the top level. An unknown-size one runs to EOF, so the next stream's EBML
  // header and Segment turn up as its children instead. Take both shapes.
  for (const first of top.filter((e) => e.id === ID.Segment)) {
    let segment: RawElement | undefined = first;
    while (segment) {
      const kids = readChildren(b, segment.dataStart, segment.end);
      const next = kids.findIndex((e) => e.id === ID.EBML || e.id === ID.Segment);
      segments.push(next >= 0 ? kids.slice(0, next) : kids);
      segment = next >= 0 ? kids.slice(next).find((e) => e.id === ID.Segment) : undefined;
    }
  }
  if (!segments.length) throw new Error('no Segment');

  let head: OpusHead | null = null;
  const packets: Uint8Array[] = [];
  let joined = 0;
  let dropped = 0;
  for (const kids of segments) {
    const tracks = kids.find((e) => e.id === ID.Tracks);
    const track = tracks ? opusTrack(b, tracks) : null;
    if (!track) {
      if (!head) throw new Error('no Opus track');
      dropped++;
      continue;
    }
    if (head && (track.head.channels !== head.channels || track.head.mappingFamily !== head.mappingFamily)) {
      dropped++;
      continue;
    }
    const got = segmentPackets(b, kids, track.number);
    if (!got.length) continue;
    if (head) joined++;
    else head = track.head;
    for (const p of got) packets.push(p);
  }
  if (!head || !packets.length) throw new Error('no Opus packets');

  const durations = packets.map(opusPacketSamples);
  // A packet whose TOC makes no sense is not worth failing the file over, but
  // it must still occupy time. Give it the length its neighbours have.
  const fallback = durations.find((d) => d > 0) ?? 960;
  for (let i = 0; i < durations.length; i++) if (!durations[i]) durations[i] = fallback;

  return { head, packets, durations, joinedStreams: joined, droppedStreams: dropped };
}

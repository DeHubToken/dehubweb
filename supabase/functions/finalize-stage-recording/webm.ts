// Give a MediaRecorder WebM the two things it was never written with: a
// Duration in Info, and a Cues index over the Clusters.
//
// Nothing is transcoded and no block is touched — the audio bytes come out the
// far side byte-identical. Only the container's bookkeeping is rebuilt, so
// every browser that plays the original plays the repaired file exactly as
// before, and media3's MatroskaExtractor gains the index it needs to seek.

import {
  ID, concat, element, readChildren, readId, readSize, readUint, uintBytes,
  writeId, writeSize, type RawElement,
} from './ebml.ts';

/** Positions and sizes are pinned to this width — see writeSize(). */
const W = 8;

/** Bytes of overhead an element adds on top of its body. */
const overhead = (id: number) => writeId(id).length + W;

function f64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value, false);
  return out;
}

interface Block {
  /** Absolute timestamp in TimecodeScale units. */
  time: number;
}

/** Read the blocks of one cluster. Only their timestamps matter here. */
function clusterBlocks(b: Uint8Array, cluster: RawElement, clusterTime: number): Block[] {
  const out: Block[] = [];
  for (const el of readChildren(b, cluster.dataStart, cluster.end)) {
    let at: number;
    if (el.id === ID.SimpleBlock) {
      at = el.dataStart;
    } else if (el.id === ID.BlockGroup) {
      const inner = readChildren(b, el.dataStart, el.end).find((x) => x.id === 0xa1);
      if (!inner) continue;
      at = inner.dataStart;
    } else {
      continue;
    }
    // Block header: track number (vint), signed int16 relative timestamp, flags.
    const track = readSize(b, at);
    const p = at + track.width;
    const rel = (((b[p] << 8) | b[p + 1]) << 16) >> 16;
    out.push({ time: clusterTime + rel });
  }
  return out;
}

function clusterTimecode(b: Uint8Array, cluster: RawElement): number {
  for (const el of readChildren(b, cluster.dataStart, cluster.end)) {
    if (el.id === ID.Timecode) return readUint(b, el.dataStart, el.end - el.dataStart);
  }
  throw new Error('cluster has no Timecode');
}

/** First TrackNumber in Tracks, which is the track Cues will point at. */
function firstTrackNumber(b: Uint8Array, tracks: RawElement): number {
  for (const entry of readChildren(b, tracks.dataStart, tracks.end)) {
    if (entry.id !== 0xae) continue;
    for (const field of readChildren(b, entry.dataStart, entry.end)) {
      if (field.id === 0xd7) return readUint(b, field.dataStart, field.end - field.dataStart);
    }
  }
  return 1;
}

/**
 * How long the final frame lasts, taken as the median gap between consecutive
 * blocks.
 *
 * Reading it off the data beats decoding an Opus TOC: it needs no codec table,
 * it survives a container that is not Opus at all, and it is immune to the
 * packing Chrome actually uses (three 20 ms CELT frames in one 60 ms packet,
 * which a naive TOC read reports as 20 ms and would leave the duration short).
 */
function medianFrameDuration(times: number[]): number {
  const deltas: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 0) deltas.push(d);
  }
  if (!deltas.length) return 20;
  deltas.sort((a, b) => a - b);
  return deltas[deltas.length >> 1];
}

export interface WebmRepair {
  bytes: Uint8Array;
  durationMs: number;
  clusters: number;
  blocks: number;
  /** Set when a second concatenated stream was found and dropped. */
  truncatedAtSecondStream: boolean;
}

export class AlreadyIndexed extends Error {}

export function repairWebm(b: Uint8Array): WebmRepair {
  const top = readChildren(b, 0, b.length);
  const header = top.find((e) => e.id === ID.EBML);
  const segment = top.find((e) => e.id === ID.Segment);
  if (!header || !segment) throw new Error('not a WebM/Matroska file');

  // Switching voice effects mid-recording restarts the MediaRecorder and
  // appends a whole second, self-contained WebM stream to the same file. Every
  // player already stops at the end of the first Segment, so repair that and
  // drop the rest: carrying the second stream's own unknown-size Segment
  // through would swallow the Cues written after it and undo the whole repair.
  const all = readChildren(b, segment.dataStart, segment.end);
  const secondStream = all.findIndex((e) => e.id === ID.EBML || e.id === ID.Segment);
  const children = secondStream >= 0 ? all.slice(0, secondStream) : all;

  const info = children.find((e) => e.id === ID.Info);
  const tracks = children.find((e) => e.id === ID.Tracks);
  const clusters = children.filter((e) => e.id === ID.Cluster);
  if (!info || !tracks) throw new Error('segment has no Info or no Tracks');
  if (!clusters.length) throw new Error('segment has no clusters');

  const hasCues = children.some((e) => e.id === ID.Cues);
  const hasDuration = readChildren(b, info.dataStart, info.end).some((e) => e.id === ID.Duration);
  if (hasCues && hasDuration) throw new AlreadyIndexed('already has Cues and a Duration');

  // ── Measure ───────────────────────────────────────────────────────────────
  const times = clusters.map((c) => clusterTimecode(b, c));
  const allBlocks: number[] = [];
  for (let i = 0; i < clusters.length; i++) {
    for (const blk of clusterBlocks(b, clusters[i], times[i])) allBlocks.push(blk.time);
  }
  if (!allBlocks.length) throw new Error('segment has no blocks');
  allBlocks.sort((x, y) => x - y);
  const durationMs = allBlocks[allBlocks.length - 1] + medianFrameDuration(allBlocks);
  const trackNumber = firstTrackNumber(b, tracks);

  // ── Rebuild ───────────────────────────────────────────────────────────────
  // Info keeps its original children (TimecodeScale, MuxingApp, WritingApp) and
  // gains a Duration; a stale Duration, if one ever appears, is replaced.
  const infoKids = readChildren(b, info.dataStart, info.end)
    .filter((e) => e.id !== ID.Duration)
    .map((e) => b.subarray(e.start, e.end));
  const newInfo = element(ID.Info, concat([...infoKids, element(ID.Duration, f64(durationMs), W)]), W);
  const newTracks = b.subarray(tracks.start, tracks.end);

  // Anything else the muxer wrote (Tags, Chapters, Attachments) rides along
  // untouched. A stale SeekHead, Cues or Void is dropped — they are rebuilt.
  // Nothing of unknown size is ever copied through: on re-parse it would run to
  // the end of the file and eat everything written after it.
  const passthrough = children
    .filter((e) => !e.unknownSize)
    .filter((e) => ![ID.Info, ID.Tracks, ID.Cluster, ID.SeekHead, ID.Cues, ID.Void].includes(e.id as never))
    .map((e) => b.subarray(e.start, e.end));

  // Clusters: identical bodies, but with their length written down.
  const clusterBodies = clusters.map((c) => b.subarray(c.dataStart, c.end));
  const clusterSizes = clusterBodies.map((body) => overhead(ID.Cluster) + body.length);

  const seekHead = (infoPos: number, tracksPos: number, cuesPos: number) => {
    const seek = (targetId: number, pos: number) =>
      element(ID.Seek, concat([
        element(ID.SeekID, writeId(targetId), W),
        element(ID.SeekPosition, uintBytes(pos, W), W),
      ]), W);
    return element(ID.SeekHead, concat([
      seek(ID.Info, infoPos),
      seek(ID.Tracks, tracksPos),
      seek(ID.Cues, cuesPos),
    ]), W);
  };

  const cues = (positions: number[]) =>
    element(ID.Cues, concat(clusters.map((_, i) =>
      element(ID.CuePoint, concat([
        element(ID.CueTime, uintBytes(times[i], W), W),
        element(ID.CueTrackPositions, concat([
          element(ID.CueTrack, uintBytes(trackNumber, W), W),
          element(ID.CueClusterPosition, uintBytes(positions[i], W), W),
        ]), W),
      ]), W),
    )), W);

  // Every size and position is a fixed width, so the layout does not move when
  // the values are filled in. Measure the shape with placeholders, compute the
  // real offsets from those lengths, then write once.
  const zeros = clusters.map(() => 0);
  const seekHeadLen = seekHead(0, 0, 0).length;
  const cuesLen = cues(zeros).length;
  const passthroughLen = passthrough.reduce((n, p) => n + p.length, 0);

  const infoPos = seekHeadLen;
  const tracksPos = infoPos + newInfo.length;
  const cuesPos = tracksPos + newTracks.length + passthroughLen;
  let at = cuesPos + cuesLen;
  const clusterPositions = clusterSizes.map((size) => {
    const pos = at;
    at += size;
    return pos;
  });

  const finalSeekHead = seekHead(infoPos, tracksPos, cuesPos);
  const finalCues = cues(clusterPositions);
  if (finalSeekHead.length !== seekHeadLen || finalCues.length !== cuesLen) {
    throw new Error('fixed-width layout shifted — this should be impossible');
  }

  // Assembled by pushing, never by spreading — a long stage runs to thousands
  // of clusters, and a spread of that many arguments overflows the call stack.
  const segmentParts = [finalSeekHead, newInfo, newTracks];
  for (const p of passthrough) segmentParts.push(p);
  segmentParts.push(finalCues);
  for (const body of clusterBodies) {
    segmentParts.push(writeId(ID.Cluster), writeSize(body.length, W), body);
  }
  const segmentBody = concat(segmentParts);
  if (segmentBody.length !== at) throw new Error('segment length disagrees with computed offsets');

  return {
    bytes: concat([
      b.subarray(header.start, header.end),
      writeId(ID.Segment),
      writeSize(segmentBody.length, W),
      segmentBody,
    ]),
    durationMs,
    clusters: clusters.length,
    blocks: allBlocks.length,
    truncatedAtSecondStream: secondStream >= 0,
  };
}

/**
 * Stage recording: what the host's recorder listens to, and what it writes.
 *
 * Kept out of StageContext so the mixing and the format choice can be tested
 * without a stage, a microphone or Agora.
 */

/**
 * The recorder's own mixing desk.
 *
 * The recorder used to take the host's processed microphone and nothing else,
 * which is the stream Agora publishes. Every guest speaker was missing from the
 * recording and the transcript. Remote speakers cannot be added to that stream
 * (it is what goes out to the room, so mixing them in would play everyone back
 * to themselves), so the recorder gets a graph of its own: the host's processed
 * stream and each remote speaker's track, summed into a destination nobody
 * publishes.
 *
 * It also outlives a voice-effect switch. Rebuilding the effect replaces the
 * processed stream, which used to mean stopping the recorder and starting a
 * second one: a second WebM glued onto the first, which every player stops at.
 * Now only the host's input is re-plugged and the file stays one stream.
 */
export interface RecordingMix {
  ctx: AudioContext;
  dest: MediaStreamAudioDestinationNode;
  local: MediaStreamAudioSourceNode | null;
  remotes: Map<string | number, MediaStreamAudioSourceNode>;
}

export function createRecordingMix(): RecordingMix | null {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    // Built after the Go Live press with the mic already open, so browsers let
    // it run; resume() covers any that start it suspended anyway.
    void ctx.resume().catch(() => {});
    return { ctx, dest: ctx.createMediaStreamDestination(), local: null, remotes: new Map() };
  } catch (err) {
    console.warn('[Stage] Recording mix unavailable:', err);
    return null;
  }
}

export function plugIntoMix(mix: RecordingMix, stream: MediaStream): MediaStreamAudioSourceNode | null {
  try {
    const src = mix.ctx.createMediaStreamSource(stream);
    src.connect(mix.dest);
    return src;
  } catch (err) {
    console.warn('[Stage] Could not add audio to the recording:', err);
    return null;
  }
}

export function setMixLocal(mix: RecordingMix, stream: MediaStream | null) {
  try { mix.local?.disconnect(); } catch { /* already gone */ }
  mix.local = stream ? plugIntoMix(mix, stream) : null;
}

export function dropMixRemote(mix: RecordingMix, uid: string | number) {
  const src = mix.remotes.get(uid);
  if (!src) return;
  try { src.disconnect(); } catch { /* already gone */ }
  mix.remotes.delete(uid);
}

export function addMixRemote(mix: RecordingMix, uid: string | number, track: { getMediaStreamTrack?: () => MediaStreamTrack } | null | undefined) {
  const mediaTrack = track?.getMediaStreamTrack?.();
  if (!mediaTrack) return;
  dropMixRemote(mix, uid);
  const src = plugIntoMix(mix, new MediaStream([mediaTrack]));
  if (src) mix.remotes.set(uid, src);
}

export function closeRecordingMix(mix: RecordingMix | null | undefined) {
  if (!mix) return;
  setMixLocal(mix, null);
  for (const uid of [...mix.remotes.keys()]) dropMixRemote(mix, uid);
  void mix.ctx.close().catch(() => {});
}

/** The mix each recorder is listening to, closed once that recorder is done. */
export const recorderMixes = new WeakMap<MediaRecorder, RecordingMix>();

/** Formats to record in, best first. */
export const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'];

/**
 * The first format this browser will actually record. Safari before 18.4
 * records MP4 only, and `new MediaRecorder(stream, { mimeType: 'audio/webm' })`
 * throws there, so an iPhone or Mac host used to get no recording at all,
 * with nothing on screen to say so.
 */
export function pickRecordingType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return RECORDING_TYPES.find((type) => {
    try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
  });
}

/**
 * 64 kbps Opus is beyond transparent for speech and still fine for music. It
 * halves what an hour-long stage uploads from the host's connection, and keeps
 * the server-side MP4 conversion well inside an edge function's memory.
 */
export const RECORDING_BITS_PER_SECOND = 64_000;

/** The file a recording is uploaded as, from what the recorder actually wrote. */
export function recordingFileFor(mimeType: string): { ext: 'webm' | 'mp4'; contentType: string } {
  return /mp4|aac/i.test(mimeType)
    ? { ext: 'mp4', contentType: 'audio/mp4' }
    : { ext: 'webm', contentType: 'audio/webm' };
}

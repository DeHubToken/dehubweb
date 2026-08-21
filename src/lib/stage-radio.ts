/**
 * stage-radio — bridge a live radio stream into a Stage's Agora channel
 * =====================================================================
 *
 * A host DJing a stage needs the room to hear the station they picked, not a
 * description of it. This module owns the one piece that makes that possible:
 * a single <audio> element whose output is forked into two places — an Agora
 * publishable MediaStreamTrack (what the audience hears) and the host's own
 * speakers (what the host hears).
 *
 * Three constraints shape everything below.
 *
 * **`createMediaElementSource` can only ever be called once per element.** So
 * the element, the context and the source node are module-scope and built once,
 * then reused for every station and every stage. Changing station is an `src`
 * swap — the graph downstream never moves, which is why the published track
 * survives it without a republish.
 *
 * **`crossOrigin = 'anonymous'` is mandatory.** Without it the element taints
 * the graph and the destination carries silence — the stream would play on the
 * host's machine and reach nobody. Stations that fail CORS fail to load at all,
 * which is the same set the DeHub Radio page already refuses, so this adds no
 * new failure mode.
 *
 * **The published track must be freshly built per broadcast.** Agora's
 * `close()` stops the underlying MediaStreamTrack, and a track taken from a
 * MediaStreamAudioDestinationNode cannot be revived once stopped — reusing one
 * would make the second broadcast of a session silent. Each session therefore
 * gets its own destination node (cheap) hung off the same permanent gain.
 *
 * Deliberately NOT routed through the voice-effect graph the way TTS and the
 * soundboard are, for two reasons: that graph is gated shut by the mute button
 * (a muted host playing music should still be heard), and switching voice
 * effect tears the graph's AudioContext down and rebuilds it, which would kill
 * the music mid-song. The cost is the same one screen audio pays — radio is
 * outside the host-side recording, which taps the effect graph rather than the
 * channel. That is the right side of the trade here anyway: a stage recording
 * should not be a copy of somebody else's broadcast.
 */

export type StageRadioStatus = 'idle' | 'connecting' | 'live' | 'error';

/** Narrow view of a radio-browser station — all a stage needs to play and name one. */
export interface StageRadioStation {
  id: string;
  name: string;
  url: string;
  favicon?: string;
  country?: string;
  countrycode?: string;
  tags?: string;
  bitrate?: number;
}

let audioEl: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
/** Level the room hears. Permanent — every session's destination hangs off it. */
let broadcastGain: GainNode | null = null;
/** Level the host hears locally. Permanent, routed to ctx.destination. */
let monitorGain: GainNode | null = null;
/** This broadcast's tap. Rebuilt per session; see the header note on close(). */
let destination: MediaStreamAudioDestinationNode | null = null;

let statusHandler: ((status: StageRadioStatus, message?: string) => void) | null = null;

function emit(status: StageRadioStatus, message?: string) {
  statusHandler?.(status, message);
}

function buildGraph(): { audio: HTMLAudioElement; ctx: AudioContext } {
  if (audioEl && ctx) return { audio: audioEl, ctx };

  const audio = new Audio();
  audio.crossOrigin = 'anonymous';
  audio.preload = 'none';
  // The element itself is never heard directly — everything the host hears
  // comes back through monitorGain — so it stays at unity and the two gain
  // nodes do all the level work.
  audio.volume = 1;

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

  const src = audioContext.createMediaElementSource(audio);
  const broadcast = audioContext.createGain();
  broadcast.gain.value = 0.8;
  const monitor = audioContext.createGain();
  monitor.gain.value = 0.6;

  // Two independent branches off the source, not a chain: turning the room's
  // level down must not also take it out of the host's own headphones, which is
  // exactly the moment a host is talking over a bed of music and still needs to
  // hear it.
  src.connect(broadcast);
  src.connect(monitor);
  monitor.connect(audioContext.destination);

  // A live stream has no natural end: 'ended' means the server dropped us, not
  // that the song finished, so it reports as a failure like the rest.
  audio.addEventListener('playing', () => emit('live'));
  audio.addEventListener('waiting', () => emit('connecting'));
  audio.addEventListener('stalled', () => emit('connecting'));
  audio.addEventListener('error', () => emit('error', 'Stream unavailable'));
  audio.addEventListener('ended', () => emit('error', 'Stream ended'));

  audioEl = audio;
  ctx = audioContext;
  sourceNode = src;
  broadcastGain = broadcast;
  monitorGain = monitor;

  return { audio, ctx: audioContext };
}

/**
 * Open a broadcast tap and return the MediaStreamTrack to hand Agora.
 * Call once per broadcast session, before the first station starts.
 */
export function openStageRadioTap(): MediaStreamTrack {
  const { ctx: audioContext } = buildGraph();
  // A tap handed to Agora out of a parked context renders silence until
  // something resumes it. Called from the same gesture as the first station, so
  // resuming here is allowed and removes the ordering question entirely.
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  if (!destination) {
    destination = audioContext.createMediaStreamDestination();
    broadcastGain!.connect(destination);
  }
  return destination.stream.getAudioTracks()[0];
}

/** Close this session's tap. The Agora track built from it is dead after this. */
export function closeStageRadioTap(): void {
  if (!destination) return;
  try { broadcastGain?.disconnect(destination); } catch { /* already gone */ }
  destination = null;
}

/**
 * Point the element at a station and start it.
 * Must be called from a user gesture — the AudioContext is resumed here, and a
 * context still parked when audio starts renders silence into the tap.
 */
export async function playStageRadioStream(
  url: string,
  onStatus?: (status: StageRadioStatus, message?: string) => void,
): Promise<void> {
  const { audio, ctx: audioContext } = buildGraph();
  if (onStatus) statusHandler = onStatus;

  emit('connecting');
  if (audioContext.state === 'suspended') {
    try { await audioContext.resume(); } catch { /* gesture-backed; best effort */ }
  }

  audio.src = url;
  audio.load();
  try {
    await audio.play();
  } catch {
    // A rejected play() on a stream that is merely slow still fires 'playing'
    // later, so the error listener owns the failure path rather than this catch.
  }
}

/** Stop playback and park the graph. The tap stays open unless closed separately. */
export function stopStageRadioStream(): void {
  const audio = audioEl;
  if (audio) {
    audio.pause();
    // removeAttribute + load, not `src = ''`: an empty string resolves against
    // the page URL and makes the element fetch the SPA's own HTML, which then
    // fires a spurious media error.
    audio.removeAttribute('src');
    audio.load();
  }
  // Parking the context stops it holding the device's audio hardware open for
  // the rest of the session. Never close() it — the source node above cannot be
  // rebuilt on this element.
  if (ctx?.state === 'running') ctx.suspend().catch(() => {});
  // Report before dropping the handler, or the last status the caller hears is
  // whatever the dying stream said on its way out.
  emit('idle');
  statusHandler = null;
}

/** What the room hears, 0–1. */
export function setStageRadioBroadcastLevel(level: number): void {
  if (!broadcastGain || !ctx) return;
  broadcastGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)), ctx.currentTime, 0.05);
}

/** What the host hears locally, 0–1. Zero for a host on speakers with a live mic. */
export function setStageRadioMonitorLevel(level: number): void {
  if (!monitorGain || !ctx) return;
  monitorGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)), ctx.currentTime, 0.05);
}

/** Test seam / teardown for the whole module. Not used in normal operation. */
export function teardownStageRadio(): void {
  stopStageRadioStream();
  closeStageRadioTap();
  try { sourceNode?.disconnect(); } catch { /* noop */ }
  try { broadcastGain?.disconnect(); } catch { /* noop */ }
  try { monitorGain?.disconnect(); } catch { /* noop */ }
}

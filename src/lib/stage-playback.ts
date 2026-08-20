/**
 * Stage recording playback
 * ========================
 * One engine for every place a stage recording plays: the "Listen back" chip
 * on a post, the Stages modal's past-stage list, and the Recorded tab. They
 * used to be three separate implementations of the same awkward job, which is
 * why only one of them had a seekable waveform and only one of them survived
 * navigating away.
 *
 * One `<audio>` at module scope, not in a context. A feed can mount dozens of
 * play buttons and two recordings talking over each other is never what was
 * wanted — pressing play anywhere stops whatever else was playing, and every
 * mounted control subscribes to the same state so they all agree.
 *
 * Audio deliberately survives the button unmounting: these controls live in
 * scrolling feeds and on a page that can be navigated away from, and
 * StageRecordingMiniPlayer is the corner player that keeps it reachable.
 *
 * ── The webm duration problem, which shapes most of this file ──
 *
 * MediaRecorder webm blobs are unreliable about duration: some report
 * Infinity, others a bogus tiny finite value (the length of the first
 * cluster). Either way `currentTime / duration` races to 100% and the waveform
 * lights up fully while the audio is still playing. So duration is resolved in
 * priority order — the browser's value once forced and trusted, then the live
 * element duration if it is not obviously wrong, then the stage's own
 * started_at/ended_at span. `seekable.end()` is deliberately not used: for
 * these files it reports the buffered range, which is another way progress
 * runs ahead of the sound.
 *
 * @module lib/stage-playback
 */

import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/** The little a recording needs to be playable. Any AudioSpace satisfies it. */
export interface StagePlayable {
  id: string;
  title?: string | null;
  recording_url?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
}

export interface StagePlaybackState {
  /** Stage whose recording is loaded, or null when nothing is playing. */
  spaceId: string | null;
  title: string;
  loading: boolean;
  /** 0–1, quantized to 0.1% so identical values bail out of React. */
  progress: number;
  /** 0–1 average level, quantized to 1/50ths and sampled at ~10Hz. */
  volume: number;
  /** Formatted remaining time, e.g. "-3:21". Empty when unknown. */
  timeLeft: string;
}

const IDLE: StagePlaybackState = {
  spaceId: null,
  title: '',
  loading: false,
  progress: 0,
  volume: 0,
  timeLeft: '',
};

let state: StagePlaybackState = IDLE;
const subscribers = new Set<(next: StagePlaybackState) => void>();

function publish(patch: Partial<StagePlaybackState>) {
  const next = { ...state, ...patch };
  if (
    next.spaceId === state.spaceId &&
    next.title === state.title &&
    next.loading === state.loading &&
    next.progress === state.progress &&
    next.volume === state.volume &&
    next.timeLeft === state.timeLeft
  ) {
    return;
  }
  state = next;
  for (const notify of subscribers) notify(state);
}

// ── The element and its analyser graph ──────────────────────────────────────
//
// Both are created once and reused. createMediaElementSource can only ever be
// called once per element, so building the graph per play — which two of the
// three old implementations did, each with its own element — meant a fresh
// source and analyser on every press, leaked onto a shared AudioContext.

let audioEl: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let freqData: Uint8Array | null = null;

let lastVolumeAt = 0;
let rafId = 0;
let endTimeout: ReturnType<typeof setTimeout> | null = null;

/** Seconds derived from started_at/ended_at — the fallback duration. */
let estimatedDuration = 0;
/** The browser's duration once it has been forced out of it. 0 = unknown. */
let realDuration = 0;
/** True while seeking to the end to force duration out; currentTime is junk. */
let forcingDuration = false;
/** A scrub that arrived before a duration was known, applied once one is. */
let pendingSeekRatio: number | null = null;

function ensureAudio(): HTMLAudioElement {
  if (audioEl) return audioEl;
  const el = new Audio();
  el.preload = 'none';
  // Required for the analyser: a media element without it taints the WebAudio
  // graph and the source node outputs silence. The recordings bucket serves
  // permissive CORS, so this costs nothing.
  el.crossOrigin = 'anonymous';
  el.addEventListener('error', () => {
    if (!state.spaceId) return;
    toast.error('That recording could not be played');
    stopStageRecording();
  });
  el.addEventListener('durationchange', () => {
    if (realDuration === 0 && isFinite(el.duration) && el.duration > 0) {
      realDuration = el.duration;
    }
  });
  el.addEventListener('ended', handleEnded);
  audioEl = el;
  return el;
}

/**
 * Wire the analyser on first play. Deferred to a user gesture because an
 * AudioContext constructed before one starts suspended.
 */
function ensureGraph(el: HTMLAudioElement) {
  if (analyser) {
    void audioCtx?.resume();
    return;
  }
  try {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(el);
    const node = ctx.createAnalyser();
    node.fftSize = 256;
    source.connect(node);
    node.connect(ctx.destination);
    audioCtx = ctx;
    analyser = node;
    freqData = new Uint8Array(node.frequencyBinCount);
    void ctx.resume();
  } catch {
    // No WebAudio (or the element is already routed): play on without the
    // level meter rather than refusing to play at all.
    analyser = null;
  }
}

function durationLooksBogus(d: number): boolean {
  return !isFinite(d) || d <= 0 || (estimatedDuration > 5 && d < estimatedDuration * 0.5);
}

function resolveDuration(): number {
  if (realDuration > 0) return realDuration;
  const d = audioEl?.duration ?? 0;
  if (!durationLooksBogus(d)) return d;
  return estimatedDuration;
}

function applyPendingSeek() {
  if (pendingSeekRatio === null || !audioEl) return;
  const dur = resolveDuration();
  if (isFinite(dur) && dur > 0) {
    audioEl.currentTime = pendingSeekRatio * dur;
    pendingSeekRatio = null;
  }
}

/**
 * Seeking past the end forces the browser to compute the true duration, which
 * it then reports. Reset to the start (or the pending scrub position) once it
 * lands.
 */
function resolveRealDuration() {
  const el = audioEl;
  if (!el || realDuration > 0) return;

  if (!durationLooksBogus(el.duration)) {
    realDuration = el.duration;
    applyPendingSeek();
    return;
  }

  const onForcedTimeUpdate = () => {
    el.removeEventListener('timeupdate', onForcedTimeUpdate);
    if (isFinite(el.duration) && el.duration > 0) realDuration = el.duration;
    el.currentTime = pendingSeekRatio !== null && realDuration > 0 ? pendingSeekRatio * realDuration : 0;
    pendingSeekRatio = null;
    forcingDuration = false;
  };
  forcingDuration = true;
  el.addEventListener('timeupdate', onForcedTimeUpdate);
  try {
    el.currentTime = 1e101;
  } catch {
    forcingDuration = false;
    el.removeEventListener('timeupdate', onForcedTimeUpdate);
  }
}

function handleEnded() {
  // Ignore the synthetic `ended` thrown by the seek-to-end duration probe.
  if (forcingDuration) return;
  cancelAnimationFrame(rafId);
  // Let the waveform show a full bar for a beat before it clears, rather than
  // snapping back to empty the instant the audio stops.
  publish({ progress: 1, volume: 0, timeLeft: '-0:00' });
  endTimeout = setTimeout(() => {
    endTimeout = null;
    publish(IDLE);
  }, 380);
}

/**
 * The pump runs at frame rate for smooth analysis, but the values it publishes
 * are quantized — volume to 1/50ths at ~10Hz, progress to 0.1% — so React
 * bails on identical values. Unquantized, this re-rendered a twenty-row list
 * at 60fps for the length of the recording.
 */
function pump() {
  const el = audioEl;
  if (!el) return;

  const now = performance.now();
  if (analyser && freqData && now - lastVolumeAt >= 100) {
    lastVolumeAt = now;
    analyser.getByteFrequencyData(freqData);
    let sum = 0;
    for (let i = 0; i < freqData.length; i++) sum += freqData[i];
    publish({ volume: Math.round((sum / freqData.length / 255) * 50) / 50 });
  }

  // While the duration probe is seeking to the end, currentTime is bogus —
  // don't let it flash the waveform to 100%.
  const dur = resolveDuration();
  if (!forcingDuration && isFinite(dur) && dur > 0) {
    const t = el.currentTime;
    const remaining = Math.max(0, Math.ceil(dur - t));
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    publish({
      progress: Math.round(Math.min(1, Math.max(0, t / dur)) * 1000) / 1000,
      timeLeft: `-${m}:${s.toString().padStart(2, '0')}`,
    });
  }
  rafId = requestAnimationFrame(pump);
}


/** Stop playback and release the download. */
export function stopStageRecording() {
  if (endTimeout !== null) {
    clearTimeout(endTimeout);
    endTimeout = null;
  }
  cancelAnimationFrame(rafId);
  if (audioEl) {
    audioEl.pause();
    // Dropping the src is what actually frees the download; pause alone leaves
    // a part-buffered webm sitting in memory.
    audioEl.removeAttribute('src');
    audioEl.load();
  }
  realDuration = 0;
  estimatedDuration = 0;
  forcingDuration = false;
  pendingSeekRatio = null;
  publish(IDLE);
}

/**
 * Start a recording, optionally at a position. Replaces whatever was playing.
 *
 * @param seekRatio 0–1 start position, applied as soon as a duration is known.
 */
export function playStageRecording(space: StagePlayable, seekRatio?: number) {
  if (!space.recording_url) {
    toast.info('Recording not available for this stage');
    return;
  }

  if (endTimeout !== null) {
    clearTimeout(endTimeout);
    endTimeout = null;
  }
  cancelAnimationFrame(rafId);

  const el = ensureAudio();
  el.pause();

  estimatedDuration =
    space.started_at && space.ended_at
      ? Math.max(1, (new Date(space.ended_at).getTime() - new Date(space.started_at).getTime()) / 1000)
      : 0;
  realDuration = 0;
  forcingDuration = false;
  pendingSeekRatio = seekRatio ?? null;
  lastVolumeAt = 0;

  el.src = space.recording_url;
  // Removed first: a play that errors before loadedmetadata leaves the
  // listener attached, and it would then fire against the next source.
  el.removeEventListener('loadedmetadata', resolveRealDuration);
  el.addEventListener('loadedmetadata', resolveRealDuration, { once: true });

  ensureGraph(el);

  publish({
    spaceId: space.id,
    title: space.title || 'Stage recording',
    loading: true,
    progress: 0,
    volume: 0,
    timeLeft: '',
  });

  el.play()
    .then(() => {
      publish({ loading: false });
      rafId = requestAnimationFrame(pump);
    })
    .catch(() => {
      // Autoplay policy or a dead URL — either way the control must not stay lit.
      toast.error('That recording could not be played');
      stopStageRecording();
    });

  void supabase.rpc('increment_stage_listens', { p_space_id: space.id }).then(() => {});
}

/** Press the same recording twice to stop it, rather than restarting it. */
export function toggleStageRecording(space: StagePlayable) {
  if (state.spaceId === space.id) {
    stopStageRecording();
    return;
  }
  playStageRecording(space);
}

/**
 * Scrub. Seeking a recording that is not the one playing starts it there,
 * which is what makes the waveform under an idle row a scrub bar and not just
 * a picture.
 */
export function seekStageRecording(space: StagePlayable, position: number) {
  if (!space.recording_url) return;
  if (state.spaceId === space.id && audioEl) {
    const dur = resolveDuration();
    if (isFinite(dur) && dur > 0) {
      audioEl.currentTime = position * dur;
      return;
    }
    pendingSeekRatio = position;
    return;
  }
  playStageRecording(space, position);
}

/** Subscribe to the shared player. */
export function useStagePlayback(): StagePlaybackState {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    // Re-sync on mount: a card scrolled back into view must show that its own
    // recording is still the one playing.
    setSnapshot(state);
    subscribers.add(setSnapshot);
    return () => {
      subscribers.delete(setSnapshot);
    };
  }, []);
  return snapshot;
}

/**
 * Scrub whatever is currently playing, with no reference to the stage object.
 * The corner mini player knows the id and nothing else, and by definition the
 * recording it is showing is already loaded.
 */
export function scrubStageRecording(position: number) {
  if (!audioEl || !state.spaceId) return;
  const dur = resolveDuration();
  if (isFinite(dur) && dur > 0) {
    audioEl.currentTime = position * dur;
  } else {
    pendingSeekRatio = position;
  }
}

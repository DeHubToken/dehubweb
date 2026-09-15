/**
 * Audio post playback — the corner player's engine
 * =================================================
 * An audio post plays inside its card: `AudioVisualizer` owns the `<audio>`
 * element and the analyser graph around it, and tears both down when the card
 * unmounts. Right for a feed, and also why the track died the moment the card
 * scrolled out of a virtualised list or the route changed — there was no way
 * to keep listening while you browse, which radio and stage recordings have
 * had for a while.
 *
 * This module is where a track goes when it is popped out. The card hands its
 * element over as-is — the analyser chain stays connected, so the card keeps
 * animating while it is on screen and nothing is downloaded twice — and this
 * takes the OS media session under its own name. `AudioPostMiniPlayer`,
 * mounted once in AppLayout, keeps it reachable and stoppable from anywhere.
 * A card still on screen mirrors the state published here, and pressing its
 * pop-out control again takes the element back, still playing.
 *
 * Module scope rather than a context for the same reason radio and stages
 * are: cards live in long lists, the mini player lives outside every route,
 * and there is only ever one of these at a time.
 *
 * @module lib/audio-post-playback
 */

import { useEffect, useState } from 'react';
import { setAudioPostPoppedOut } from '@/lib/audio-post-popout';
import {
  claimMediaSession,
  releaseMediaSession,
  setMediaSessionPlaying,
  setMediaSessionPosition,
} from '@/lib/media-session';

/** This module's identity in the single-owner media session. */
const OWNER_ID = 'audio-post-popout';

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

export interface AudioPostTrack {
  tokenId: string;
  audioUrl: string;
  /** Already resolved by the card: a post with no title still needs a name. */
  title: string;
  artist: string;
  artworkUrl?: string | null;
}

/** The element and whatever Web Audio nodes the card had built around it. */
export interface AudioPostGraph {
  el: HTMLAudioElement;
  /**
   * The card's analyser chain. Left connected on purpose: a media element
   * that has a source node only sounds through the graph, and the card reads
   * the analyser to animate while it is still on screen.
   */
  source: MediaElementAudioSourceNode | null;
  analyser: AnalyserNode | null;
}

export interface AudioPostPlaybackState {
  /** The popped-out post, or null when the corner player is closed. */
  tokenId: string | null;
  track: AudioPostTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  /** Playhead, 0–1. */
  progress: number;
  /** Seconds. */
  currentTime: number;
  duration: number;
}

const IDLE: AudioPostPlaybackState = {
  tokenId: null,
  track: null,
  isPlaying: false,
  isLoading: false,
  progress: 0,
  currentTime: 0,
  duration: 0,
};

let state: AudioPostPlaybackState = IDLE;
const subscribers = new Set<(next: AudioPostPlaybackState) => void>();

function publish(patch: Partial<AudioPostPlaybackState>) {
  const next = { ...state, ...patch };
  let changed = false;
  for (const key of Object.keys(next) as (keyof AudioPostPlaybackState)[]) {
    if (next[key] !== state[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  state = next;
  // The app shell gates the corner player's chunk on this, without having to
  // load this module to find out — see lib/audio-post-popout.
  setAudioPostPoppedOut(!!state.tokenId);
  for (const notify of subscribers) notify(state);
}

let graph: AudioPostGraph | null = null;
let detach: (() => void) | null = null;
/** A seek asked for before the element had a duration to seek within. */
let pendingSeek: number | null = null;

const durationOf = (el: HTMLAudioElement) =>
  Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;

function attach(el: HTMLAudioElement) {
  detach?.();
  const onTime = () => {
    const total = durationOf(el) || state.duration;
    publish({
      currentTime: el.currentTime,
      duration: total,
      progress: total > 0 ? clamp01(el.currentTime / total) : 0,
    });
    if (total > 0) setMediaSessionPosition(OWNER_ID, el.currentTime, total);
  };
  const onMeta = () => {
    const total = durationOf(el);
    if (!total) return;
    publish({ duration: total, isLoading: false });
    if (pendingSeek !== null) {
      el.currentTime = pendingSeek * total;
      pendingSeek = null;
    }
  };
  const onPlay = () => {
    publish({ isPlaying: true });
    setMediaSessionPlaying(OWNER_ID, true);
  };
  const onPause = () => {
    publish({ isPlaying: false, isLoading: false });
    setMediaSessionPlaying(OWNER_ID, false);
  };
  const onWaiting = () => publish({ isLoading: true });
  const onPlaying = () => publish({ isLoading: false });
  // Rest at the end rather than closing: one tap on the corner player starts
  // it again from the top, which is what a finished track wants.
  const onEnded = () => {
    publish({ isPlaying: false, isLoading: false, progress: 1 });
    setMediaSessionPlaying(OWNER_ID, false);
  };

  el.addEventListener('timeupdate', onTime);
  el.addEventListener('seeked', onTime);
  el.addEventListener('loadedmetadata', onMeta);
  el.addEventListener('durationchange', onMeta);
  el.addEventListener('play', onPlay);
  el.addEventListener('pause', onPause);
  el.addEventListener('waiting', onWaiting);
  el.addEventListener('playing', onPlaying);
  el.addEventListener('ended', onEnded);
  detach = () => {
    el.removeEventListener('timeupdate', onTime);
    el.removeEventListener('seeked', onTime);
    el.removeEventListener('loadedmetadata', onMeta);
    el.removeEventListener('durationchange', onMeta);
    el.removeEventListener('play', onPlay);
    el.removeEventListener('pause', onPause);
    el.removeEventListener('waiting', onWaiting);
    el.removeEventListener('playing', onPlaying);
    el.removeEventListener('ended', onEnded);
    detach = null;
  };
}

function claim(track: AudioPostTrack, el: HTMLAudioElement) {
  claimMediaSession(
    OWNER_ID,
    {
      title: track.title,
      artist: track.artist,
      album: 'DeHub • Audio',
      artwork: track.artworkUrl || null,
    },
    {
      play: resumeAudioPost,
      pause: pauseAudioPost,
      stop: stopAudioPost,
      seekbackward: (offset) => nudge(-offset),
      seekforward: (offset) => nudge(offset),
      seekto: (time) => {
        if (graph?.el === el) el.currentTime = time;
      },
    },
  );
}

function nudge(seconds: number) {
  const el = graph?.el;
  if (!el) return;
  const total = durationOf(el);
  el.currentTime = total > 0 ? Math.max(0, Math.min(total, el.currentTime + seconds)) : 0;
}

/** Stop the track, drop the element and close the corner player. */
export function stopAudioPost() {
  const g = graph;
  detach?.();
  graph = null;
  pendingSeek = null;
  if (g) {
    try {
      g.el.pause();
    } catch {
      /* already released */
    }
    // Detach the nodes from the SHARED context, never close it — other
    // visualizers may be using it.
    g.source?.disconnect();
    g.analyser?.disconnect();
    g.el.removeAttribute('src');
  }
  releaseMediaSession(OWNER_ID);
  publish(IDLE);
}

export interface AudioPostHandover {
  track: AudioPostTrack;
  /**
   * The card's element and nodes, or null when the card never got as far as
   * creating one — the engine makes a plain element then.
   */
  graph: AudioPostGraph | null;
  /** Where to start, 0–1, when the engine creates the element itself. */
  startAt?: number | null;
}

/**
 * Pop a post out into the corner player, starting it if it is not already
 * playing — the only reading of the control that makes sense from a card
 * nobody has pressed play on.
 *
 * Runs `play()` synchronously so it lands in the click's own call stack,
 * which is what the autoplay policy checks.
 */
export function popOutAudioPost(handover: AudioPostHandover) {
  const { track } = handover;

  if (state.tokenId === track.tokenId && graph) {
    // Already here: make sure it is audible and leave it at that.
    if (!state.isPlaying) resumeAudioPost();
    return;
  }

  // Whatever was popped out before is over; this is not a queue.
  if (graph) stopAudioPost();

  let g = handover.graph;
  if (!g) {
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.src = track.audioUrl;
    g = { el, source: null, analyser: null };
  }
  const { el } = g;
  graph = g;

  const total = durationOf(el);
  if (!handover.graph && handover.startAt != null) {
    if (total > 0) el.currentTime = clamp01(handover.startAt) * total;
    else pendingSeek = clamp01(handover.startAt);
  }
  attach(el);

  publish({
    tokenId: track.tokenId,
    track,
    isPlaying: true,
    isLoading: total === 0,
    duration: total,
    currentTime: el.currentTime,
    progress: total > 0 ? clamp01(el.currentTime / total) : (pendingSeek ?? 0),
  });

  if (el.ended) el.currentTime = 0;
  claim(track, el);
  el.play().catch(() => publish({ isPlaying: false, isLoading: false }));
  setMediaSessionPlaying(OWNER_ID, true);
}

/**
 * Hand the element back to a card, still playing if it was. Returns null when
 * nothing is popped out for that post, in which case nothing changed.
 *
 * The media session is released here: the card claims it under its own id
 * the moment it reports itself playing, and a stale release from this module
 * later cannot touch that claim.
 */
export function takeBackAudioPost(tokenId: string): AudioPostGraph | null {
  if (state.tokenId !== tokenId || !graph) return null;
  const g = graph;
  detach?.();
  graph = null;
  pendingSeek = null;
  releaseMediaSession(OWNER_ID);
  publish(IDLE);
  return g;
}

/** Pause. The session claim is kept so the track can be resumed from it. */
export function pauseAudioPost() {
  const el = graph?.el;
  if (!el) return;
  el.pause();
}

export function resumeAudioPost() {
  const el = graph?.el;
  const { track } = state;
  if (!el || !track) return;
  if (el.ended) el.currentTime = 0;
  // Re-claimed on resume: something else may have taken the session while
  // this sat paused.
  claim(track, el);
  publish({ isPlaying: true });
  el.play().catch(() => publish({ isPlaying: false, isLoading: false }));
  setMediaSessionPlaying(OWNER_ID, true);
}

export function toggleAudioPost() {
  if (!state.tokenId) return;
  if (state.isPlaying) pauseAudioPost();
  else resumeAudioPost();
}

/** Jump to `ratio` (0–1). Never changes the play state. */
export function seekAudioPost(ratio: number) {
  const el = graph?.el;
  if (!el) return;
  const clamped = clamp01(ratio);
  const total = durationOf(el);
  if (!total) {
    pendingSeek = clamped;
    publish({ progress: clamped, currentTime: clamped * state.duration });
    return;
  }
  el.currentTime = clamped * total;
  publish({ progress: clamped, currentTime: clamped * total });
}

/** Subscribe to the popped-out post. */
export function useAudioPostPlayback(): AudioPostPlaybackState {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    setSnapshot(state);
    subscribers.add(setSnapshot);
    return () => {
      subscribers.delete(setSnapshot);
    };
  }, []);
  return snapshot;
}

/** The current state, for code that is not a component. */
export function getAudioPostPlaybackState(): AudioPostPlaybackState {
  return state;
}

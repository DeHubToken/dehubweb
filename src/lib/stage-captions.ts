/**
 * Live stage captions — the wire format and the two viewer preferences.
 * ====================================================================
 *
 * Captions are produced **per speaker, on that speaker's own machine**, and
 * broadcast as text. The alternative — one client transcribing the room mix —
 * looks cheaper and does not work here: the host's recording graph only ever
 * contains the host's microphone and injected clips, guests arrive as separate
 * Agora tracks that are never mixed in, and host-side echo cancellation
 * removes what leaks through the speakers. A mix-tap would caption the host
 * and nobody else.
 *
 * Transcribing locally instead buys three things for free: every speaker is
 * captured, the speaker of each line is known exactly (no diarisation guessing
 * "Speaker 2"), and the bill scales with people talking rather than people
 * listening — a stage with five thousand listeners costs the same as one with
 * five.
 *
 * Lines ride a Supabase Realtime **broadcast** channel, the same mechanism
 * StageReactions uses. Broadcast, not a table: an hour of live captions is
 * thousands of interim updates that are worthless ten seconds later, and none
 * of them should touch Postgres. The durable transcript is still the
 * end-of-stage Scribe pass in `transcribe-stage`, which is more accurate than
 * anything real-time and stays the record.
 */

import { useSyncExternalStore } from 'react';

/** One caption channel per stage, separate from reactions so their rates are independent. */
export function stageCaptionChannel(spaceId: string): string {
  return `stage-captions:${spaceId}`;
}

export const CAPTION_EVENT = 'caption';

export interface StageCaptionMessage {
  /**
   * Utterance id. Interim updates reuse it and the final reuses it once more,
   * so a receiver replaces a line in place instead of appending a new one per
   * word. A fresh id starts a new line.
   */
  id: string;
  /** Lowercased wallet of the speaker — for an AI line, of the speaker who injected it. */
  wallet: string;
  /** Display name for the line. */
  name: string;
  text: string;
  /** False while the sentence is still being spoken. */
  final: boolean;
  /** 'ai' covers TTS and soundboard clips, whose text we already know without transcribing. */
  kind: 'speech' | 'ai';
  /** Wall-clock ms at the sender. Used only for expiry, never for ordering across clients. */
  at: number;
}

/** How long a finished line stays on screen. */
export const CAPTION_FINAL_TTL_MS = 9000;
/**
 * How long an unfinished line survives without an update. A speaker who drops
 * mid-sentence would otherwise leave a fragment pinned to the overlay forever.
 */
export const CAPTION_INTERIM_TTL_MS = 5000;
/** Lines visible at once. Three is about two seconds of reading at conversational pace. */
export const CAPTION_MAX_LINES = 3;

// ─── Local echo ──────────────────────────────────────────────────────────────
//
// A speaker has to see their own subtitles, and the broadcast channel will not
// reliably give them back: Realtime's `self` option is decided per join, the
// publisher and the overlay are separate joins on one socket, and whether a
// message crosses between them is not something worth betting a visible
// feature on. So a caption is handed to the local overlay directly at the same
// moment it goes out on the wire. It arrives with no round trip, and if the
// broadcast does echo back the overlay simply replaces the line by its id.

type LocalCaptionListener = (spaceId: string, message: StageCaptionMessage) => void;

const localCaptionListeners = new Set<LocalCaptionListener>();

export function onLocalCaption(listener: LocalCaptionListener): () => void {
  localCaptionListeners.add(listener);
  return () => {
    localCaptionListeners.delete(listener);
  };
}

export function emitLocalCaption(spaceId: string, message: StageCaptionMessage) {
  localCaptionListeners.forEach((listener) => listener(spaceId, message));
}

// ─── Preferences ─────────────────────────────────────────────────────────────
//
// Two independent switches, and they are genuinely independent: a listener who
// hides subtitles should not stop a speaker's microphone being transcribed for
// everyone else, and a speaker who does not want to be transcribed should still
// be able to read other people. They live in a module store rather than in
// StageContext because the publisher runs inside the provider (so captions
// survive minimising the stage) while the toggle lives in the room UI — two
// different trees reading one value.

const SHOW_KEY = 'dehub.stage.captions.show';
const SEND_KEY = 'dehub.stage.captions.send';

function readPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* private mode — the session still works, the choice just does not stick */
  }
}

let showCaptions = readPref(SHOW_KEY, true);
let sendCaptions = readPref(SEND_KEY, true);

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useShowCaptions(): boolean {
  return useSyncExternalStore(subscribe, () => showCaptions, () => true);
}

export function useSendCaptions(): boolean {
  return useSyncExternalStore(subscribe, () => sendCaptions, () => true);
}

export function setShowCaptions(value: boolean) {
  if (showCaptions === value) return;
  showCaptions = value;
  writePref(SHOW_KEY, value);
  emit();
}

export function setSendCaptions(value: boolean) {
  if (sendCaptions === value) return;
  sendCaptions = value;
  writePref(SEND_KEY, value);
  emit();
}

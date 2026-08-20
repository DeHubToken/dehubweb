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

// ─── Translation ─────────────────────────────────────────────────────────────
//
// A finalised line is translated once, server-side, into every language a
// listener is currently reading, and the result is broadcast back on this same
// channel. The alternative — each listener translating what it reads — would
// have cost one call per listener per language per line; twenty-three
// listeners on ten languages is two hundred and thirty calls for one sentence.
//
// Only finals are translated. Interims revise themselves every few hundred
// milliseconds, so translating them would multiply the bill by an order of
// magnitude to produce subtitles that rewrite themselves as you read.

export const CAPTION_TRANSLATION_EVENT = 'caption-translation';

export interface StageCaptionTranslation {
  /** The utterance this belongs to — the same id the source line carried. */
  id: string;
  /** Language code → the line in that language. Missing codes fall back to the source. */
  translations: Record<string, string>;
}

/**
 * What the picker offers.
 *
 * Deliberately a separate list from StageTranscriptDrawer's: that one carries
 * an `original` pseudo-entry and drives a cached, whole-transcript job, while
 * this drives per-line work priced by how many languages are live. The
 * server holds the same allowlist — a code that is not on both does nothing.
 */
export const CAPTION_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
  { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ru', name: 'Русский' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'id', name: 'Bahasa Indonesia' },
];

/** Presence key a listener publishes when it is reading the source language. */
export const CAPTION_SOURCE_LANGUAGE = 'source';

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

/**
 * Translations take the same local shortcut as captions do: the client that
 * asked for them hands them straight to its own overlay, so a speaker reading
 * along in another language is not waiting on a round trip they started.
 */
type LocalTranslationListener = (spaceId: string, payload: StageCaptionTranslation) => void;

const localTranslationListeners = new Set<LocalTranslationListener>();

export function onLocalTranslation(listener: LocalTranslationListener): () => void {
  localTranslationListeners.add(listener);
  return () => {
    localTranslationListeners.delete(listener);
  };
}

export function emitLocalTranslation(spaceId: string, payload: StageCaptionTranslation) {
  localTranslationListeners.forEach((listener) => listener(spaceId, payload));
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

/**
 * The language this viewer reads captions in, or null for the language being
 * spoken. Stored per browser, and published over Realtime presence — which is
 * what decides the set of languages the room actually pays to translate into.
 */
const LANG_KEY = 'dehub.stage.captions.lang';

function readLangPref(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LANG_KEY);
    // Guard the stored value against a picker that has since dropped a language.
    return raw && CAPTION_LANGUAGES.some((l) => l.code === raw) ? raw : null;
  } catch {
    return null;
  }
}

let captionLanguage = readLangPref();

export function useCaptionLanguage(): string | null {
  return useSyncExternalStore(subscribe, () => captionLanguage, () => null);
}

export function setCaptionLanguage(value: string | null) {
  if (captionLanguage === value) return;
  captionLanguage = value;
  try {
    if (value) window.localStorage.setItem(LANG_KEY, value);
    else window.localStorage.removeItem(LANG_KEY);
  } catch {
    /* private mode — the choice just does not survive the tab */
  }
  emit();
}

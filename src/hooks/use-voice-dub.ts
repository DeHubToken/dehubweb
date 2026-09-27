/**
 * Dubbed audio for a video post, spoken on the viewer's own device.
 *
 * The transcript stack already produces the words in the viewer's language
 * (`transcript_translations`); the browser's speech synthesiser reads them out
 * in step with the <video>. Nothing is rendered or stored server-side, so a
 * dub costs nothing and is available the moment the translation is.
 *
 * Two halves:
 * - `useDubPreference` is the one switch. The CC menu's Audio toggle and the
 *   post's "..." menu both read and write it, so they can never disagree.
 * - `useVoiceDub` is the playback engine, glued to the video's clock. The
 *   video keeps owning play/pause/mute/seek; the engine only follows.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { TranscriptSegment } from '@/hooks/use-transcript';

const LS_ON = 'video-dubs:on';
const LS_LANG = 'video-dubs:lang';

/** Original audio sits under the voice at this volume while a dub plays. */
const DUCK_VOLUME = 0.15;
/** Characters per second a voice reads comfortably at rate 1. */
const NATURAL_CPS = 14;
const MAX_RATE = 1.3;

/* ────────────────────────────── preference ──────────────────────────────── */

interface DubPreference {
  on: boolean;
  /** Language chosen from the post menu. Null means "follow the captions". */
  lang: string | null;
}

function readPreference(): DubPreference {
  try {
    return { on: localStorage.getItem(LS_ON) === '1', lang: localStorage.getItem(LS_LANG) || null };
  } catch {
    return { on: false, lang: null };
  }
}

let preference: DubPreference = readPreference();
const listeners = new Set<() => void>();

export function setDubPreference(on: boolean, lang: string | null = null) {
  preference = { on, lang };
  try {
    localStorage.setItem(LS_ON, on ? '1' : '0');
    if (lang) localStorage.setItem(LS_LANG, lang);
    else localStorage.removeItem(LS_LANG);
  } catch { /* noop */ }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useDubPreference() {
  const pref = useSyncExternalStore(subscribe, () => preference, () => preference);
  return { ...pref, setDub: setDubPreference };
}

/* ──────────────────────────────── voices ────────────────────────────────── */

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

/** Best voice for a BCP-47 tag: exact tag first, then same base language,
 *  preferring voices that run on the device over network ones. */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: string | null): SpeechSynthesisVoice | null {
  if (!lang) return null;
  const want = lang.toLowerCase().replace('_', '-');
  const base = want.split('-')[0];
  const tag = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  const exact = voices.filter((v) => tag(v) === want);
  const pool = exact.length ? exact : voices.filter((v) => tag(v).split('-')[0] === base);
  return pool.find((v) => v.localService) ?? pool[0] ?? null;
}

/** Voices arrive asynchronously in Chrome; wait briefly for the first list. */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const now = s.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      s.removeEventListener('voiceschanged', done);
      resolve(s.getVoices());
    };
    const timer = window.setTimeout(done, timeoutMs);
    s.addEventListener('voiceschanged', done);
  });
}

export function useSpeechVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => synth()?.getVoices() ?? []);
  useEffect(() => {
    const s = synth();
    if (!s) return;
    const update = () => setVoices(s.getVoices());
    update();
    s.addEventListener('voiceschanged', update);
    return () => s.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}

/* ──────────────────────────────── engine ────────────────────────────────── */

// The synthesiser is one per page, but several cards can mount an engine.
// Only the one that spoke last may cancel, so a card scrolling away does not
// silence the one being watched.
let speaker: object | null = null;

/**
 * Speak `segments` in `voice`, in step with the video. Pass null segments or
 * voice to stop. Each line starts when playback crosses its start; a line
 * still running when the next begins is cut off rather than queued, so the
 * voice can never drift behind the picture.
 */
export function useVoiceDub(
  videoRef: React.RefObject<HTMLVideoElement>,
  segments: TranscriptSegment[] | null,
  voice: SpeechSynthesisVoice | null,
) {
  useEffect(() => {
    const v = videoRef.current;
    const s = synth();
    if (!v || !s || !voice || !segments?.length) return;

    const me = {};
    let spoken = -1;
    // What the viewer set; the element itself holds the ducked value.
    let restoreVolume = v.volume;
    const duck = () => {
      if (v.volume > DUCK_VOLUME + 0.001) {
        restoreVolume = v.volume;
        v.volume = DUCK_VOLUME;
      }
    };
    duck();

    const stop = () => {
      spoken = -1;
      if (speaker === me) s.cancel();
    };

    const indexAt = (t: number) => {
      for (let i = segments.length - 1; i >= 0; i--) {
        if (segments[i].start <= t) return t < segments[i].end ? i : -1;
      }
      return -1;
    };

    const speak = (i: number) => {
      const seg = segments[i];
      spoken = i;
      s.cancel();
      speaker = me;
      if (!seg.text.trim()) return;
      const u = new SpeechSynthesisUtterance(seg.text);
      u.voice = voice;
      u.lang = voice.lang;
      const duration = Math.max(0.5, seg.end - seg.start);
      const needed = seg.text.length / duration / NATURAL_CPS;
      u.rate = Math.min(MAX_RATE, Math.max(1, needed)) * (v.playbackRate || 1);
      u.volume = restoreVolume;
      s.speak(u);
    };

    const tick = () => {
      if (v.paused || v.muted || v.seeking) return;
      const i = indexAt(v.currentTime);
      if (i >= 0 && i !== spoken) speak(i);
    };

    const onVolume = () => {
      if (v.muted) stop();
      duck();
    };

    v.addEventListener('pause', stop);
    v.addEventListener('seeking', stop);
    v.addEventListener('play', tick);
    v.addEventListener('seeked', tick);
    v.addEventListener('volumechange', onVolume);
    const timer = window.setInterval(tick, 100);
    tick();

    return () => {
      window.clearInterval(timer);
      v.removeEventListener('pause', stop);
      v.removeEventListener('seeking', stop);
      v.removeEventListener('play', tick);
      v.removeEventListener('seeked', tick);
      v.removeEventListener('volumechange', onVolume);
      if (speaker === me) {
        s.cancel();
        speaker = null;
      }
      v.volume = restoreVolume;
    };
  }, [videoRef, segments, voice]);
}

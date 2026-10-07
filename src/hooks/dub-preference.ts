/**
 * The dub switch and the device voice list — the light half of on-device
 * dubbing, loaded with every video card. The speech engine itself lives in
 * use-voice-dub.ts and is only fetched once a dub is actually playing.
 *
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
import { autoTranslateEnabled, subscribeAutoTranslate } from '@/lib/auto-translate-setting';

const LS_ON = 'video-dubs:on';
const LS_LANG = 'video-dubs:lang';


/* ────────────────────────────── preference ──────────────────────────────── */

interface DubPreference {
  on: boolean;
  automatic: boolean;
  /** Language chosen from the post menu. Null means "follow the captions". */
  lang: string | null;
}

function readPreference(): DubPreference {
  try {
    const saved = localStorage.getItem(LS_ON);
    return { on: saved !== '0', automatic: saved === null, lang: localStorage.getItem(LS_LANG) || null };
  } catch {
    return { on: true, automatic: true, lang: null };
  }
}

let preference: DubPreference = readPreference();
const listeners = new Set<() => void>();

export function setDubPreference(on: boolean, lang: string | null = null) {
  preference = { on, lang, automatic: false };
  try {
    localStorage.setItem(LS_ON, on ? '1' : '0');
    if (lang) localStorage.setItem(LS_LANG, lang);
    else localStorage.removeItem(LS_LANG);
  } catch { /* noop */ }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const unsubscribeAuto = subscribeAutoTranslate(l);
  return () => { listeners.delete(l); unsubscribeAuto(); };
}

export function getDubPreference(): DubPreference {
  const on = preference.automatic ? autoTranslateEnabled() : preference.on;
  if (on !== preference.on) preference = { ...preference, on };
  return preference;
}

export function useDubPreference() {
  const pref = useSyncExternalStore(subscribe, getDubPreference, getDubPreference);
  useEffect(() => { if (pref.on) armSpeech(); }, [pref.on]);
  return { ...pref, setDub: setDubPreference };
}

let primingArmed = false;
let primed = false;
function armSpeech() {
  if (primed || primingArmed || typeof document === 'undefined') return;
  primingArmed = true;
  const prime = () => {
    primeSpeech();
    primed = true;
    primingArmed = false;
    document.removeEventListener('pointerdown', prime, true);
    document.removeEventListener('keydown', prime, true);
  };
  document.addEventListener('pointerdown', prime, true);
  document.addEventListener('keydown', prime, true);
}

/* ──────────────────────────────── voices ────────────────────────────────── */

export function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

/** Best voice for a BCP-47 tag: exact tag first, then same base language,
 *  preferring voices that run on the device over network ones. */
/** App codes whose device voices are filed under another code. */
const VOICE_ALIASES: Record<string, string> = { no: 'nb', tl: 'fil', yue: 'zh', iw: 'he' };

export function pickVoice(voices: SpeechSynthesisVoice[], lang: string | null): SpeechSynthesisVoice | null {
  if (!lang) return null;
  const want = lang.toLowerCase().replace('_', '-');
  const raw = want.split('-')[0];
  const base = VOICE_ALIASES[raw] ?? raw;
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

/** iOS Safari only speaks once speech has started inside a tap: call from it. */
export function primeSpeech() {
  const s = synth();
  if (!s) return;
  try {
    s.speak(new SpeechSynthesisUtterance(''));
  } catch { /* noop */ }
}

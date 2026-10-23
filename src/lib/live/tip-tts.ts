/**
 * Tip-to-speech on a live stream
 * ==============================
 * A gift can carry a line of text, and this is what reads it out loud over the
 * stream for everybody watching.
 *
 * **It is the viewer's own browser that speaks, not the broadcast.** Nothing is
 * mixed into the video: the words ride the `streamer.tip` socket broadcast that
 * already reaches every socket in the stream's room, and each client synthesises
 * the same sentence locally. So the room hears it within a second of the tip
 * landing, ahead of the ~10s HLS buffer, and the host hears it too, which is
 * what puts it into an OBS capture of desktop audio if they want it.
 *
 * The voice is the device's own, the same one dubbed videos speak with
 * (dub-preference.ts picks it). It costs nothing per tip, needs no download,
 * and sounds like a person rather than a speak-and-spell. A browser with no
 * speech engine or no voice for the language stays silent; the celebration and
 * the on-screen text still play.
 */
import { loadVoices, pickVoice, primeSpeech, synth } from '@/hooks/dub-preference';

/**
 * Long enough for a real message, short enough that one tip cannot hold the
 * stream's audio hostage. At a normal speaking pace this caps a single reading
 * at roughly 15 seconds.
 */
export const MAX_TTS_CHARS = 200;

/**
 * Never queue more than this. A stream taking gifts faster than it can read
 * them would otherwise build a backlog that plays out minutes after the tips
 * landed. Past the cap the oldest waiting message is dropped, because the
 * newest tip is the one the room is currently looking at.
 */
const MAX_QUEUE = 5;

/**
 * Strip a tip message down to something worth speaking aloud.
 *
 * URLs go because a speech engine reads them letter by letter, and a link is
 * thirty seconds of "aitch tee tee pee colon slash slash". Control characters and
 * runs of punctuation go because they are how you make the synthesiser stutter
 * for a minute on a two-word message.
 */
export function sanitiseTtsText(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\p{C}/gu, ' ')
    .replace(/[^\p{L}\p{N}\s.,!?'-]/gu, ' ')
    .replace(/([.,!?'-])\1{2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TTS_CHARS);
}

const SCRIPT_LANGS: [RegExp, string][] = [
  [/\p{Script=Hangul}/u, 'ko'],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, 'ja'],
  [/\p{Script=Han}/u, 'zh'],
  [/\p{Script=Cyrillic}/u, 'ru'],
  [/\p{Script=Arabic}/u, 'ar'],
  [/\p{Script=Hebrew}/u, 'he'],
  [/\p{Script=Greek}/u, 'el'],
  [/\p{Script=Devanagari}/u, 'hi'],
  [/\p{Script=Thai}/u, 'th'],
];
const SCRIPT_OF_LANG: Record<string, string> = {
  ko: 'ko', ja: 'ja', zh: 'zh', yue: 'zh', ru: 'ru', uk: 'ru', bg: 'ru', sr: 'ru', kk: 'ru', mn: 'ru',
  ar: 'ar', fa: 'ar', ur: 'ar', ps: 'ar', he: 'he', iw: 'he', yi: 'he', el: 'el', hi: 'hi', mr: 'hi', ne: 'hi', th: 'th',
};

/**
 * Which language to read a message in.
 *
 * A tip is not translated, so it is read in the language it was written in.
 * The script decides that for anything non-Latin. Latin text is read in the
 * viewer's language when that is itself a Latin-script one (a Spanish viewer
 * most likely got a Spanish tip), and in English otherwise, rather than a
 * Russian voice spelling out English words.
 */
export function tipVoiceLang(text: string, viewerLang: string | null | undefined): string {
  const viewer = (viewerLang || 'en').toLowerCase().replace('_', '-');
  const base = viewer.split('-')[0];
  for (const [re, lang] of SCRIPT_LANGS) {
    if (re.test(text)) return SCRIPT_OF_LANG[base] === lang ? viewer : lang;
  }
  return SCRIPT_OF_LANG[base] ? 'en' : viewer;
}

const queue: string[] = [];
let draining = false;
/** Viewers who have turned tip readings off. Also honoured by a muted player. */
let enabled = true;
/** Settles the line being read when it is cut short. */
let cutCurrent: (() => void) | null = null;

/** Turn tip readings on or off for this tab. Stops anything mid-sentence. */
export function setTipTtsEnabled(on: boolean): void {
  enabled = on;
  if (!on) stopTipTts();
}

export function isTipTtsEnabled(): boolean {
  return enabled;
}

/** Cut the current reading and drop anything waiting. */
export function stopTipTts(): void {
  queue.length = 0;
  if (cutCurrent) {
    synth()?.cancel();
    cutCurrent();
  }
}

function viewerLanguage(): string {
  return typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en';
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0 && enabled) {
      const text = queue.shift();
      if (!text) break;
      try {
        const s = synth();
        if (!s) continue;
        const lang = tipVoiceLang(text, viewerLanguage());
        const voice = pickVoice(await loadVoices(), lang);
        if (!voice || !enabled) continue;
        await speakLine(s, text, voice);
      } catch {
        // One unreadable message must not stall the ones behind it, and a
        // stream losing its tip voice is not worth a toast on every gift.
      }
    }
  } finally {
    draining = false;
  }
}

/** Longest a line may hold the queue if the engine never reports the end. */
const LINE_TIMEOUT_MS = 20_000;

function speakLine(s: SpeechSynthesis, text: string, voice: SpeechSynthesisVoice): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (cutCurrent === done) cutCurrent = null;
      resolve();
    };
    cutCurrent = done;
    u.onend = done;
    u.onerror = done;
    // Some engines never fire onend (Chrome drops it on long idle tabs), and
    // a line that never ends would silence every tip behind it.
    timer = setTimeout(done, LINE_TIMEOUT_MS);
    s.speak(u);
  });
}

/**
 * Read a tip message out over the stream.
 *
 * Safe to call for every gift: one with no message, or nothing left after
 * sanitising, is simply not queued.
 */
export function speakTipMessage(message: string | undefined | null): void {
  if (!enabled) return;
  const text = sanitiseTtsText(message);
  if (!text) return;
  queue.push(text);
  while (queue.length > MAX_QUEUE) queue.shift();
  void drain();
}

let primeArmed = false;

/**
 * List the device voices ahead of the first gift (Chrome fills them in late),
 * and unlock speech on the viewer's next tap: iOS Safari only speaks once
 * speech has started inside a gesture, and a gift arrives from a socket.
 */
export function warmTipTts(): void {
  void loadVoices().catch(() => undefined);
  if (primeArmed || typeof document === 'undefined') return;
  primeArmed = true;
  const prime = () => {
    primeSpeech();
    document.removeEventListener('pointerdown', prime, true);
  };
  document.addEventListener('pointerdown', prime, true);
}

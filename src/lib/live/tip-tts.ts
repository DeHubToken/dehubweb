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
 * landing — ahead of the ~10s HLS buffer, not behind it — and the host hears it
 * too, which is what puts it into an OBS capture of desktop audio if they want
 * it in the recording.
 *
 * The engine is eSpeak NG (via meSpeak), speaking through its `old` variant —
 * the free, offline, open-source old-man voice. Two reasons it beats the
 * alternatives here:
 *
 * - **It costs nothing per tip.** The platform's other TTS surface (StageTTS)
 *   bills ElevenLabs per character. A busy stream takes hundreds of gifts an
 *   hour and every one of them would be a paid API call, multiplied by nothing
 *   at all — one synthesis serves one viewer. Synthesising locally is free at
 *   any audience size.
 * - **It is ~660 kB, once.** A neural voice (Piper/VITS) is 20–80 MB of model
 *   per viewer. That is not a thing to hand somebody on mobile data so they can
 *   hear a tip message.
 *
 * Loaded from jsDelivr on demand rather than bundled: it must not touch the
 * boot path (see the boot-performance budget), it is only ever needed by
 * somebody actually watching a live stream, and eSpeak is GPL — keeping it a
 * separately-fetched work rather than linking it into the app bundle is
 * deliberate. A CDN failure degrades to silence, never to a broken player.
 */

/**
 * Where the engine comes from. Three fetches on first use: the module (~307 kB),
 * the config (~283 kB) and the English voice (~68 kB), all gzipped wire sizes.
 */
const CDN = 'https://cdn.jsdelivr.net/npm/mespeak@2.0.2';

/**
 * eSpeak's `old` variant — an aged, creaky male voice. The string is passed
 * straight to eSpeak as `-v en+old`, so it is the engine's name, not ours.
 */
const VOICE_VARIANT = 'old';

/**
 * Long enough for a real message, short enough that one tip cannot hold the
 * stream's audio hostage. At ~135 wpm this caps a single reading at roughly
 * 15 seconds.
 */
export const MAX_TTS_CHARS = 200;

/**
 * Never queue more than this. A stream taking gifts faster than it can read
 * them would otherwise build a backlog that plays out minutes after the tips
 * landed — by which point the words are answering a conversation that has
 * moved on. Past the cap the oldest waiting message is dropped, because the
 * newest tip is the one the room is currently looking at.
 */
const MAX_QUEUE = 5;

/** How long to wait on `loadVoice`'s callback before giving up on it. */
const VOICE_LOAD_TIMEOUT_MS = 5000;

interface MeSpeak {
  loadConfig: (config: unknown) => void;
  isConfigLoaded: () => boolean;
  loadVoice: (voice: unknown, cb: (ok: boolean, msg: string) => void) => void;
  speak: (text: string, opts: Record<string, unknown>) => string | undefined;
}

let enginePromise: Promise<MeSpeak> | null = null;

/**
 * Fetch and initialise the synthesiser, at most once per tab.
 *
 * **`loadVoice` reports failure and must still be called.** Its callback comes
 * back `(false, "en/en-us")` because the dictionary file it wants to create is
 * already in the emscripten filesystem — but the voice IS installed by the time
 * it says so, and without the call `speak` returns nothing at all. Measured on
 * the real engine: config alone yields 0 bytes for a sentence that yields 83 kB
 * once the voice is loaded, and the only other sign is a console warning
 * ("No voice module loaded, deferring call"). So the callback's verdict is
 * deliberately ignored.
 *
 * It is raced against a timeout because a callback that never fires would
 * otherwise leave every queued tip waiting on a promise that never settles.
 */
async function loadEngine(): Promise<MeSpeak> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const mod = await import(/* @vite-ignore */ `${CDN}/src/index.js/+esm`);
      const engine = ((mod as { default?: MeSpeak }).default ?? mod) as MeSpeak;
      if (!engine.isConfigLoaded()) {
        const config = await fetch(`${CDN}/src/mespeak_config.json`).then((r) => {
          if (!r.ok) throw new Error(`tts config ${r.status}`);
          return r.json();
        });
        engine.loadConfig(config);
      }
      const voice = await fetch(`${CDN}/voices/en/en-us.json`).then((r) => {
        if (!r.ok) throw new Error(`tts voice ${r.status}`);
        return r.json();
      });
      await new Promise<void>((done) => {
        const timer = setTimeout(done, VOICE_LOAD_TIMEOUT_MS);
        try {
          engine.loadVoice(voice, () => {
            clearTimeout(timer);
            done();
          });
        } catch {
          clearTimeout(timer);
          done();
        }
      });
      return engine;
    })().catch((err) => {
      // Let a later gift retry rather than wedging the feature on one bad
      // fetch — a CDN blip should not silence the stream for the whole session.
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

/**
 * Strip a tip message down to something worth speaking aloud.
 *
 * URLs go because eSpeak reads them letter by letter and a link is thirty
 * seconds of "aitch tee tee pee colon slash slash". Control characters and
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

interface QueuedLine {
  text: string;
}

const queue: QueuedLine[] = [];
let current: HTMLAudioElement | null = null;
let draining = false;
/** Viewers who have turned tip readings off. Also honoured by a muted player. */
let enabled = true;

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
  if (current) {
    current.pause();
    current.src = '';
    current = null;
  }
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0 && enabled) {
      const next = queue.shift();
      if (!next) break;
      try {
        const engine = await loadEngine();
        const wav = engine.speak(next.text, {
          rawdata: 'base64',
          variant: VOICE_VARIANT,
          // Slow and low. The default rate reads a tip like a train
          // announcement; this is the wheeze the voice is here for.
          speed: 135,
          pitch: 25,
          amplitude: 100,
        });
        if (!wav || !enabled) continue;
        await playWav(wav);
      } catch {
        // One unreadable message must not stall the ones behind it, and a
        // stream losing its tip voice is not worth a toast on every gift.
      }
    }
  } finally {
    draining = false;
  }
}

function playWav(base64: string): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(`data:audio/wav;base64,${base64}`);
    current = audio;
    const done = () => {
      if (current === audio) current = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    // Autoplay is blocked until the viewer has interacted with the page. They
    // pressed play on a live stream to get here, so it normally is not — but
    // a rejection must resolve rather than hang the queue forever.
    audio.play().catch(done);
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
  queue.push({ text });
  while (queue.length > MAX_QUEUE) queue.shift();
  void drain();
}

/** Pull the module down ahead of the first gift, so nobody waits on the CDN. */
export function warmTipTts(): void {
  void loadEngine().catch(() => undefined);
}

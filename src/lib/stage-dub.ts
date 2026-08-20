/**
 * Live dubbing — the wire format, the viewer's choice, and the playback queue.
 * ===========================================================================
 *
 * Dubbing rides the caption pipeline rather than duplicating it. A sentence is
 * already transcribed on the speaker's machine and translated into the
 * languages the room is reading; dubbing adds one more step on the same
 * trigger — speak that translation — and one more broadcast event carrying the
 * audio.
 *
 * What makes it different from subtitles is that it costs real money per
 * minute and that audio takes time to play. Both of those live here.
 */

import { useSyncExternalStore } from 'react';

export const DUB_AUDIO_EVENT = 'caption-audio';

export interface StageDubAudio {
  /** The utterance this speaks — the same id the caption and translation carried. */
  id: string;
  /** Language code this clip is in. */
  lang: string;
  /** Base64 MP3. */
  audio: string;
}

/** One paid block, as the client sees it. */
export interface DubEntitlement {
  token: string;
  expiresAt: number;
  priceDhb: number;
  clonedVoice: boolean;
}

/**
 * Buy the next block this long before the current one lapses. Long enough to
 * cover a round trip and a slow wallet lookup, short enough that a listener
 * who stops in the next few seconds has not paid for much they did not hear.
 */
export const DUB_RENEW_LEAD_MS = 5000;

/**
 * How far behind the room the dub may fall before we stop and refund.
 *
 * Translated speech takes longer to say than the English it replaces — around
 * 20% longer for Spanish, French and German — so a long stage accumulates lag
 * whatever the pipeline does. Speeding playback claws some of it back; past
 * this the listener is hearing a different topic from the one on screen, and
 * charging for that is how a paid feature earns a refund instead of a renewal.
 */
export const DUB_MAX_BACKLOG_MS = 8000;

/** Room volume (0-100) while a dub clip is playing. Ducked, not muted. */
export const DUB_DUCK_VOLUME = 15;
export const DUB_FULL_VOLUME = 100;

// ─── Viewer preference ───────────────────────────────────────────────────────

const DUB_LANG_KEY = 'dehub.stage.dub.lang';

let dubLanguage: string | null = null;
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

/**
 * Deliberately NOT restored from localStorage on load.
 *
 * Every other caption preference is sticky, and this one must not be: it spends
 * DHB by the minute. A listener who dubbed a stage last week and opens a new
 * one should not start being charged because a value survived in their browser.
 * Turning it on is always a deliberate act in the current session.
 */
export function useDubLanguage(): string | null {
  return useSyncExternalStore(subscribe, () => dubLanguage, () => null);
}

export function setDubLanguage(value: string | null) {
  if (dubLanguage === value) return;
  dubLanguage = value;
  try {
    // Kept only so a page refresh mid-stage can tell the difference between
    // "never chose" and "chose, then reloaded" if we ever want to offer resume.
    if (value) window.sessionStorage.setItem(DUB_LANG_KEY, value);
    else window.sessionStorage.removeItem(DUB_LANG_KEY);
  } catch {
    /* private mode — nothing depends on this persisting */
  }
  emit();
}

// ─── Playback ────────────────────────────────────────────────────────────────

/**
 * Plays dub clips one after another and keeps an eye on how far behind it is.
 *
 * Sequential by construction: two overlapping sentences in the same voice are
 * unintelligible, so a clip never starts before the previous one ends. That
 * makes backlog the thing to watch — every clip that arrives while another is
 * playing pushes the queue further behind the live room.
 */
export class DubPlayer {
  private queue: Array<{ id: string; url: string; approxMs: number }> = [];
  private current: HTMLAudioElement | null = null;
  private objectUrls = new Set<string>();
  private stopped = false;

  constructor(
    private readonly onDuck: (ducked: boolean) => void,
    private readonly onBacklog: (ms: number) => void,
  ) {}

  /** Rough play length of an MP3 at our fixed 32 kbps, from its byte size. */
  private static approxDurationMs(bytes: number): number {
    return (bytes / 4000) * 1000;
  }

  enqueue(id: string, base64: string) {
    if (this.stopped) return;
    try {
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      this.objectUrls.add(url);
      this.queue.push({ id, url, approxMs: DubPlayer.approxDurationMs(bytes.length) });
      this.onBacklog(this.backlogMs());
      if (!this.current) void this.playNext();
    } catch {
      /* a clip we cannot decode is one sentence read instead of heard */
    }
  }

  /** Estimated milliseconds of audio still waiting to be played. */
  backlogMs(): number {
    return this.queue.reduce((total, clip) => total + clip.approxMs, 0);
  }

  /**
   * Playback speed for the current backlog. Mild and capped: a familiar voice
   * sped up past about 1.25 stops sounding like the person it was cloned from,
   * which is the whole thing the listener paid for.
   */
  private rateForBacklog(): number {
    const backlog = this.backlogMs();
    if (backlog < 2000) return 1;
    if (backlog < 4000) return 1.1;
    return 1.25;
  }

  private async playNext(): Promise<void> {
    if (this.stopped) return;
    const next = this.queue.shift();
    this.onBacklog(this.backlogMs());
    if (!next) {
      this.current = null;
      this.onDuck(false);
      return;
    }

    const audio = new Audio(next.url);
    audio.playbackRate = this.rateForBacklog();
    this.current = audio;
    this.onDuck(true);

    const done = () => {
      this.releaseUrl(next.url);
      if (this.current === audio) void this.playNext();
    };
    audio.onended = done;
    audio.onerror = done;

    try {
      await audio.play();
    } catch {
      // Autoplay refused, or the element went away. Move on rather than
      // stalling the queue behind a clip that will never start.
      done();
    }
  }

  private releaseUrl(url: string) {
    if (!this.objectUrls.has(url)) return;
    URL.revokeObjectURL(url);
    this.objectUrls.delete(url);
  }

  /** Drop everything queued but let the clip in flight finish. */
  flush() {
    for (const clip of this.queue) this.releaseUrl(clip.url);
    this.queue = [];
    this.onBacklog(0);
  }

  stop() {
    this.stopped = true;
    this.flush();
    if (this.current) {
      try {
        this.current.pause();
      } catch {
        /* already gone */
      }
      this.current = null;
    }
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    this.onDuck(false);
  }
}

// ─── The paid-up token ───────────────────────────────────────────────────────
//
// The listener buys a minute; the SPEAKERS' clients are what then have to
// generate audio. The two are connected over Realtime presence: the listener
// publishes its entitlement token alongside its language, and a speaker hands
// that token back when asking for a line to be spoken.
//
// It lives in a module store rather than on the entitlement hook because the
// thing that publishes presence is the caption feed, in a different component
// from the meter that buys the blocks.

let dubToken: string | null = null;

export function useDubToken(): string | null {
  return useSyncExternalStore(subscribe, () => dubToken, () => null);
}

export function setDubToken(value: string | null) {
  if (dubToken === value) return;
  dubToken = value;
  emit();
}

export function getDubToken(): string | null {
  return dubToken;
}

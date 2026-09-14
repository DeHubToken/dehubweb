/**
 * Error feedback — the sound a refusal makes
 * ==========================================
 * Tapping Follow twenty times in ten seconds gets the last few taps rejected
 * by the API's rate limiter, and that used to arrive as a generic "Failed to
 * follow" toast — which reads as a bug rather than as "you are going too
 * fast", and is easy to miss while the cursor is still clicking.
 *
 * A throttled request now gets a short descending two-tone — the universal
 * "no" — alongside one toast that says to slow down. Twin of the mobile app's
 * `libs/error-feedback.ts`, down to the two pitches.
 *
 * The tone is synthesised with WebAudio rather than served as a file: it is
 * two oscillators and no request, so nothing about it can 404 behind the SPA
 * catch-all or arrive late on the tap that needed it.
 *
 * @module lib/error-feedback
 */

import i18n from 'i18next';
import { toast } from 'sonner';

/** Two rejections inside this window are one event to the reader. */
const REPEAT_WINDOW_MS = 1500;
let lastPlayedAt = 0;

let audioContext: AudioContext | null = null;

/** True once per window, so a burst of rejections is announced once. */
function withinRepeatWindow(): boolean {
  const now = Date.now();
  if (now - lastPlayedAt < REPEAT_WINDOW_MS) return true;
  lastPlayedAt = now;
  return false;
}

/** A-flat then E-flat, the second one fading out: a short, unmistakable "no". */
function playSound(): void {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioContext = audioContext ?? new Ctor();
    // Autoplay policy suspends a context created before the first gesture.
    void audioContext.resume?.();

    const ctx = audioContext;
    const start = ctx.currentTime;
    const tones: Array<[frequency: number, at: number, duration: number]> = [
      [415, 0, 0.09],
      [311, 0.09, 0.19],
    ];

    for (const [frequency, at, duration] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      const from = start + at;
      const to = from + duration;
      // Ramped rather than switched, or the edges click.
      gain.gain.setValueAtTime(0, from);
      gain.gain.linearRampToValueAtTime(0.16, from + 0.004);
      gain.gain.setValueAtTime(0.16, to - 0.02);
      gain.gain.linearRampToValueAtTime(0, to);
      osc.connect(gain).connect(ctx.destination);
      osc.start(from);
      osc.stop(to);
    }
  } catch {
    // A UI sound is never worth an exception reaching the caller.
  }
}

/** Play the short failure tone, at most once per window. Never throws. */
export function playErrorSound(): void {
  if (withinRepeatWindow()) return;
  playSound();
}

/** True when a thrown API error is the server's rate limiter talking. */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = (error as { status?: number }).status;
  if (status === 429) return true;
  const message = String((error as { message?: unknown }).message ?? '');
  return /\b429\b|too many requests|rate limit/i.test(message);
}

/**
 * Announce the failure if — and only if — it is the limiter. Returns whether
 * it was, so the caller can skip its own message.
 */
export function announceIfRateLimited(error: unknown): boolean {
  if (!isRateLimitError(error)) return false;
  notifyRateLimited();
  return true;
}

/** Announce a rate-limited action: the tone plus a single "slow down" toast. */
export function notifyRateLimited(): void {
  if (withinRepeatWindow()) return;
  playSound();
  const message = i18n.t('toasts.rate_limited', { defaultValue: 'Rate limited, slow down' });
  toast.error(message, { id: 'rate-limited', duration: 2500 });
}

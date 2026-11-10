/**
 * Follow back chime: the sound "Follow back all" makes when it appears
 * ======================================================================
 * Two soft bell notes a fifth apart (G5 then D6), each a sine with a faint
 * octave above it and a quick decay, so it reads as a light "ding-ding" under
 * whatever else is playing rather than an alert.
 *
 * Twin of the app's assets/sounds/follow-back.wav (rendered from the same
 * notes by scripts/render-follow-back-chime.py in riftn-mobile).
 *
 * Synthesised with WebAudio like lib/error-feedback: no file to fetch, so it
 * can never arrive late. The button only appears right after a Follow tap, so
 * the page always has the user gesture browsers want before playing audio.
 *
 * @module lib/follow-back-chime
 */

let audioContext: AudioContext | null = null;

/** Notes as [frequency Hz, start s, length s]. */
const NOTES: Array<[number, number, number]> = [
  [784, 0, 0.32],
  [1175, 0.075, 0.42],
];

/** Peak level. Quiet on purpose: this is a nudge, not a notification. */
const PEAK = 0.06;

/** Play the chime once. Silent in a background tab. Never throws. */
export function playFollowBackChime(): void {
  try {
    if (typeof window === 'undefined' || document.hidden) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioContext = audioContext ?? new Ctor();
    void audioContext.resume?.();

    const ctx = audioContext;
    const start = ctx.currentTime + 0.01;

    for (const [frequency, at, length] of NOTES) {
      for (const [multiple, level] of [[1, 1], [2, 0.18]] as const) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency * multiple;
        const from = start + at;
        const to = from + length;
        // A 6ms attack so the edge doesn't click, then a bell-like fall.
        gain.gain.setValueAtTime(0.0001, from);
        gain.gain.exponentialRampToValueAtTime(PEAK * level, from + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, to);
        osc.connect(gain).connect(ctx.destination);
        osc.start(from);
        osc.stop(to + 0.02);
      }
    }
  } catch {
    // A UI sound is never worth an exception reaching the caller.
  }
}

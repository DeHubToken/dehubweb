/**
 * dehub-caption-pcm — AudioWorklet that turns a stage microphone into the
 * frames a streaming speech-to-text socket wants.
 *
 * The browser hands us Float32 at the AudioContext's own rate (44.1 or 48 kHz,
 * device-dependent). Deepgram's live endpoint is told `linear16 / 16000 / mono`,
 * so the resampling has to happen somewhere; doing it here keeps the main
 * thread free of a 48 kHz callback and lets us ship one small Int16 buffer per
 * ~64 ms instead of 375 tiny ones a second.
 *
 * Each message also carries the frame's RMS level. That is not cosmetic: the
 * hook uses it to close the socket while nobody is talking, which is the
 * difference between billing for a two-hour stage and billing for the minutes
 * somebody actually spoke.
 *
 * Vendored as a plain file under public/ for the same reason as
 * dehub-phase-vocoder.js — addModule() takes a URL, not a bundled import.
 */

const TARGET_RATE = 16000;
/** ~64 ms at 16 kHz. Small enough to keep captions prompt, big enough to not spam postMessage. */
const FRAME_SAMPLES = 1024;

class CaptionPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // `sampleRate` is a global inside the worklet scope — the context's real rate.
    this.ratio = sampleRate / TARGET_RATE;
    /** Input samples not yet consumed by the resampler. */
    this.pending = new Float32Array(0);
    /** Fractional read position inside `pending`. */
    this.frac = 0;
    this.out = new Int16Array(FRAME_SAMPLES);
    this.outLen = 0;
    this.sumSquares = 0;
  }

  emit() {
    const level = Math.sqrt(this.sumSquares / Math.max(1, this.outLen));
    // Copy, because the buffer is transferred away and `this.out` is reused.
    const frame = this.out.slice(0, this.outLen);
    this.port.postMessage({ pcm: frame.buffer, level }, [frame.buffer]);
    this.outLen = 0;
    this.sumSquares = 0;
  }

  push(sample) {
    const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample;
    this.out[this.outLen++] = clamped * 0x7fff;
    this.sumSquares += clamped * clamped;
    if (this.outLen >= FRAME_SAMPLES) this.emit();
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    // No input yet (or the track went away): stay alive, the node is reused.
    if (!channel || channel.length === 0) return true;

    // Carry unconsumed samples across blocks so the linear interpolation never
    // reads past the end of a 128-sample render quantum and clicks.
    const merged = new Float32Array(this.pending.length + channel.length);
    merged.set(this.pending, 0);
    merged.set(channel, this.pending.length);

    let pos = this.frac;
    while (pos + 1 < merged.length) {
      const i = pos | 0;
      const f = pos - i;
      this.push(merged[i] * (1 - f) + merged[i + 1] * f);
      pos += this.ratio;
    }

    const consumed = pos | 0;
    this.pending = merged.slice(consumed);
    this.frac = pos - consumed;
    return true;
  }
}

registerProcessor('dehub-caption-pcm', CaptionPcmProcessor);

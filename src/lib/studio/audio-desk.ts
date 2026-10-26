/**
 * Audio desk
 * ==========
 * One mixer for everything a browser broadcast sends as sound: the mic (after
 * the voice-effect graph), the game or tab audio a screen share or capture
 * card brings, and a video clip the creator plays on stream. Each has its own
 * volume, mute and level meter, the mic gets a noise gate, and a limiter on
 * the master stops a loud moment clipping for everyone watching.
 *
 * The output track never changes hands. Before this, every screen-share
 * transition built a fresh two-input mix and swapped it onto the sender, and a
 * broadcast that started silent could never grow sound later (WHIP only has
 * the senders it opened with). Inputs now come and go behind a track that was
 * on the sender from the first frame.
 *
 * Inputs are borrowed, never owned: closing the desk leaves the mic, the
 * share and the clip running.
 */
import { createLogger } from '@/lib/logger';

const logger = createLogger('AudioDesk');

export type DeskChannel = 'mic' | 'game' | 'clip';
export const DESK_CHANNELS: readonly DeskChannel[] = ['mic', 'game', 'clip'];

/** How hard the gate closes on the mic between words. */
export type GateStrength = 'off' | 'low' | 'high';

/** dBFS below which the gate closes, per strength. */
export const GATE_THRESHOLD_DB: Record<GateStrength, number> = { off: -100, low: -55, high: -42 };

export const MAX_VOLUME = 2;

export interface AudioDesk {
  /** The mixed sound, for the sender. Stable for the desk's life. */
  track: MediaStreamTrack;
  setInput: (channel: DeskChannel, track: MediaStreamTrack | null) => void;
  /** A <video> whose sound is the clip channel (a file has no track to borrow everywhere). */
  setClipElement: (element: HTMLMediaElement | null) => void;
  /** 0 – MAX_VOLUME; 1 is unchanged. */
  setVolume: (channel: DeskChannel, volume: number) => void;
  setMuted: (channel: DeskChannel, muted: boolean) => void;
  setGate: (strength: GateStrength) => void;
  gateSupported: () => boolean;
  /** Peak level 0–1 of what the channel is sending right now, for meters. */
  level: (channel: DeskChannel) => number;
  hasInput: (channel: DeskChannel) => boolean;
  resume: () => Promise<void>;
  close: () => void;
}

export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(MAX_VOLUME, Math.max(0, volume));
}

/**
 * The gate, as an AudioWorklet so it runs on the audio thread. It follows the
 * signal's peak with a fast attack and a slow release and ramps its gain
 * rather than switching it, so words are not clipped at the edges and the
 * room tone between them fades instead of chopping.
 */
const GATE_SOURCE = `
class DehubGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'threshold', defaultValue: -100, minValue: -100, maxValue: 0 }];
  }
  constructor() { super(); this.env = 0; this.gain = 1; this.hold = 0; }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length) return true;
    const threshold = Math.pow(10, parameters.threshold[0] / 20);
    const open = parameters.threshold[0] <= -99;
    const frames = input[0].length;
    for (let i = 0; i < frames; i++) {
      let peak = 0;
      for (let c = 0; c < input.length; c++) {
        const v = Math.abs(input[c][i]);
        if (v > peak) peak = v;
      }
      this.env = peak > this.env ? peak : this.env * 0.9997;
      if (open || this.env > threshold) { this.hold = 4800; }
      else if (this.hold > 0) { this.hold--; }
      const target = this.hold > 0 ? 1 : 0;
      this.gain += (target - this.gain) * (target > this.gain ? 0.01 : 0.0008);
      for (let c = 0; c < output.length; c++) {
        output[c][i] = (input[c] ? input[c][i] : input[0][i]) * this.gain;
      }
    }
    return true;
  }
}
registerProcessor('dehub-gate', DehubGate);
`;

interface Strip {
  gain: GainNode;
  analyser: AnalyserNode;
  buffer: Float32Array;
  source: AudioNode | null;
  track: MediaStreamTrack | null;
  volume: number;
  muted: boolean;
}

export async function createAudioDesk(): Promise<AudioDesk> {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio is unavailable');

  const ctx = new Ctor();
  const destination = ctx.createMediaStreamDestination();

  // A limiter on the master: fast, high ratio, just under full scale.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  limiter.connect(destination);

  // The gate sits on the mic strip only: game audio and clips are music, and
  // gating music is how it ends up stuttering.
  let gate: AudioWorkletNode | null = null;
  try {
    if (ctx.audioWorklet) {
      const url = URL.createObjectURL(new Blob([GATE_SOURCE], { type: 'text/javascript' }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      gate = new AudioWorkletNode(ctx, 'dehub-gate', { channelCountMode: 'max' });
    }
  } catch (error) {
    logger.warn('Noise gate unavailable; the mic goes out ungated', error);
    gate = null;
  }

  const strips = {} as Record<DeskChannel, Strip>;
  for (const channel of DESK_CHANNELS) {
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    gain.connect(analyser);
    gain.connect(limiter);
    strips[channel] = {
      gain,
      analyser,
      buffer: new Float32Array(analyser.fftSize),
      source: null,
      track: null,
      volume: 1,
      muted: false,
    };
  }
  // mic → gate → strip gain. Without a gate the mic feeds the strip directly.
  const micInput: AudioNode = gate ?? strips.mic.gain;
  if (gate) gate.connect(strips.mic.gain);

  const applyGain = (channel: DeskChannel) => {
    const strip = strips[channel];
    const value = strip.muted ? 0 : strip.volume;
    // A short ramp: a hard step clicks.
    strip.gain.gain.setTargetAtTime(value, ctx.currentTime, 0.02);
  };

  const detach = (channel: DeskChannel) => {
    const strip = strips[channel];
    try {
      strip.source?.disconnect();
    } catch {
      /* already gone */
    }
    strip.source = null;
    strip.track = null;
  };

  const clipElements = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

  // Built after an await rather than inside a click, so the autoplay policy
  // can hand back a suspended context — which emits pure silence.
  void ctx.resume().catch(() => undefined);

  const track = destination.stream.getAudioTracks()[0];
  if (!track) {
    void ctx.close().catch(() => undefined);
    throw new Error('The audio desk produced no track');
  }

  return {
    track,
    setInput: (channel, input) => {
      if (strips[channel].track === input) return;
      detach(channel);
      if (!input) return;
      const node = ctx.createMediaStreamSource(new MediaStream([input]));
      node.connect(channel === 'mic' ? micInput : strips[channel].gain);
      strips[channel].source = node;
      strips[channel].track = input;
    },
    setClipElement: (element) => {
      detach('clip');
      if (!element) return;
      // An element can only ever be given one source node, so it is cached.
      let node = clipElements.get(element);
      if (!node) {
        node = ctx.createMediaElementSource(element);
        clipElements.set(element, node);
      }
      node.connect(strips.clip.gain);
      strips.clip.source = node;
    },
    setVolume: (channel, volume) => {
      strips[channel].volume = clampVolume(volume);
      applyGain(channel);
    },
    setMuted: (channel, muted) => {
      strips[channel].muted = muted;
      applyGain(channel);
    },
    setGate: (strength) => {
      gate?.parameters.get('threshold')?.setValueAtTime(GATE_THRESHOLD_DB[strength], ctx.currentTime);
    },
    gateSupported: () => Boolean(gate),
    level: (channel) => {
      const strip = strips[channel];
      if (!strip.source) return 0;
      strip.analyser.getFloatTimeDomainData(strip.buffer as Float32Array<ArrayBuffer>);
      let peak = 0;
      for (let i = 0; i < strip.buffer.length; i++) {
        const v = Math.abs(strip.buffer[i]);
        if (v > peak) peak = v;
      }
      return Math.min(1, peak);
    },
    hasInput: (channel) => Boolean(strips[channel].source),
    resume: () => ctx.resume().catch(() => undefined),
    close: () => {
      DESK_CHANNELS.forEach(detach);
      track.stop();
      void ctx.close().catch(() => undefined);
    },
  };
}

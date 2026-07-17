/**
 * Real-time pitch shifter for Stages voice effects.
 *
 * Web Audio has no native pitch-shift node, so we use the classic granular
 * delay-line technique ("Jungle", after Chris Wilson's Audio-Input-Effects
 * demo): two delay lines whose delay time is swept by looping ramp buffers,
 * cross-faded so the seams are inaudible. Sweeping the delay changes playback
 * rate → shifts pitch without changing tempo.
 *
 * Pure AudioNode graph — no AudioWorklet / ScriptProcessor — so it runs
 * everywhere and adds only ~100ms latency (fine for a fun voice changer).
 *
 * Usage:
 *   const shifter = createPitchShifter(ctx, -0.5); // negative = down, positive = up
 *   source.connect(shifter.input);
 *   shifter.output.connect(next);
 *   // on teardown: stop shifter.sources, disconnect shifter.nodes
 */

const DELAY_TIME = 0.1; // seconds — nominal delay of each line
const FADE_TIME = 0.05; // seconds — cross-fade window between the two lines
const BUFFER_TIME = 0.1; // seconds — length of one modulation cycle

export interface PitchShifter {
  input: GainNode;
  output: GainNode;
  /** All AudioNodes to disconnect on teardown. */
  nodes: AudioNode[];
  /** Looping buffer sources (the LFOs) to stop on teardown. */
  sources: AudioScheduledSourceNode[];
}

/** Cross-fade envelope: fades in, holds, fades out, then a silent tail. */
function createFadeBuffer(ctx: BaseAudioContext, activeTime: number, fadeTime: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const length1 = Math.floor(activeTime * sr);
  const length2 = Math.floor((activeTime - 2 * fadeTime) * sr);
  const length = length1 + length2;
  const buffer = ctx.createBuffer(1, length, sr);
  const p = buffer.getChannelData(0);

  const fadeLength = fadeTime * sr;
  const fadeIndex1 = fadeLength;
  const fadeIndex2 = length1 - fadeLength;

  for (let i = 0; i < length1; ++i) {
    let value: number;
    if (i < fadeIndex1) value = Math.sqrt(i / fadeLength);
    else if (i >= fadeIndex2) value = Math.sqrt(1 - (i - fadeIndex2) / fadeLength);
    else value = 1;
    p[i] = value;
  }
  for (let i = length1; i < length; ++i) p[i] = 0;
  return buffer;
}

/** Delay-time ramp: linear sweep (up or down) over one cycle, then a silent tail. */
function createDelayTimeBuffer(
  ctx: BaseAudioContext,
  activeTime: number,
  fadeTime: number,
  shiftUp: boolean,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const length1 = Math.floor(activeTime * sr);
  const length2 = Math.floor((activeTime - 2 * fadeTime) * sr);
  const length = length1 + length2;
  const buffer = ctx.createBuffer(1, length, sr);
  const p = buffer.getChannelData(0);

  for (let i = 0; i < length1; ++i) {
    if (shiftUp) p[i] = (length1 - i) / length; // ramp down → shift up
    else p[i] = i / length1; // ramp up → shift down
  }
  for (let i = length1; i < length; ++i) p[i] = 0;
  return buffer;
}

/**
 * Build a pitch shifter. `mult` in roughly [-1, 1]:
 *   -1 ≈ one octave down, +1 ≈ one octave up, 0 ≈ no shift.
 */
export function createPitchShifter(ctx: AudioContext, mult: number): PitchShifter {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const shiftDownBuffer = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, false);
  const shiftUpBuffer = createDelayTimeBuffer(ctx, BUFFER_TIME, FADE_TIME, true);
  const fadeBuffer = createFadeBuffer(ctx, BUFFER_TIME, FADE_TIME);

  // Delay-time modulators. mod1/2 sweep down, mod3/4 sweep up; the pair that is
  // active depends on shift direction (gated by mod*Gain below).
  const mod1 = ctx.createBufferSource();
  const mod2 = ctx.createBufferSource();
  const mod3 = ctx.createBufferSource();
  const mod4 = ctx.createBufferSource();
  mod1.buffer = shiftDownBuffer;
  mod2.buffer = shiftDownBuffer;
  mod3.buffer = shiftUpBuffer;
  mod4.buffer = shiftUpBuffer;
  [mod1, mod2, mod3, mod4].forEach((m) => (m.loop = true));

  const up = mult > 0;
  const mod1Gain = ctx.createGain();
  const mod2Gain = ctx.createGain();
  const mod3Gain = ctx.createGain();
  const mod4Gain = ctx.createGain();
  mod1Gain.gain.value = up ? 0 : 1;
  mod2Gain.gain.value = up ? 0 : 1;
  mod3Gain.gain.value = up ? 1 : 0;
  mod4Gain.gain.value = up ? 1 : 0;

  mod1.connect(mod1Gain);
  mod2.connect(mod2Gain);
  mod3.connect(mod3Gain);
  mod4.connect(mod4Gain);

  // Depth of delay modulation → amount of pitch shift.
  const depth = DELAY_TIME * Math.abs(mult);
  const modGain1 = ctx.createGain();
  const modGain2 = ctx.createGain();
  modGain1.gain.value = 0.5 * depth;
  modGain2.gain.value = 0.5 * depth;

  const delay1 = ctx.createDelay();
  const delay2 = ctx.createDelay();
  mod1Gain.connect(modGain1);
  mod2Gain.connect(modGain2);
  mod3Gain.connect(modGain1);
  mod4Gain.connect(modGain2);
  modGain1.connect(delay1.delayTime);
  modGain2.connect(delay2.delayTime);

  // Cross-fade the two delay lines so the delay-buffer wrap is inaudible.
  const fade1 = ctx.createBufferSource();
  const fade2 = ctx.createBufferSource();
  fade1.buffer = fadeBuffer;
  fade2.buffer = fadeBuffer;
  fade1.loop = true;
  fade2.loop = true;

  const mix1 = ctx.createGain();
  const mix2 = ctx.createGain();
  mix1.gain.value = 0;
  mix2.gain.value = 0;
  fade1.connect(mix1.gain);
  fade2.connect(mix2.gain);

  input.connect(delay1);
  input.connect(delay2);
  delay1.connect(mix1);
  delay2.connect(mix2);
  mix1.connect(output);
  mix2.connect(output);

  // Stagger the two lines by half a cycle so their fades interleave.
  const t = ctx.currentTime + 0.05;
  const t2 = t + BUFFER_TIME - FADE_TIME;
  mod1.start(t);
  mod2.start(t2);
  mod3.start(t);
  mod4.start(t2);
  fade1.start(t);
  fade2.start(t2);

  return {
    input,
    output,
    nodes: [
      input, output,
      mod1Gain, mod2Gain, mod3Gain, mod4Gain,
      modGain1, modGain2, delay1, delay2, mix1, mix2,
    ],
    sources: [mod1, mod2, mod3, mod4, fade1, fade2],
  };
}

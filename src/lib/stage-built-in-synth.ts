/**
 * Offline-render built-in soundboard effects that have no audio file,
 * output WAV Blobs suitable for injectAudio → Agora.
 */

import { audioBufferToWav } from './audio-buffer-to-wav';

const SAMPLE_RATE = 48000;

export async function synthBuiltInToWavBlob(
  effectId: string,
  volume: number,
): Promise<Blob | null> {
  const vol = volume / 100;
  switch (effectId) {
    case 'buzzer':
      return buzzer(vol);
    case 'ding':
      return ding(vol);
    case 'boo':
      return boo(vol);
    case 'countdown':
      return countdown(vol);
    default:
      return null;
  }
}

async function renderOffline(render: (ctx: OfflineAudioContext, dest: GainNode) => void, durationSec: number): Promise<Blob> {
  const length = Math.ceil(SAMPLE_RATE * durationSec);
  const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
  const gain = offline.createGain();
  gain.gain.value = 1;
  gain.connect(offline.destination);
  render(offline, gain);
  const buffer = await offline.startRendering();
  return audioBufferToWav(buffer);
}

function buzzer(vol: number): Promise<Blob> {
  return renderOffline((ctx, dest) => {
    const g = ctx.createGain();
    g.gain.value = vol * 0.5;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 200;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, 0);
    env.gain.linearRampToValueAtTime(1, 0.02);
    env.gain.linearRampToValueAtTime(0, 0.5);
    osc.connect(env);
    env.connect(g);
    g.connect(dest);
    osc.start(0);
    osc.stop(0.5);
  }, 0.55);
}

function ding(vol: number): Promise<Blob> {
  return renderOffline((ctx, dest) => {
    const g = ctx.createGain();
    g.gain.value = vol * 0.5;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, 0);
    env.gain.linearRampToValueAtTime(1, 0.02);
    env.gain.linearRampToValueAtTime(0, 0.3);
    osc.connect(env);
    env.connect(g);
    g.connect(dest);
    osc.start(0);
    osc.stop(0.3);
  }, 0.35);
}

function boo(vol: number): Promise<Blob> {
  return renderOffline((ctx, dest) => {
    const g = ctx.createGain();
    g.gain.value = vol * 0.5;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 100;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, 0);
    env.gain.linearRampToValueAtTime(1, 0.02);
    env.gain.linearRampToValueAtTime(0, 0.6);
    osc.connect(env);
    env.connect(g);
    g.connect(dest);
    osc.start(0);
    osc.stop(0.6);
  }, 0.65);
}

function countdown(vol: number): Promise<Blob> {
  return renderOffline((ctx, dest) => {
    const master = ctx.createGain();
    master.gain.value = vol * 0.5;
    master.connect(dest);
    [0, 1, 2, 3].forEach((i) => {
      const osc = ctx.createOscillator();
      const beepGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 3 ? 880 : 440;
      const start = i * 0.8;
      beepGain.gain.setValueAtTime(0, start);
      beepGain.gain.linearRampToValueAtTime(0.5, start + 0.02);
      beepGain.gain.linearRampToValueAtTime(0, start + (i === 3 ? 0.6 : 0.3));
      osc.connect(beepGain);
      beepGain.connect(master);
      osc.start(start);
      osc.stop(start + 0.8);
    });
  }, 3.5);
}

/**
 * useVoiceEffects – Web Audio API voice processing for Stages
 *
 * Takes a raw MediaStream from getUserMedia, routes it through
 * effect nodes, and returns a processed MediaStreamTrack suitable
 * for AgoraRTC.createCustomAudioTrack().
 *
 * Local monitoring: when an effect other than 'none' is active, the
 * processed output is also routed to ctx.destination at a reduced gain
 * (0.2) so the host/speaker can hear their own voice effect.  getUserMedia
 * AEC handles residual echo when speakers are in use.
 */

import { useCallback, useRef } from 'react';
import type { VoiceEffectId } from '@/constants/voice-effects.constants';
import { createPitchShifter } from '@/lib/stage-pitch-shifter';

/** Vendored phase-vocoder worklet (public/dehub-phase-vocoder.js). */
const PHASE_VOCODER_URL = '/dehub-phase-vocoder.js';
const PHASE_VOCODER_NAME = 'phase-vocoder-processor';
/**
 * Local self-monitor level. Kept at 0: routing the effected voice back to the
 * talker's own speaker causes feedback interference — the mic re-captures the
 * PITCH-SHIFTED playback, which getUserMedia's echo canceller can't cancel
 * (it no longer matches the reference), so it loops and builds up. The talker
 * doesn't need to hear their own effect anyway (listeners do, via Agora).
 */
const MONITOR_GAIN = 0;

interface AudioGraph {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  destination: MediaStreamAudioDestinationNode;
  /** All nodes that must be disconnected on teardown (including monitor gain & echo feedback loop nodes) */
  nodes: AudioNode[];
  /** Scheduled sources (ring-mod oscillators, pitch-shifter LFOs) to stop on teardown */
  sources?: AudioScheduledSourceNode[];
}

function createDistortionCurve(amount: number): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function disconnectEntireGraph(graph: AudioGraph) {
  try {
    graph.source.disconnect();
  } catch {
    /* noop */
  }
  for (const node of graph.nodes) {
    try {
      node.disconnect();
    } catch {
      /* noop */
    }
  }
  if (graph.sources) {
    for (const s of graph.sources) {
      try {
        s.stop();
        s.disconnect();
      } catch {
        /* noop */
      }
    }
  }
}

/**
 * Build the effect processing chain.
 * Connects source → effect nodes internally but does NOT connect to the
 * final destination — the caller wires output to both the Agora destination
 * and the local monitor gain.
 * Returns the output AudioNode (last in the chain) and any intermediate nodes
 * that need to be tracked for cleanup.
 */
/**
 * Pitch shifter. Prefers the phase-vocoder AudioWorklet (clean, ~43ms latency);
 * falls back to the delay-line shifter (works everywhere but warbles) when the
 * worklet module isn't loaded on this context. pitchFactor: >1 up, <1 down.
 */
function makePitch(
  ctx: AudioContext,
  pitchFactor: number,
  workletReady: boolean,
): { input: AudioNode; output: AudioNode; nodes: AudioNode[]; sources: AudioScheduledSourceNode[] } {
  if (workletReady) {
    try {
      const node = new AudioWorkletNode(ctx, PHASE_VOCODER_NAME);
      const param = node.parameters.get('pitchFactor');
      if (param) param.value = pitchFactor;
      return { input: node, output: node, nodes: [node], sources: [] };
    } catch {
      /* worklet not registered on this ctx — fall through to delay-line */
    }
  }
  // Map pitch ratio → delay-line mult (empirically ratio ≈ 1 + 0.5*mult).
  const s = createPitchShifter(ctx, 2 * (pitchFactor - 1));
  return { input: s.input, output: s.output, nodes: s.nodes, sources: s.sources };
}

function buildEffectChain(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  effectId: VoiceEffectId,
  workletReady = false,
): { nodes: AudioNode[]; sources?: AudioScheduledSourceNode[]; output: AudioNode } {
  switch (effectId) {
    case 'none':
      return { nodes: [], output: source };

    case 'deep': {
      // Anonymous / "movie" deep voice: clean phase-vocoder pitch drop (~6 st),
      // a little low-end weight, gentle lowpass to tame any vocoder fizz.
      const pitch = makePitch(ctx, 0.7, workletReady);
      const lowshelf = ctx.createBiquadFilter();
      lowshelf.type = 'lowshelf';
      lowshelf.frequency.value = 250;
      lowshelf.gain.value = 6;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3800;
      source.connect(pitch.input);
      pitch.output.connect(lowshelf);
      lowshelf.connect(lp);
      return { nodes: [...pitch.nodes, lowshelf, lp], sources: pitch.sources, output: lp };
    }

    case 'chipmunk': {
      // Clean phase-vocoder pitch shift up (~7 st), trim lows so it sounds small.
      const pitch = makePitch(ctx, 1.5, workletReady);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 180;
      source.connect(pitch.input);
      pitch.output.connect(hp);
      return { nodes: [...pitch.nodes, hp], sources: pitch.sources, output: hp };
    }

    case 'robot': {
      // Metallic robot: ring-modulate a band-limited copy of the voice, but MIX
      // it with the dry signal so words stay intelligible (pure ring modulation
      // nulls the fundamental and turns speech to mush).
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1600;
      bp.Q.value = 0.6;
      const carrier = ctx.createOscillator();
      carrier.type = 'square';
      carrier.frequency.value = 62;
      const ringGain = ctx.createGain();
      ringGain.gain.value = 0; // carrier drives it bipolar → ring modulation
      carrier.connect(ringGain.gain);
      const ringLevel = ctx.createGain();
      ringLevel.gain.value = 0.65;
      const dryLevel = ctx.createGain();
      dryLevel.gain.value = 0.45;
      const mix = ctx.createGain();
      source.connect(bp);
      bp.connect(ringGain);
      ringGain.connect(ringLevel);
      ringLevel.connect(mix);
      bp.connect(dryLevel);
      dryLevel.connect(mix);
      carrier.start();
      return { nodes: [bp, ringGain, ringLevel, dryLevel, mix], sources: [carrier], output: mix };
    }

    case 'echo': {
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.22;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.38;
      const wet = ctx.createGain();
      wet.gain.value = 0.75;
      const dry = ctx.createGain();
      dry.gain.value = 0.85;
      // Merge dry + wet into a single output node so both paths reach one point
      const merger = ctx.createGain();

      source.connect(dry);
      dry.connect(merger);
      source.connect(delay);
      delay.connect(wet);
      wet.connect(merger);
      delay.connect(feedback);
      feedback.connect(delay);

      return { nodes: [delay, feedback, wet, dry, merger], output: merger };
    }

    case 'radio': {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2000;
      bp.Q.value = 5;
      const ws = ctx.createWaveShaper();
      ws.curve = createDistortionCurve(8) as any;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 500;
      source.connect(bp);
      bp.connect(ws);
      ws.connect(hp);
      return { nodes: [bp, ws, hp], output: hp };
    }

    default:
      return { nodes: [], output: source };
  }
}

export function useVoiceEffects() {
  const graphRef = useRef<AudioGraph | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  /** The clip currently playing via injectSound, so it can be cut off (DJ-deck). */
  const activeInjectionRef = useRef<{ src: AudioBufferSourceNode; stop: () => void } | null>(null);

  const processStream = useCallback(async (stream: MediaStream, effectId: VoiceEffectId = 'none'): Promise<MediaStreamTrack> => {
    rawStreamRef.current = stream;

    const ctx = new AudioContext();
    await ctx.resume();

    // Load the phase-vocoder worklet for pitch effects (clean, low-latency).
    // Cheap and browser-cached; skipped for effects that don't need pitch shift.
    let workletReady = false;
    if (effectId === 'deep' || effectId === 'chipmunk') {
      try {
        await ctx.audioWorklet.addModule(PHASE_VOCODER_URL);
        workletReady = true;
      } catch (err) {
        console.warn('[VoiceFX] phase-vocoder worklet failed to load; using fallback shifter', err);
      }
    }

    const source = ctx.createMediaStreamSource(stream);
    const destination = ctx.createMediaStreamDestination();

    const { nodes, sources, output } = buildEffectChain(ctx, source, effectId, workletReady);

    // Agora path: processed audio → Agora channel (heard by other participants)
    output.connect(destination);

    // Self-monitor path: host/speaker hears their own voice effect locally.
    // Gain is 0 for 'none' (no loopback needed) and MONITOR_GAIN for active
    // effects (low enough that getUserMedia AEC handles residual speaker echo).
    const monitorGain = ctx.createGain();
    monitorGain.gain.value = effectId !== 'none' ? MONITOR_GAIN : 0;
    output.connect(monitorGain);
    monitorGain.connect(ctx.destination);

    graphRef.current = { ctx, source, destination, nodes: [...nodes, monitorGain], sources };
    return destination.stream.getAudioTracks()[0];
  }, []);

  const switchEffect = useCallback((effectId: VoiceEffectId): MediaStreamTrack | null => {
    const graph = graphRef.current;
    const rawStream = rawStreamRef.current;
    if (!graph || !rawStream) return null;

    disconnectEntireGraph(graph);
    void graph.ctx.resume();

    const { nodes, sources, output } = buildEffectChain(graph.ctx, graph.source, effectId);
    output.connect(graph.destination);

    const monitorGain = graph.ctx.createGain();
    monitorGain.gain.value = effectId !== 'none' ? 0.2 : 0;
    output.connect(monitorGain);
    monitorGain.connect(graph.ctx.destination);

    graph.nodes = [...nodes, monitorGain];
    graph.sources = sources;

    return graph.destination.stream.getAudioTracks()[0];
  }, []);

  const cleanup = useCallback(() => {
    const graph = graphRef.current;
    if (graph) {
      disconnectEntireGraph(graph);
      try {
        graph.ctx.close();
      } catch {
        /* noop */
      }
      graphRef.current = null;
    }
    rawStreamRef.current = null;
  }, []);

  /**
   * Close the current AudioContext and build a brand-new one with the new effect,
   * reusing the same raw getUserMedia stream.
   * Returns a fresh MediaStreamTrack for Agora to publish.
   * Use this instead of switchEffect when you need Agora to see the new track
   * (Agora may snapshot the track reference at publish time).
   */
  const rebuildEffect = useCallback(async (effectId: VoiceEffectId): Promise<MediaStreamTrack | null> => {
    const rawStream = rawStreamRef.current;
    if (!rawStream) return null;

    // Tear down old AudioContext (frees Web Audio resources)
    const graph = graphRef.current;
    if (graph) {
      disconnectEntireGraph(graph);
      try { graph.ctx.close(); } catch { /* noop */ }
      graphRef.current = null;
    }

    // processStream stores rawStream in rawStreamRef and builds a fresh ctx
    // (async: it may load the phase-vocoder worklet for pitch effects).
    return processStream(rawStream, effectId);
  }, [processStream]);

  const getProcessedStream = useCallback((): MediaStream | null => {
    return graphRef.current?.destination.stream ?? null;
  }, []);

  /**
   * Enable/disable the raw microphone feeding the effect graph.
   * Used by injectAudio to silence the mic while a soundboard/TTS clip plays
   * (so the outgoing track carries only the clip, no mic bleed) without
   * tearing down the graph.
   */
  const setRawMicEnabled = useCallback((enabled: boolean) => {
    const raw = rawStreamRef.current;
    raw?.getAudioTracks().forEach((t) => { t.enabled = enabled; });
  }, []);

  /**
   * Play an audio clip by mixing it into the SAME MediaStreamDestination that
   * Agora already publishes for the mic. This is why listeners hear it: the clip
   * rides the exact track that carries the host's voice — no new Agora track, no
   * publish/unpublish, no fresh (possibly-suspended) AudioContext.
   *
   * Also routed to ctx.destination so the host hears local playback, and — because
   * it's mixed into the destination — it is captured by the stage recording too.
   *
   * Resolves when the clip finishes (or immediately if there is no active graph).
   * @param monitorGainValue local monitor level for the host (0 = silent to host).
   */
  const injectSound = useCallback(async (blob: Blob, monitorGainValue = 0.9): Promise<void> => {
    const graph = graphRef.current;
    if (!graph) return;
    const { ctx, destination } = graph;
    try { await ctx.resume(); } catch { /* noop */ }

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    const clipGain = ctx.createGain();
    clipGain.gain.value = 1;
    src.connect(clipGain);

    // → Agora (mixed into the published mic track) + stage recording
    clipGain.connect(destination);

    // → host's own speakers (local monitor)
    const monitor = ctx.createGain();
    monitor.gain.value = monitorGainValue;
    clipGain.connect(monitor);
    monitor.connect(ctx.destination);

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        if (activeInjectionRef.current?.src === src) activeInjectionRef.current = null;
        try { src.disconnect(); clipGain.disconnect(); monitor.disconnect(); } catch { /* noop */ }
        resolve();
      };
      // Cut the clip short with a tiny fade so there's no click/pop (DJ-deck stop).
      const stop = () => {
        try {
          const now = ctx.currentTime;
          clipGain.gain.cancelScheduledValues(now);
          clipGain.gain.setValueAtTime(clipGain.gain.value, now);
          clipGain.gain.linearRampToValueAtTime(0.0001, now + 0.03);
          src.stop(now + 0.04); // fires onended → done()
        } catch {
          done();
        }
      };
      activeInjectionRef.current = { src, stop };
      src.onended = done;
      try {
        src.start();
      } catch {
        done();
      }
    });
  }, []);

  /** Immediately cut off whatever clip injectSound is currently playing. */
  const stopInjectedSound = useCallback(() => {
    activeInjectionRef.current?.stop();
  }, []);

  return {
    processStream,
    switchEffect,
    rebuildEffect,
    cleanup,
    getProcessedStream,
    setRawMicEnabled,
    injectSound,
    stopInjectedSound,
  };
}

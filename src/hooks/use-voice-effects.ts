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

interface AudioGraph {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  destination: MediaStreamAudioDestinationNode;
  /** All nodes that must be disconnected on teardown (including monitor gain & echo feedback loop nodes) */
  nodes: AudioNode[];
  oscillators?: OscillatorNode[];
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
  if (graph.oscillators) {
    for (const o of graph.oscillators) {
      try {
        o.stop();
        o.disconnect();
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
function buildEffectChain(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  effectId: VoiceEffectId,
): { nodes: AudioNode[]; oscillators?: OscillatorNode[]; output: AudioNode } {
  switch (effectId) {
    case 'none':
      return { nodes: [], output: source };

    case 'deep': {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowshelf';
      lp.frequency.value = 400;
      lp.gain.value = 12;
      const lp2 = ctx.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = 2500;
      source.connect(lp);
      lp.connect(lp2);
      return { nodes: [lp, lp2], output: lp2 };
    }

    case 'chipmunk': {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highshelf';
      hp.frequency.value = 3000;
      hp.gain.value = 15;
      const hp2 = ctx.createBiquadFilter();
      hp2.type = 'highpass';
      hp2.frequency.value = 300;
      source.connect(hp);
      hp.connect(hp2);
      return { nodes: [hp, hp2], output: hp2 };
    }

    case 'robot': {
      // Metallic / robotic: band-limit + heavy waveshaping
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 180;
      const shaper = ctx.createWaveShaper();
      shaper.curve = createDistortionCurve(38) as any;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      source.connect(hp);
      hp.connect(shaper);
      shaper.connect(lp);
      return { nodes: [hp, shaper, lp], output: lp };
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

  const processStream = useCallback((stream: MediaStream, effectId: VoiceEffectId = 'none'): MediaStreamTrack => {
    rawStreamRef.current = stream;

    const ctx = new AudioContext();
    void ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const destination = ctx.createMediaStreamDestination();

    const { nodes, oscillators, output } = buildEffectChain(ctx, source, effectId);

    // Agora path: processed audio → Agora channel (heard by other participants)
    output.connect(destination);

    // Self-monitor path: host/speaker hears their own voice effect locally.
    // Gain is 0 for 'none' (no loopback needed) and 0.2 for active effects
    // (low enough that getUserMedia AEC handles residual echo from speakers).
    const monitorGain = ctx.createGain();
    monitorGain.gain.value = effectId !== 'none' ? 0.2 : 0;
    output.connect(monitorGain);
    monitorGain.connect(ctx.destination);

    graphRef.current = { ctx, source, destination, nodes: [...nodes, monitorGain], oscillators };
    return destination.stream.getAudioTracks()[0];
  }, []);

  const switchEffect = useCallback((effectId: VoiceEffectId): MediaStreamTrack | null => {
    const graph = graphRef.current;
    const rawStream = rawStreamRef.current;
    if (!graph || !rawStream) return null;

    disconnectEntireGraph(graph);
    void graph.ctx.resume();

    const { nodes, oscillators, output } = buildEffectChain(graph.ctx, graph.source, effectId);
    output.connect(graph.destination);

    const monitorGain = graph.ctx.createGain();
    monitorGain.gain.value = effectId !== 'none' ? 0.2 : 0;
    output.connect(monitorGain);
    monitorGain.connect(graph.ctx.destination);

    graph.nodes = [...nodes, monitorGain];
    graph.oscillators = oscillators;

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
  const rebuildEffect = useCallback((effectId: VoiceEffectId): MediaStreamTrack | null => {
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
    return processStream(rawStream, effectId);
  }, [processStream]);

  const getProcessedStream = useCallback((): MediaStream | null => {
    return graphRef.current?.destination.stream ?? null;
  }, []);

  return {
    processStream,
    switchEffect,
    rebuildEffect,
    cleanup,
    getProcessedStream,
  };
}

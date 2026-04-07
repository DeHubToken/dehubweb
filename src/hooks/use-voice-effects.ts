/**
 * useVoiceEffects – Web Audio API voice processing for Stages
 *
 * Takes a raw MediaStream from getUserMedia, routes it through
 * effect nodes, and returns a processed MediaStreamTrack suitable
 * for AgoraRTC.createCustomAudioTrack().
 */

import { useCallback, useRef } from 'react';
import type { VoiceEffectId } from '@/constants/voice-effects.constants';

interface AudioGraph {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  destination: MediaStreamAudioDestinationNode;
  /** All nodes that must be disconnected on teardown (including echo feedback loop nodes) */
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
 * Connect mic → effect → destination. Returns nodes + optional oscillators for cleanup.
 */
function connectEffectGraph(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  destination: MediaStreamAudioDestinationNode,
  effectId: VoiceEffectId,
): { nodes: AudioNode[]; oscillators?: OscillatorNode[] } {
  if (effectId === 'none') {
    source.connect(destination);
    return { nodes: [] };
  }

  switch (effectId) {
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
      lp2.connect(destination);
      return { nodes: [lp, lp2] };
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
      hp2.connect(destination);
      return { nodes: [hp, hp2] };
    }

    case 'robot': {
      // Metallic / robotic: band-limit + heavy waveshaping (no broken ring-mod on gain param)
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 180;
      const shaper = ctx.createWaveShaper();
      shaper.curve = createDistortionCurve(38) as Float32Array;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      source.connect(hp);
      hp.connect(shaper);
      shaper.connect(lp);
      lp.connect(destination);
      return { nodes: [hp, shaper, lp] };
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

      // Dry path
      source.connect(dry);
      dry.connect(destination);

      // Wet + feedback loop (must list feedback for disconnect)
      source.connect(delay);
      delay.connect(wet);
      wet.connect(destination);
      delay.connect(feedback);
      feedback.connect(delay);

      return { nodes: [delay, feedback, wet, dry] };
    }

    case 'radio': {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2000;
      bp.Q.value = 5;
      const ws = ctx.createWaveShaper();
      ws.curve = createDistortionCurve(8) as Float32Array;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 500;
      source.connect(bp);
      bp.connect(ws);
      ws.connect(hp);
      hp.connect(destination);
      return { nodes: [bp, ws, hp] };
    }

    default:
      source.connect(destination);
      return { nodes: [] };
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

    const { nodes, oscillators } = connectEffectGraph(ctx, source, destination, effectId);

    graphRef.current = { ctx, source, destination, nodes, oscillators };
    return destination.stream.getAudioTracks()[0];
  }, []);

  const switchEffect = useCallback((effectId: VoiceEffectId): MediaStreamTrack | null => {
    const graph = graphRef.current;
    const rawStream = rawStreamRef.current;
    if (!graph || !rawStream) return null;

    disconnectEntireGraph(graph);
    void graph.ctx.resume();

    const { nodes, oscillators } = connectEffectGraph(graph.ctx, graph.source, graph.destination, effectId);

    graph.nodes = nodes;
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

  return {
    processStream,
    switchEffect,
    rebuildEffect,
    cleanup,
  };
}

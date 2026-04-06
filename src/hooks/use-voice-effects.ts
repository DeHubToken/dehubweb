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
  nodes: AudioNode[];
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

function buildEffectNodes(ctx: AudioContext, effectId: VoiceEffectId): AudioNode[] {
  switch (effectId) {
    case 'deep': {
      // Simulate pitch-down with a low-pass filter + bass boost
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowshelf';
      lp.frequency.value = 400;
      lp.gain.value = 12;

      const lp2 = ctx.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = 2500;

      return [lp, lp2];
    }

    case 'chipmunk': {
      // High-pass boost to simulate pitch-up
      const hp = ctx.createBiquadFilter();
      hp.type = 'highshelf';
      hp.frequency.value = 3000;
      hp.gain.value = 15;

      const hp2 = ctx.createBiquadFilter();
      hp2.type = 'highpass';
      hp2.frequency.value = 300;

      return [hp, hp2];
    }

    case 'robot': {
      // Ring modulator: oscillator * input via gain node
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 50;
      osc.start();

      const ringGain = ctx.createGain();
      ringGain.gain.value = 0;
      osc.connect(ringGain.gain); // modulates the gain param

      const ws = ctx.createWaveShaper();
      ws.curve = createDistortionCurve(20) as any;

      return [ringGain, ws];
    }

    case 'echo': {
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.25;

      const feedback = ctx.createGain();
      feedback.gain.value = 0.4;

      const dry = ctx.createGain();
      dry.gain.value = 1.0;

      // Connect delay → feedback → delay (loop)
      delay.connect(feedback);
      feedback.connect(delay);

      return [delay, dry];
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

      return [bp, ws, hp];
    }

    default:
      return [];
  }
}

export function useVoiceEffects() {
  const graphRef = useRef<AudioGraph | null>(null);
  const currentEffectRef = useRef<VoiceEffectId>('none');
  const rawStreamRef = useRef<MediaStream | null>(null);

  /**
   * Process a raw mic MediaStream and return a processed track.
   * Call once when creating the audio track.
   */
  const processStream = useCallback((stream: MediaStream, effectId: VoiceEffectId = 'none'): MediaStreamTrack => {
    rawStreamRef.current = stream;
    currentEffectRef.current = effectId;

    // Create audio context and source
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const destination = ctx.createMediaStreamDestination();

    if (effectId === 'none') {
      source.connect(destination);
      graphRef.current = { ctx, source, destination, nodes: [] };
      return destination.stream.getAudioTracks()[0];
    }

    const nodes = buildEffectNodes(ctx, effectId);
    // Chain: source → node[0] → node[1] → ... → destination
    let prev: AudioNode = source;
    for (const node of nodes) {
      prev.connect(node);
      prev = node;
    }
    prev.connect(destination);

    graphRef.current = { ctx, source, destination, nodes };
    return destination.stream.getAudioTracks()[0];
  }, []);

  /**
   * Switch effect mid-session. Returns the new processed track.
   * The caller should replace the Agora track with this new one.
   */
  const switchEffect = useCallback((effectId: VoiceEffectId): MediaStreamTrack | null => {
    const graph = graphRef.current;
    const rawStream = rawStreamRef.current;
    if (!graph || !rawStream) return null;

    currentEffectRef.current = effectId;

    // Disconnect all existing nodes
    graph.source.disconnect();
    for (const node of graph.nodes) {
      try { node.disconnect(); } catch {}
    }

    if (effectId === 'none') {
      graph.source.connect(graph.destination);
      graph.nodes = [];
      return graph.destination.stream.getAudioTracks()[0];
    }

    const nodes = buildEffectNodes(graph.ctx, effectId);
    let prev: AudioNode = graph.source;
    for (const node of nodes) {
      prev.connect(node);
      prev = node;
    }
    prev.connect(graph.destination);
    graph.nodes = nodes;

    return graph.destination.stream.getAudioTracks()[0];
  }, []);

  /**
   * Clean up the audio graph
   */
  const cleanup = useCallback(() => {
    const graph = graphRef.current;
    if (graph) {
      try {
        graph.source.disconnect();
        for (const node of graph.nodes) {
          try { node.disconnect(); } catch {}
        }
        graph.ctx.close();
      } catch {}
      graphRef.current = null;
    }
    rawStreamRef.current = null;
    currentEffectRef.current = 'none';
  }, []);

  return {
    processStream,
    switchEffect,
    cleanup,
    currentEffect: currentEffectRef,
  };
}

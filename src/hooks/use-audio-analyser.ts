import { useRef, useEffect, useCallback, useState } from 'react';

interface AudioAnalyserData {
  frequencyData: Uint8Array;
  timeData: Uint8Array;
  isActive: boolean;
}

export function useAudioAnalyser(audioElement: HTMLAudioElement | null) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (!audioElement || isConnected) return;

    try {
      // Create audio context if it doesn't exist
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;

      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Create analyser
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;

      // Connect audio element to analyser
      sourceRef.current = ctx.createMediaElementSource(audioElement);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);

      setIsConnected(true);
    } catch (err) {
      console.error('Failed to connect audio analyser:', err);
    }
  }, [audioElement, isConnected]);

  const getData = useCallback((): AudioAnalyserData => {
    if (!analyserRef.current) {
      return {
        frequencyData: new Uint8Array(128),
        timeData: new Uint8Array(128),
        isActive: false,
      };
    }

    const frequencyData = new Uint8Array(analyserRef.current.frequencyBinCount);
    const timeData = new Uint8Array(analyserRef.current.frequencyBinCount);

    analyserRef.current.getByteFrequencyData(frequencyData);
    analyserRef.current.getByteTimeDomainData(timeData);

    return {
      frequencyData,
      timeData,
      isActive: true,
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  return { connect, getData, isConnected };
}

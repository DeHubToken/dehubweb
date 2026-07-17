import { useRef, useEffect, useCallback } from 'react';

interface LiveWaveformProps {
  className?: string;
  barCount?: number;
  active?: boolean;
  /** Audio volume level 0-1, drives waveform intensity */
  volumeLevel?: number;
  /**
   * Bar color as an "R, G, B" triple (opacity is applied per-bar). Defaults to
   * white for the always-dark modal/cards; pass "0, 0, 0" on paper themes
   * (light/minimal) so the bars stay visible on a light surface.
   */
  barColor?: string;
}

/**
 * Animated synth-style waveform visualizer for live stages.
 * Reacts to real audio volume when provided, otherwise shows idle animation.
 */
export function LiveWaveform({ className = '', barCount = 60, active = true, volumeLevel = 0, barColor = '255, 255, 255' }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const barsRef = useRef<number[]>([]);
  const targetsRef = useRef<number[]>([]);
  const lastTargetTime = useRef(0);
  const volumeRef = useRef(0);

  // Keep volume in a ref so the draw loop always has the latest
  useEffect(() => {
    volumeRef.current = volumeLevel;
  }, [volumeLevel]);

  // Initialize bar values
  useEffect(() => {
    barsRef.current = Array.from({ length: barCount }, () => 0.05);
    targetsRef.current = Array.from({ length: barCount }, () => 0.05);
  }, [barCount]);

  const draw = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      frameRef.current = requestAnimationFrame(draw);
      return;
    }

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const vol = volumeRef.current;
    // Intensity: when there's audio, bars are tall; when silent, bars are tiny
    const intensity = Math.max(0.05, vol);

    // Update targets every ~120ms for snappy response
    if (time - lastTargetTime.current > 120) {
      lastTargetTime.current = time;
      for (let i = 0; i < barCount; i++) {
        const t = i / (barCount - 1);
        // Smooth envelope peaks in center
        const envelope = 0.3 + 0.7 * Math.sin(t * Math.PI);
        // When volume is high, bars are tall with variation; when low, bars shrink
        const noise = 0.3 + Math.random() * 0.7;
        targetsRef.current[i] = envelope * noise * intensity;
      }
    }

    // Lerp bars toward targets — faster when volume is active
    const lerpSpeed = vol > 0.05 ? 0.18 : 0.06;
    const bars = barsRef.current;
    const targets = targetsRef.current;
    for (let i = 0; i < barCount; i++) {
      bars[i] += (targets[i] - bars[i]) * lerpSpeed;
    }

    const gap = 2;
    const barWidth = (w - gap * (barCount - 1)) / barCount;
    const maxBarHeight = h * 0.85;

    for (let i = 0; i < barCount; i++) {
      const barH = Math.max(2, bars[i] * maxBarHeight);
      const x = i * (barWidth + gap);
      const y = (h - barH) / 2;
      const opacity = 0.1 + bars[i] * 0.35;

      ctx.fillStyle = `rgba(${barColor}, ${opacity})`;
      ctx.beginPath();
      const r = Math.min(1, barWidth / 2);
      ctx.roundRect(x, y, barWidth, barH, r);
      ctx.fill();
    }

    if (active) {
      frameRef.current = requestAnimationFrame(draw);
    }
  }, [barCount, active, barColor]);

  useEffect(() => {
    if (active) {
      frameRef.current = requestAnimationFrame(draw);
    }
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [draw, active]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  );
}

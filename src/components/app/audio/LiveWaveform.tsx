import { useRef, useEffect, useCallback } from 'react';

interface LiveWaveformProps {
  className?: string;
  /** Number of bars */
  barCount?: number;
  /** Whether animation is active */
  active?: boolean;
}

/**
 * Animated synth-style waveform visualizer for live stages.
 * Renders smooth, continuously-animating bars similar to the static waveform
 * but with organic motion.
 */
export function LiveWaveform({ className = '', barCount = 60, active = true }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const barsRef = useRef<number[]>([]);
  const targetsRef = useRef<number[]>([]);
  const lastTargetTime = useRef(0);

  // Initialize bar values
  useEffect(() => {
    barsRef.current = Array.from({ length: barCount }, () => 0.2 + Math.random() * 0.3);
    targetsRef.current = Array.from({ length: barCount }, () => 0.2 + Math.random() * 0.8);
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

    // Update targets every ~400ms
    if (time - lastTargetTime.current > 400) {
      lastTargetTime.current = time;
      for (let i = 0; i < barCount; i++) {
        const t = i / (barCount - 1);
        const envelope = 0.3 + 0.7 * Math.sin(t * Math.PI);
        targetsRef.current[i] = envelope * (0.3 + Math.random() * 0.7);
      }
    }

    // Lerp bars toward targets
    const bars = barsRef.current;
    const targets = targetsRef.current;
    for (let i = 0; i < barCount; i++) {
      bars[i] += (targets[i] - bars[i]) * 0.08;
    }

    const gap = 2;
    const barWidth = (w - gap * (barCount - 1)) / barCount;
    const maxBarHeight = h * 0.85;

    for (let i = 0; i < barCount; i++) {
      const barH = Math.max(2, bars[i] * maxBarHeight);
      const x = i * (barWidth + gap);
      const y = (h - barH) / 2;
      const opacity = 0.12 + bars[i] * 0.25;

      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.beginPath();
      // Rounded rect
      const r = Math.min(1, barWidth / 2);
      ctx.roundRect(x, y, barWidth, barH, r);
      ctx.fill();
    }

    if (active) {
      frameRef.current = requestAnimationFrame(draw);
    }
  }, [barCount, active]);

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

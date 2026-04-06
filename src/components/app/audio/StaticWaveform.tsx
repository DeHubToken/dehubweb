import { useMemo, useRef, useEffect, useState, useCallback } from 'react';

interface StaticWaveformProps {
  /** Seed string to generate a unique-but-deterministic pattern per post */
  seed?: string;
  className?: string;
  /** Base color as HSL values, defaults to white */
  color?: string;
  /** Whether to animate bars in response to audio */
  animated?: boolean;
  /** Audio volume level 0-1 when animated */
  volumeLevel?: number;
  /** Playback progress 0-1 for seekable waveform */
  progress?: number;
  /** Called when user clicks/drags to seek, receives 0-1 position */
  onSeek?: (position: number) => void;
}

/** Simple seeded PRNG (mulberry32) */
function seedRandom(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return () => {
    h |= 0;
    h = h + 0x6d2b79f5 | 0;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Generate a smooth envelope for bar heights */
function generateBars(seed: string, count: number): number[] {
  const rand = seedRandom(seed);
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const envelope = 0.3 + 0.7 * Math.sin(t * Math.PI);
    const noise = 0.4 + 0.6 * rand();
    bars.push(envelope * noise);
  }
  return bars;
}

export function StaticWaveform({
  seed = 'default',
  className = '',
  color,
  animated = false,
  volumeLevel = 0,
  progress,
  onSeek,
}: StaticWaveformProps) {
  const barCount = 90;
  const baseBars = useMemo(() => generateBars(seed, barCount), [seed]);
  const [animatedBars, setAnimatedBars] = useState<number[] | null>(null);
  const frameRef = useRef(0);
  const volumeRef = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    volumeRef.current = volumeLevel;
  }, [volumeLevel]);

  // Volume-driven bar motion conflicts with playback progress fill — disable when progress is shown
  const showVolumeAnimation =
    animated && (progress === undefined || !Number.isFinite(progress));

  useEffect(() => {
    if (!showVolumeAnimation) {
      setAnimatedBars(null);
      cancelAnimationFrame(frameRef.current);
      return;
    }

    const currentBars = [...baseBars];
    const targets = [...baseBars];
    let lastTargetTime = 0;

    const tick = (time: number) => {
      const vol = volumeRef.current;
      if (time - lastTargetTime > 100) {
        lastTargetTime = time;
        for (let i = 0; i < barCount; i++) {
          const scale = 0.3 + vol * 1.4;
          const jitter = 0.85 + Math.random() * 0.3;
          targets[i] = Math.min(1, baseBars[i] * scale * jitter);
        }
      }
      for (let i = 0; i < barCount; i++) {
        currentBars[i] += (targets[i] - currentBars[i]) * 0.15;
      }
      setAnimatedBars([...currentBars]);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [showVolumeAnimation, baseBars]);

  const handleSeek = useCallback((e: React.MouseEvent<SVGSVGElement> | React.PointerEvent<SVGSVGElement>) => {
    if (!onSeek || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pos);
  }, [onSeek]);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!onSeek) return;
    isDragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    handleSeek(e);
  }, [onSeek, handleSeek]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging.current) return;
    handleSeek(e);
  }, [handleSeek]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // When showing playback progress, keep bar heights stable (base pattern only).
  // Volume animation on top of progress made the "fill" look jumpy / wrong.
  const hasProgress =
    progress !== undefined && Number.isFinite(progress) && progress >= 0;
  const p = hasProgress ? Math.min(1, Math.max(0, progress!)) : 0;
  const bars = hasProgress ? baseBars : (animatedBars || baseBars);

  const barWidth = 2;
  const gap = 1.5;
  const svgWidth = barCount * (barWidth + gap);
  const svgHeight = 60;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      preserveAspectRatio="none"
      className={`${className} ${onSeek ? 'cursor-pointer' : ''} w-full min-w-0 block`}
      aria-hidden="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={onSeek ? { touchAction: 'none' } : undefined}
    >
      {bars.map((h, i) => {
        const barHeight = h * svgHeight * 0.85;
        const x = i * (barWidth + gap);
        const y = (svgHeight - barHeight) / 2;

        // Smooth left → right: playhead as float bar index (not discrete i <= p)
        let lit = 0;
        if (hasProgress) {
          const filled = p * barCount;
          lit = Math.min(1, Math.max(0, filled - i));
        }

        const dimOpacity = 0.08 + h * 0.12;
        const brightOpacity = 0.82 + h * 0.18;
        const opacity = dimOpacity + (brightOpacity - dimOpacity) * lit;
        const fillColor = color || 'white';

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={1}
            fill={fillColor}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

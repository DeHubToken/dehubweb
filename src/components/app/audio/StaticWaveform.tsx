import { useMemo } from 'react';

interface StaticWaveformProps {
  /** Seed string to generate a unique-but-deterministic pattern per post */
  seed?: string;
  className?: string;
  /** Base color as HSL values, defaults to white */
  color?: string;
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

/** Attempt to generate a smooth envelope for bar heights */
function generateBars(seed: string, count: number): number[] {
  const rand = seedRandom(seed);
  const bars: number[] = [];

  for (let i = 0; i < count; i++) {
    // Normalized position 0..1
    const t = i / (count - 1);
    // Smooth envelope: raised cosine, peaks in center
    const envelope = 0.3 + 0.7 * Math.sin(t * Math.PI);
    // Random variation
    const noise = 0.4 + 0.6 * rand();
    bars.push(envelope * noise);
  }
  return bars;
}

export function StaticWaveform({
  seed = 'default',
  className = '',
  color,
}: StaticWaveformProps) {
  const barCount = 90;
  const bars = useMemo(() => generateBars(seed, barCount), [seed]);

  const barWidth = 2;
  const gap = 1.5;
  const svgWidth = barCount * (barWidth + gap);
  const svgHeight = 60;

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
    >
      {bars.map((h, i) => {
        const barHeight = h * svgHeight * 0.85;
        const x = i * (barWidth + gap);
        const y = (svgHeight - barHeight) / 2;
        // Subtle opacity variation per bar
        const opacity = 0.12 + h * 0.22;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={1}
            fill={color || 'white'}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

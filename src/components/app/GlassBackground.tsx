import { useEffect, useRef } from 'react';
import { isBackgroundPaused, subscribeBackgroundPaused } from '@/lib/background-gate';

// Curved light ribbons are vector geometry, composited without per-frame React work.
const ribbons = Array.from({ length: 14 }, (_, index) => {
  const vertical = index >= 7;
  const lane = index % 7;
  const points = Array.from({ length: 10 }, (_, step) => {
    const along = step * 200 - 300;
    const across = lane * 240 - 120 + Math.sin(step * 1.37 + lane * 1.8) * 115 + Math.cos(step * .71 - lane) * 65;
    return vertical ? [across, along] : [along, across];
  });
  let d = `M${points[0].join(' ')}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)], b = points[i], c = points[i + 1], e = points[Math.min(points.length - 1, i + 2)];
    d += ` C${b[0] + (c[0] - a[0]) / 6} ${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6} ${c[1] - (e[1] - b[1]) / 6} ${c.join(' ')}`;
  }
  return d;
});

function LightRibbons({ layer }: { layer: string }) {
  return <svg data-glass-light={layer} viewBox="0 0 1200 1200" preserveAspectRatio="xMidYMid slice" fill="none">
    {ribbons.map((d, i) => <g key={i}>
      <path d={d} stroke="currentColor" strokeWidth="52" opacity=".035" />
      <path d={d} stroke="currentColor" strokeWidth="24" opacity=".065" />
      <path d={d} stroke="currentColor" strokeWidth="9" opacity=".14" />
      <path d={d} stroke="currentColor" strokeWidth="3" opacity=".36" />
    </g>)}
  </svg>;
}

export function GlassBackground() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sync = () => {
      if (ref.current) ref.current.dataset.paused = String(document.hidden || isBackgroundPaused());
    };
    sync();
    const unsubscribe = subscribeBackgroundPaused(sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return <div ref={ref} data-glass-background aria-hidden="true">
    <LightRibbons layer="one" />
    <LightRibbons layer="two" />
  </div>;
}

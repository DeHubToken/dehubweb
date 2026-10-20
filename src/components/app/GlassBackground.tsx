import { useEffect, useRef } from 'react';
import { isBackgroundPaused, subscribeBackgroundPaused } from '@/lib/background-gate';

// Curved light ribbons are vector geometry, composited without per-frame React work.
const ribbons = [
  'M-240 150 C120 -180 250 460 630 190 S1030 -140 1450 210',
  'M-180 650 C120 270 410 990 740 570 S1060 310 1480 620',
  'M-140 1080 C200 720 350 1300 760 990 S1180 740 1480 1120',
  'M100 -240 C480 100 -100 420 300 780 S580 1060 360 1480',
  'M970 -220 C640 130 1270 450 950 790 S620 1180 1090 1490',
];

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

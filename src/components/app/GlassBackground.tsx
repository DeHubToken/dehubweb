import { useEffect, useId, useRef } from 'react';
import { isBackgroundPaused, subscribeBackgroundPaused } from '@/lib/background-gate';

const crystalRibbons = [
  'M-220 1220C160 520 550 1050 940 460S1420-160 1850-80',
  'M-220 520C300 1100 690 570 1010 240S1480-100 1840 110',
  'M260-180C660 200 560 360 1020 350S1360 650 1770 620',
];

export function GlassBackground() {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, '');
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let x = 0, y = 0;
    const sync = () => { root.dataset.paused = String(document.hidden || isBackgroundPaused() || reduced.matches); };
    const move = (event: PointerEvent) => {
      if (document.hidden || isBackgroundPaused() || reduced.matches) return;
      x = (event.clientX / window.innerWidth - .5) * 2;
      y = (event.clientY / window.innerHeight - .5) * 2;
      if (!frame) frame = requestAnimationFrame(() => {
        root.style.setProperty('--glass-pointer-x', `${x * 28}px`);
        root.style.setProperty('--glass-pointer-y', `${y * 22}px`);
        root.style.setProperty('--glass-pointer-r', `${x * 1.5}deg`);
        frame = 0;
      });
    };
    const reset = () => {
      root.style.setProperty('--glass-pointer-x', '0px'); root.style.setProperty('--glass-pointer-y', '0px'); root.style.setProperty('--glass-pointer-r', '0deg');
    };
    sync();
    const unsubscribe = subscribeBackgroundPaused(sync);
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', reset);
    reduced.addEventListener('change', sync);
    return () => {
      unsubscribe(); cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', sync); document.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', reset); reduced.removeEventListener('change', sync);
    };
  }, []);
  return <div ref={ref} data-glass-background data-glass-crystal aria-hidden="true"><div data-glass-parallax>
    <svg data-glass-crystal-sculpture viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" fill="none">
      <defs>
        <linearGradient id={`${id}face`} x1="0" y1="0" x2=".75" y2="1">
          <stop stopColor="currentColor" stopOpacity="0"/><stop offset=".18" stopColor="currentColor" stopOpacity=".03"/><stop offset=".37" stopColor="currentColor" stopOpacity=".14"/><stop offset=".48" stopColor="#b8f5ff" stopOpacity=".27"/><stop offset=".53" stopColor="#e2fbff" stopOpacity=".36"/><stop offset=".57" stopColor="currentColor" stopOpacity=".18"/><stop offset=".72" stopColor="currentColor" stopOpacity=".05"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id={`${id}edge`} x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".7"/><stop offset=".3" stopColor="#fff" stopOpacity=".08"/><stop offset=".65" stopColor="#eaffff" stopOpacity=".5"/><stop offset="1" stopColor="#fff" stopOpacity=".08"/></linearGradient>
      </defs>
      {crystalRibbons.map((d, i) => <g key={i} opacity={i === 2 ? .3 : 1}>
        {Array.from({ length: 32 }, (_, layer) => <path key={layer} d={d} stroke={`url(#${id}edge)`} strokeWidth={300 * (1 - layer / 32)} strokeOpacity={.006 + layer * .0005} strokeLinecap="round" />)}
      </g>)}
    </svg>
  </div></div>;
}

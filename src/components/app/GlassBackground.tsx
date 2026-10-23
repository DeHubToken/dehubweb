import { useEffect, useId, useRef } from 'react';
import { isBackgroundPaused, subscribeBackgroundPaused } from '@/lib/background-gate';

const crystalRibbons = [
  'M-240 910C160 160 500 1240 920 520S1420-80 1850 180L1810 225C1430-15 1290 920 890 600S210 300-200 960Z',
  'M-150 110C390 750 540-160 1060 240S1490 1080 1810 680L1840 730C1440 1210 1370 630 1010 330S340 860-190 145Z',
  'M160-230C950 120 80 690 760 1000L710 1080C-70 790 820 130 120-170Z',
  'M1130-200C500 240 1710 470 1120 1120L1190 1170C1810 510 680 220 1200-170Z',
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
        <linearGradient id={`${id}face`} x1=".1" y1="0" x2=".9" y2="1">
          <stop stopColor="#edffff" stopOpacity=".02"/><stop offset=".24" stopColor="#eaffff" stopOpacity=".2"/><stop offset=".28" stopColor="#fff" stopOpacity=".55"/><stop offset=".31" stopColor="currentColor" stopOpacity=".04"/><stop offset=".65" stopColor="currentColor" stopOpacity=".16"/><stop offset=".92" stopColor="#fff" stopOpacity=".3"/><stop offset="1" stopColor="#fff" stopOpacity=".04"/>
        </linearGradient>
        <linearGradient id={`${id}edge`} x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".7"/><stop offset=".3" stopColor="#fff" stopOpacity=".08"/><stop offset=".65" stopColor="#eaffff" stopOpacity=".5"/><stop offset="1" stopColor="#fff" stopOpacity=".08"/></linearGradient>
      </defs>
      {crystalRibbons.map((d, i) => <path key={i} d={d} fill={`url(#${id}face)`} stroke={`url(#${id}edge)`} strokeWidth="1.2" />)}
    </svg>
  </div></div>;
}

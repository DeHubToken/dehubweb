import { useEffect, useMemo, useState, type ReactNode } from 'react';

const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
const START_KEY = 'dehub:logo-crumble-start:v1';
const shards = [
  ['polygon(0 0,30% 0,24% 36%,0 42%)', -1.2, -.3, -1, -8],
  ['polygon(30% 0,58% 0,54% 31%,24% 36%)', .3, -1.1, 1, 4],
  ['polygon(58% 0,100% 0,100% 35%,54% 31%)', 1.4, -.5, 2, 9],
  ['polygon(0 42%,24% 36%,21% 70%,0 76%)', -1.5, .7, -2, -7],
  ['polygon(24% 36%,54% 31%,51% 68%,21% 70%)', 0, .2, 0, 2],
  ['polygon(54% 31%,100% 35%,100% 71%,51% 68%)', 1.7, .6, 3, 8],
  ['polygon(0 76%,21% 70%,25% 100%,0 100%)', -1.8, 1.4, -3, -10],
  ['polygon(21% 70%,51% 68%,56% 100%,25% 100%)', .2, 1.7, 1, 5],
  ['polygon(51% 68%,100% 71%,100% 100%,56% 100%)', 1.8, 1.1, 4, 11],
] as const;

function readStart() {
  try {
    const stored = window.localStorage.getItem(START_KEY);
    if (stored) return Number(stored);
    const now = Date.now();
    window.localStorage.setItem(START_KEY, String(now));
    return now;
  } catch { return Date.now(); }
}

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/**
 * `still` is what the shards draw. Each shard is a full copy of the mark, so a
 * live child (War's WarLogo is a WebGL canvas) would run nine more of it: on
 * phones that used up the WebGL contexts and blanked the theme background.
 * Callers with a live mark pass a plain <img> of it here.
 */
export function CrumblingLogo({ children, still }: { children: ReactNode; still?: ReactNode }) {
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const update = () => setProgress(Math.min(1, Math.max(0, (Date.now() - readStart()) / FIVE_DAYS)));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  // A shard with nothing to show yet is not drawn at all.
  const visibleShards = useMemo(() => shards.map((shard, index) => ({ shard, index, amount: Math.max(0, progress - index * .018) })).filter(({ amount }) => amount > 0), [progress]);
  if (reduced) return <span data-logo-crumble style={{ display: 'inline-flex', position: 'relative' }}>{children}</span>;
  return <span data-logo-crumble style={{ display: 'inline-flex', position: 'relative', perspective: '260px', transformStyle: 'preserve-3d' }}>
    <span style={{ display: 'inline-flex', opacity: 1 - progress * .72, transition: 'opacity 900ms ease' }}>{children}</span>
    {visibleShards.map(({ shard, index, amount }) => <span key={index} aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'inline-flex', overflow: 'hidden', clipPath: shard[0], opacity: amount * .96, pointerEvents: 'none', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.28))', transform: `translate3d(${shard[1] * amount * 7}px,${shard[2] * amount * 7}px,${shard[3] * amount * 8}px) rotateX(${shard[4] * amount}deg) rotateY(${shard[4] * amount * .7}deg) rotateZ(${shard[4] * amount * .35}deg)`, transformOrigin: 'center', transition: 'opacity 900ms ease, transform 1200ms cubic-bezier(.2,.8,.2,1)' }}>{still ?? children}</span>)}
    {[0, 1, 2, 3].map(index => <i key={index} aria-hidden="true" style={{ position: 'absolute', left: `${24 + index * 19}%`, top: `${18 + (index % 2) * 39}%`, width: 2 + index % 2, height: 2 + index % 2, borderRadius: '50%', background: index % 2 ? '#9cecff' : '#ffe28a', opacity: progress > .12 ? Math.min(.8, progress * 1.3) : 0, transform: `translate3d(${(index - 1.5) * progress * 13}px,${progress * (8 + index * 3)}px,20px)`, transition: 'opacity 1s ease, transform 1.2s ease', pointerEvents: 'none' }} />)}
  </span>;
}

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { pillPullVisual } from '@/lib/pill-pull-motion';

/** Rasterize the rim once; only its opacity and the echo's transform move. */
export function FeedPillPullEffect({ distance, pulling, refreshing }: { distance: number; pulling: boolean; refreshing: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(149.1);
  const id = useId();
  useEffect(() => {
    const parent = root.current?.parentElement;
    if (!parent) return;
    setWidth(parent.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  const visual = pillPullVisual(distance, pulling, refreshing, 0);
  const lower = `M 0 28 C 0 36.84 7.16 44 16 44 H ${width - 16} C ${width - 7.16} 44 ${width} 36.84 ${width} 28`;
  return (
    <div ref={root} data-feed-pull-effect aria-hidden="true" className="pointer-events-none absolute top-0 -left-6 z-20 h-[224px]" style={{ width: 'calc(100% + 48px)' }}>
      <div className="absolute inset-0" style={{ clipPath: `inset(44px 0 ${Math.max(0, 180 - visual.gapHeight)}px 0)`, opacity: visual.echoOpacity }}>
        <svg data-feed-pull-echo data-active={distance > 0 ? '' : undefined} width={width} height="44" className="absolute left-6 top-0" style={{ '--pull-echo-offset': `${Math.min(108, distance * .72 + 4) * .62}px` } as CSSProperties}>
          <rect x=".4" y=".4" width={width - .8} height="43.2" rx="16" fill="#DEE8F6" fillOpacity=".045" stroke="#E7EFFA" strokeWidth=".7" />
        </svg>
      </div>
      <svg data-feed-pull-rim data-pulling={pulling ? '' : undefined} width={width + 48} height="92" viewBox={`-24 -12 ${width + 48} 92`} className="absolute left-0 -top-3" style={{ opacity: visual.rimOpacity }}>
        <defs>
          <linearGradient id={`${id}-rim`} x1="0" y1="28" x2="0" y2="45" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#EDF5FF" stopOpacity="0" />
            <stop offset=".28" stopColor="#EDF5FF" stopOpacity=".22" />
            <stop offset=".62" stopColor="#EDF5FF" stopOpacity=".7" />
            <stop offset="1" stopColor="#F8FBFF" />
          </linearGradient>
          <radialGradient id={`${id}-halo`}>
            <stop offset="0" stopColor="#E4F0FF" stopOpacity=".065" />
            <stop offset=".4" stopColor="#E4F0FF" stopOpacity=".03" />
            <stop offset=".75" stopColor="#E4F0FF" stopOpacity=".008" />
            <stop offset="1" stopColor="#E4F0FF" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx={width / 2} cy="44" rx={width / 2 + 12} ry="24" fill={`url(#${id}-halo)`} />
        {[{ width: 24, opacity: .006 }, { width: 16, opacity: .014 }, { width: 10, opacity: .035 }, { width: 6, opacity: .075 }, { width: 2.3, opacity: .22 }, { width: .8, opacity: .62 }].map(layer => (
          <path key={layer.width} d={lower} fill="none" stroke={`url(#${id}-rim)`} strokeWidth={layer.width} strokeOpacity={layer.opacity} strokeLinecap="round" />
        ))}
      </svg>
    </div>
  );
}

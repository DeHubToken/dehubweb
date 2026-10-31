import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useAppTheme } from '@/contexts/ThemeContext';
import { ThemePreviewCard } from '@/components/app/settings/ThemePreviewCard';
import { DEHUB_MARK_PATH, DEHUB_MARK_VIEWBOX } from './dehub-mark-path';

const THEMES: Array<[string, string]> = [
  ['system', 'settings.system'],
  ['system-light', 'settings.systemLight'],
  ['immersive', 'settings.immersive'],
  ['minimal', 'settings.minimal'],
  ['light', 'settings.minimalLight'],
  ['glass', 'settings.glass'],
  ['cosmic', 'settings.cosmic'],
  ['hazy', 'settings.hazy'],
  ['swarms', 'settings.swarms'],
  ['lavalamp', 'settings.lavalamp'],
  ['winter', 'settings.winter'],
  ['war', 'settings.war'],
  ['osaka', 'settings.osaka'],
  ['jungle', 'settings.jungle'],
  ['island', 'settings.island'],
  ['hacker', 'settings.hacker'],
];

const GHOST = 'M100 14C46 14 22 58 22 110L22 226Q34 212 48 226Q62 240 76 226Q88 212 100 226Q112 240 124 226Q138 212 152 226Q166 240 178 226L178 110C178 58 154 14 100 14Z';

const CSS = `
.hg-root{position:fixed;inset:0;z-index:220;display:flex;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top,0px) + 16px) 16px calc(env(safe-area-inset-bottom,0px) + 16px)}
.hg-scrim{position:absolute;inset:0;background:rgba(4,2,3,.84);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);animation:hg-fade .5s ease-out both}
.hg-root[data-leaving] .hg-scrim{animation:hg-fade-out .45s ease-in both}
.hg-mist{position:absolute;left:-10%;right:-10%;bottom:0;height:45%;pointer-events:none;background:radial-gradient(50% 60% at 50% 100%,rgba(230,215,220,.16),transparent 70%);filter:blur(10px);animation:hg-fade 1.2s ease-out both}
.hg-card{position:relative;width:min(420px,100%);display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.hg-ghost{width:min(190px,48vw);animation:hg-rise 1.2s cubic-bezier(.2,.8,.2,1) both}
.hg-root[data-leaving] .hg-ghost{animation:hg-vanish .45s ease-in both}
.hg-ghost svg{display:block;width:100%;height:auto;overflow:visible;filter:drop-shadow(0 0 22px rgba(206,32,48,.55)) drop-shadow(0 0 60px rgba(255,122,60,.18))}
.hg-float{animation:hg-bob 2.8s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 30%}
.hg-sway{animation:hg-sway 2.8s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 0}
.hg-face{animation:hg-flicker 2.2s steps(1) infinite, hg-follow 2.8s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.hg-title{margin:4px 0 0;font-size:30px;line-height:1.05;font-weight:800;color:#f4ece8;letter-spacing:.01em;text-shadow:0 2px 0 #000,0 0 18px rgba(206,32,48,.6);animation:hg-up .6s .5s ease-out both}
.hg-sub{margin:0;font-size:14px;color:rgba(244,236,232,.72);animation:hg-up .6s .62s ease-out both}
.hg-rail{width:100vw;max-width:560px;display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:6px 16px 10px;scrollbar-width:none;animation:hg-up .6s .74s ease-out both;mask-image:linear-gradient(90deg,transparent,#000 16px,#000 calc(100% - 16px),transparent)}
.hg-rail::-webkit-scrollbar{display:none}
.hg-rail>*{scroll-snap-align:center}
.hg-rail span{color:rgba(244,236,232,.85)}
.hg-close{position:absolute;top:calc(env(safe-area-inset-top,0px) + 12px);right:calc(env(safe-area-inset-right,0px) + 12px);width:40px;height:40px;border-radius:999px;display:grid;place-items:center;color:#f4ece8;background:rgba(12,9,10,.7);border:1px solid rgba(206,32,48,.45)}
.hg-close:focus-visible{outline:2px solid #ce2030;outline-offset:2px}
@keyframes hg-fade{from{opacity:0}to{opacity:1}}
@keyframes hg-fade-out{from{opacity:1}to{opacity:0}}
@keyframes hg-rise{0%{opacity:0;transform:translateY(60px) scale(.85);filter:blur(8px)}100%{opacity:1;transform:none;filter:blur(0)}}
@keyframes hg-vanish{to{opacity:0;transform:translateY(-30px) scale(1.12);filter:blur(10px)}}
@keyframes hg-bob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-9px) rotate(3deg)}}
@keyframes hg-sway{0%,100%{transform:skewX(4deg)}50%{transform:skewX(-6deg)}}
@keyframes hg-follow{0%,100%{transform:translate(-2px,1px) rotate(-2deg) scale(1,1.02)}50%{transform:translate(3px,-2px) rotate(3deg) scale(1.03,.97)}}
@keyframes hg-flicker{0%{opacity:1}12%{opacity:.78}16%{opacity:1}55%{opacity:.9}58%{opacity:1}}
@keyframes hg-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.hg-root *{animation-duration:.01s!important;animation-iteration-count:1!important}}
`;

/** The ghost: body and DeHub-mark face share one wobble filter and one float, so they move as one. */
function Ghost() {
  return (
    <svg viewBox="0 0 200 250" aria-hidden="true">
      <defs>
        <radialGradient id="hg-body" cx=".5" cy=".35" r=".7">
          <stop offset="0" stopColor="#fff4ee" stopOpacity=".95" />
          <stop offset=".6" stopColor="#f2d9d6" stopOpacity=".72" />
          <stop offset="1" stopColor="#ce2030" stopOpacity=".16" />
        </radialGradient>
        <radialGradient id="hg-ember" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#ffd2a8" />
          <stop offset=".45" stopColor="#ff7a3c" />
          <stop offset="1" stopColor="#ce2030" />
        </radialGradient>
        <filter id="hg-wobble" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.03" numOctaves="2" seed="7" result="n">
            <animate attributeName="baseFrequency" dur="6s" values="0.018 0.03;0.024 0.02;0.018 0.03" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="9" />
        </filter>
        <filter id="hg-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
      </defs>
      <g className="hg-float">
        <g filter="url(#hg-wobble)">
          <g className="hg-sway"><path d={GHOST} fill="url(#hg-body)" /></g>
          <g className="hg-face">
            <svg x="50" y="58" width="100" height="100" viewBox={DEHUB_MARK_VIEWBOX} opacity=".8">
              <path d={DEHUB_MARK_PATH} fill="#ff5a3c" filter="url(#hg-glow)" />
            </svg>
            <svg x="50" y="58" width="100" height="100" viewBox={DEHUB_MARK_VIEWBOX}>
              <path d={DEHUB_MARK_PATH} fill="url(#hg-ember)" />
            </svg>
          </g>
        </g>
      </g>
    </svg>
  );
}

export default function HalloweenGhostPopup({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { themeChoice, setTheme } = useAppTheme();
  const [leaving, setLeaving] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  // Desktop: a mouse wheel scrolls the theme rail sideways.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      rail.scrollLeft += e.deltaY;
    };
    rail.addEventListener('wheel', onWheel, { passive: false });
    return () => rail.removeEventListener('wheel', onWheel);
  }, []);

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, 450);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return createPortal(
    <div className="hg-root" role="dialog" aria-modal="true" aria-label={t('halloween.title', 'Happy Halloween')} data-leaving={leaving ? '' : undefined}>
      <style>{CSS}</style>
      <div className="hg-scrim" onClick={close} />
      <div className="hg-mist" />
      <div className="hg-card">
        <div className="hg-ghost"><Ghost /></div>
        <p className="hg-title">{t('halloween.title', 'Happy Halloween')}</p>
        <p className="hg-sub">{t('halloween.otherThemes', 'Find other themes in settings now:')}</p>
        <div className="hg-rail" ref={railRef}>
          {THEMES.map(([value, labelKey]) => (
            <ThemePreviewCard
              key={value}
              value={value}
              label={t(labelKey)}
              active={themeChoice === value}
              available
              onSelect={() => { setTheme(value); close(); }}
            />
          ))}
        </div>
      </div>
      <button type="button" className="hg-close" onClick={close} aria-label={t('common.close', 'Close')}>
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  );
}

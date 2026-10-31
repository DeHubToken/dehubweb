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

const GHOST_A = 'M100 6C150 6 176 42 178 98C180 140 186 178 190 204C192 218 180 226 168 218C158 211 150 213 143 223C135 235 120 235 112 223C106 214 94 214 88 223C80 235 65 235 57 223C50 213 42 211 32 218C20 226 8 218 10 204C14 178 20 140 22 98C24 42 50 6 100 6Z';
const GHOST_B = 'M100 6C150 6 176 42 178 98C180 140 188 180 194 208C196 222 182 224 170 214C160 206 152 216 145 227C137 238 122 232 114 220C108 210 96 218 90 228C82 238 67 232 59 220C52 210 44 206 34 214C22 224 6 222 8 208C14 180 20 140 22 98C24 42 50 6 100 6Z';

const CSS = `
.hg-root{position:fixed;inset:0;z-index:220;display:flex;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top,0px) + 16px) 16px calc(env(safe-area-inset-bottom,0px) + 16px)}
.hg-scrim{position:absolute;inset:0;background:rgba(4,2,3,.84);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);animation:hg-fade .5s ease-out both}
.hg-root[data-leaving] .hg-scrim{animation:hg-fade-out .45s ease-in both}
.hg-mist{position:absolute;left:-10%;right:-10%;bottom:0;height:45%;pointer-events:none;background:radial-gradient(50% 60% at 50% 100%,rgba(230,215,220,.16),transparent 70%);filter:blur(10px);animation:hg-fade 1.2s ease-out both}
.hg-card{position:relative;width:min(420px,100%);display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.hg-ghost{width:min(230px,58vw);margin-bottom:-18px;animation:hg-rise 1.2s cubic-bezier(.2,.8,.2,1) both}
.hg-root[data-leaving] .hg-ghost{animation:hg-vanish .45s ease-in both}
.hg-ghost svg{display:block;width:100%;height:auto;overflow:visible}
.hg-float{animation:hg-bob 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 40%}
.hg-face{animation:hg-follow 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 50%}
.hg-title{margin:4px 0 0;font-size:30px;line-height:1.05;font-weight:800;color:#f4ece8;letter-spacing:.01em;text-shadow:0 2px 0 #000,0 0 18px rgba(206,32,48,.6);animation:hg-up .6s .5s ease-out both}
.hg-enter{margin:6px 0 10px;min-height:46px;padding:0 26px;border-radius:999px;font-size:15px;font-weight:800;letter-spacing:.02em;color:#fff;background:linear-gradient(180deg,#e2334a,#a3121f);border:1px solid rgba(255,170,175,.45);box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 6px 22px rgba(206,32,48,.45);cursor:pointer;animation:hg-up .6s .56s ease-out both;transition:transform .15s ease,box-shadow .15s ease}
.hg-enter:hover{box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 8px 30px rgba(206,32,48,.65)}
.hg-enter:active{transform:scale(.96)}
.hg-enter:focus-visible{outline:2px solid #f4ece8;outline-offset:3px}
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
@keyframes hg-bob{0%,100%{transform:translateY(0) rotate(-2.5deg)}50%{transform:translateY(-8px) rotate(2.5deg)}}
@keyframes hg-follow{0%,100%{transform:translate(-1.5px,0)}50%{transform:translate(1.5px,-1px)}}
@keyframes hg-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.hg-root *{animation-duration:.01s!important;animation-iteration-count:1!important}}
`;

/**
 * The ghost, all vector: one silhouette whose tail ripples (a path morph, so
 * it stays sharp at any pixel density), soft shading clipped inside it, a
 * white rim, and the DeHub mark as its face riding the same float.
 */
function Ghost() {
  return (
    <svg viewBox="-30 -20 260 300" aria-hidden="true">
      <defs>
        <radialGradient id="hg-aura" cx=".5" cy=".45" r=".5">
          <stop offset="0" stopColor="#ff3b4a" stopOpacity=".55" />
          <stop offset=".55" stopColor="#ce2030" stopOpacity=".18" />
          <stop offset="1" stopColor="#ce2030" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hg-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".45" stopColor="#f6eeee" />
          <stop offset=".74" stopColor="#efdfe1" stopOpacity=".94" />
          <stop offset="1" stopColor="#f2c9cf" stopOpacity=".72" />
        </linearGradient>
        <radialGradient id="hg-shade" cx=".32" cy=".26" r=".85">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".6" stopColor="#7a2e3a" stopOpacity="0" />
          <stop offset="1" stopColor="#5a1822" stopOpacity=".26" />
        </radialGradient>
        <radialGradient id="hg-spec" cx=".3" cy=".18" r=".28">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hg-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".9" />
          <stop offset=".6" stopColor="#ffd9dc" stopOpacity=".35" />
          <stop offset="1" stopColor="#ff5a6a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hg-mark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8a4c" />
          <stop offset=".55" stopColor="#e2283a" />
          <stop offset="1" stopColor="#9e0f1f" />
        </linearGradient>
        <filter id="hg-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
        <path id="hg-shape" d={GHOST_A}>
          <animate attributeName="d" dur="2.4s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" values={`${GHOST_A};${GHOST_B};${GHOST_A}`} />
        </path>
        <clipPath id="hg-clip"><use href="#hg-shape" /></clipPath>
      </defs>
      <ellipse cx="100" cy="130" rx="140" ry="150" fill="url(#hg-aura)" />
      <g className="hg-float">
        <use href="#hg-shape" fill="url(#hg-body)" />
        <g clipPath="url(#hg-clip)">
          <rect x="0" y="0" width="200" height="240" fill="url(#hg-shade)" />
          <ellipse cx="66" cy="44" rx="40" ry="26" fill="url(#hg-spec)" />
        </g>
        <use href="#hg-shape" fill="none" stroke="url(#hg-rim)" strokeWidth="1.6" />
        <g className="hg-face">
          <svg x="48" y="58" width="104" height="104" viewBox={DEHUB_MARK_VIEWBOX} overflow="visible">
            <path d={DEHUB_MARK_PATH} fill="#ff3b2f" opacity=".9" filter="url(#hg-soft)" />
            <path d={DEHUB_MARK_PATH} fill="url(#hg-mark)" />
          </svg>
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
        <button type="button" className="hg-enter" onClick={close}>{t('halloween.enter', 'Enter the dungeon')}</button>
        <p className="hg-sub">{t('halloween.otherThemes', 'Not feeling spooky? Find other themes:')}</p>
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

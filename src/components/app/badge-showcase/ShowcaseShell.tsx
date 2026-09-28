/**
 * ShowcaseShell — the stage every badge showcase shares.
 *
 * The badge lifts out of where it was clicked and flies to the middle of a
 * darkened screen, then wakes up as a die-cut holographic sticker you can
 * tilt, bend and peel. A dock plays through the whole set like a sticker
 * pack. Everything that says what a badge *means* (tokens and perks for a
 * holder tier, a milestone for a streamer card) is the caller's details
 * column, rendered through `children`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import { Pause, Play, X } from 'lucide-react';
import { StickerStage, stickerArtRect, type StickerFinish, type StickerItem } from './sticker-stage';
import { SHOWCASE_CSS } from './showcase-ui';

export interface ShowcaseEntry {
  key: string;
  /** Accessible name, used on the dock thumbnail. */
  label: string;
  /** Square, transparent art for the sticker and the flying copy. */
  art: string;
  /** Art for the dock thumbnail. */
  thumb: string;
  finish: StickerFinish;
  /** Resting tilt in degrees, CSS direction. */
  tilt: number;
}

export interface ShowcaseApi {
  /** The entry on stage. */
  index: number;
  goTo: (index: number) => void;
  /** The viewer is doing something: stop autoplay. */
  pause: () => void;
  /** Close straight away, then run `then` (a navigation, say). */
  close: (then?: () => void) => void;
  /** Close the way the X does, flying the badge home when it can. */
  dismiss: () => void;
}

interface ShowcaseShellProps {
  entries: ShowcaseEntry[];
  originIndex: number;
  /** The clicked badge, flown out of and back into. */
  anchor: HTMLElement | null;
  onClose: () => void;
  dialogLabel: (index: number) => string;
  /** Accessible name of the dock. */
  dockLabel: string;
  /** Marks an entry in the dock as held or earned. */
  owned: (index: number) => boolean;
  children: (api: ShowcaseApi) => ReactNode;
}

/** How long each entry holds before the dock plays on to the next. */
const AUTOPLAY_MS = 4800;

const outCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const inOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outBack = (x: number) => {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

interface Box {
  x: number;
  y: number;
  size: number;
}

export function ShowcaseShell({
  entries,
  originIndex,
  anchor,
  onClose,
  dialogLabel,
  dockLabel,
  owned,
  children,
}: ShowcaseShellProps) {
  const { t } = useTranslation();
  const reduceMotion = !!useReducedMotion();
  const count = entries.length;

  const [index, setIndex] = useState(originIndex);
  const [playing, setPlaying] = useState(!reduceMotion);
  const [phase, setPhase] = useState<'enter' | 'open' | 'exit'>('enter');
  const [shown, setShown] = useState(false);
  const [landed, setLanded] = useState(false);
  const [stickerReady, setStickerReady] = useState(false);
  const [stickerOn, setStickerOn] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [fading, setFading] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flyerRef = useRef<HTMLImageElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<StickerStage | null>(null);
  const shownIndex = useRef(originIndex);
  const flightRaf = useRef(0);

  const items = useMemo<StickerItem[]>(
    () => entries.map((entry) => ({ src: entry.art, finish: entry.finish, tilt: entry.tilt * 0.5 })),
    [entries],
  );

  /* ---------- geometry ---------- */

  const heroBox = useCallback((): Box | null => {
    const stage = stageBoxRef.current;
    if (!stage) return null;
    const r = stage.getBoundingClientRect();
    const art = stickerArtRect(r.width, r.height);
    return { x: r.left + art.x, y: r.top + art.y, size: art.size };
  }, []);

  const anchorBox = useCallback((): Box | null => {
    if (!anchor || !anchor.isConnected) return null;
    const r = anchor.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    if (r.bottom < 0 || r.top > window.innerHeight) return null;
    return { x: r.left, y: r.top, size: Math.max(r.width, r.height) };
  }, [anchor]);

  const placeFlyer = (box: Box, rotate = 0) => {
    const el = flyerRef.current;
    if (!el) return;
    el.style.width = `${box.size}px`;
    el.style.height = `${box.size}px`;
    el.style.transform = `translate3d(${box.x}px, ${box.y}px, 0) rotate(${rotate}deg)`;
  };

  // three.js turns counter-clockwise for positive angles, CSS clockwise.
  const restTilt = -entries[originIndex].tilt * 0.5;

  const fly = (from: Box, to: Box, ms: number, mode: 'out' | 'home', done: () => void) => {
    cancelAnimationFrame(flightRaf.current);
    const start = performance.now();
    const arc = Math.min(80, window.innerHeight * 0.1);
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const move = mode === 'out' ? outCubic(p) : inOutCubic(p);
      const grow = mode === 'out' ? outBack(p) : inOutCubic(p);
      const x = from.x + (to.x - from.x) * move;
      const y = from.y + (to.y - from.y) * move - Math.sin(p * Math.PI) * arc;
      const size = from.size + (to.size - from.size) * grow;
      const spin = mode === 'out' ? restTilt + (1 - move) * -18 : restTilt * (1 - move) + move * -14;
      placeFlyer({ x, y, size }, spin);
      if (p < 1) flightRaf.current = requestAnimationFrame(step);
      else done();
    };
    flightRaf.current = requestAnimationFrame(step);
  };

  /* ---------- open ---------- */

  useLayoutEffect(() => {
    const hero = heroBox();
    const from = anchorBox();
    if (anchor) anchor.style.visibility = 'hidden';
    if (hero) placeFlyer(from && !reduceMotion ? from : hero, from && !reduceMotion ? -18 : restTilt);
    const raf = requestAnimationFrame(() => {
      setShown(true);
      if (hero && from && !reduceMotion) fly(from, hero, 760, 'out', () => setLanded(true));
      else setLanded(true);
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(flightRaf.current);
      if (anchor) anchor.style.visibility = '';
    };
    // Runs once: the flight is a one-off from where the click happened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The sticker takes over from the DOM copy once both are in place.
  useEffect(() => {
    if (!landed || phase !== 'enter') return;
    if (stickerReady) {
      setStickerOn(true);
      setPhase('open');
      // It takes over looking exactly like the flying copy, then its paper
      // and foil come in with a small burst of sparks.
      stageRef.current?.reveal();
    } else if (glFailed) {
      setPhase('open');
    }
  }, [landed, stickerReady, glFailed, phase]);

  useEffect(() => {
    if (!glFailed) return;
    const onResize = () => {
      const hero = heroBox();
      if (hero) placeFlyer(hero, restTilt);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glFailed, heroBox]);

  /* ---------- sticker stage ---------- */

  const handlers = useRef({ next: () => {}, close: () => {}, interact: () => {} });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stage: StickerStage;
    try {
      stage = new StickerStage(canvas, {
        onTap: () => handlers.current.next(),
        onMiss: () => handlers.current.close(),
        onInteract: () => handlers.current.interact(),
      });
    } catch {
      setGlFailed(true);
      return;
    }
    stage.setItems(items);
    stageRef.current = stage;
    stage.show(originIndex, { instant: true, hold: true }).then((ok) => {
      if (stageRef.current !== stage) return;
      if (ok) setStickerReady(true);
      else setGlFailed(true);
    });
    return () => {
      stage.dispose();
      if (stageRef.current === stage) stageRef.current = null;
    };
  }, [items, originIndex]);

  useEffect(() => {
    if (!stickerOn) return;
    const stage = stageRef.current;
    stage?.preload((originIndex + 1) % count);
    stage?.preload((originIndex - 1 + count) % count);
  }, [stickerOn, originIndex, count]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || index === shownIndex.current) return;
    const forward = (index - shownIndex.current + count) % count <= count / 2;
    shownIndex.current = index;
    stage.show(index, { direction: forward ? 1 : -1 });
    stage.preload((index + (forward ? 1 : -1) + count) % count);
  }, [index, count]);

  /* ---------- navigation ---------- */

  const goTo = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  const pause = useCallback(() => {
    setPlaying(false);
    setTouched(true);
  }, []);

  /* ---------- close ---------- */

  const requestClose = useCallback(() => {
    if (phase === 'exit') return;
    setPhase('exit');
    setPlaying(false);
    const home = anchorBox();
    const hero = heroBox();
    const flyHome = !!home && !!hero && !reduceMotion && index === originIndex;
    if (flyHome && hero && home) {
      placeFlyer(hero, restTilt);
      setStickerOn(false);
      fly(hero, home, 560, 'home', onClose);
    } else {
      setFading(true);
      window.setTimeout(onClose, reduceMotion ? 0 : 240);
    }
    // fly and restTilt only touch refs and the fixed origin entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, anchorBox, heroBox, reduceMotion, index, originIndex, onClose]);

  handlers.current = { next: () => goTo(index + 1), close: requestClose, interact: pause };

  // The how-to line is for the first look only, then the sticker stands alone.
  useEffect(() => {
    if (phase !== 'open') return;
    const id = window.setTimeout(() => setTouched(true), 5000);
    return () => window.clearTimeout(id);
  }, [phase]);

  /* ---------- page plumbing ---------- */

  useEffect(() => {
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest('[role="slider"]')) return;
      if (e.key === 'ArrowRight') {
        setPlaying(false);
        goTo(index + 1);
      } else if (e.key === 'ArrowLeft') {
        setPlaying(false);
        goTo(index - 1);
      } else if (e.key === ' ' && (target === document.body || target === rootRef.current)) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose, goTo, index]);

  // Desktop keeps the dock under the sticker; phones keep it at the bottom.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Thumbnails fade out toward whichever end still has more to scroll to,
  // so the rail melts into the play button rather than stopping at a rule.
  const [railFade, setRailFade] = useState({ start: false, end: true });
  const updateRailFade = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const start = rail.scrollLeft > 2;
    const end = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2;
    setRailFade((f) => (f.start === start && f.end === end ? f : { start, end }));
  }, []);
  useEffect(() => {
    updateRailFade();
    window.addEventListener('resize', updateRailFade);
    return () => window.removeEventListener('resize', updateRailFade);
  }, [updateRailFade, isDesktop]);
  const railMask = `linear-gradient(to right, ${railFade.start ? 'transparent 0, #000 28px' : '#000 0'}, ${
    railFade.end ? '#000 calc(100% - 40px), transparent 100%' : '#000 100%'
  })`;

  // Keep the active thumbnail in view without scrolling anything else.
  useEffect(() => {
    const rail = railRef.current;
    const thumb = rail?.children[index] as HTMLElement | undefined;
    if (!rail || !thumb) return;
    rail.scrollTo({
      left: thumb.offsetLeft - rail.clientWidth / 2 + thumb.clientWidth / 2,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [index, reduceMotion, isDesktop]);

  const open = shown && phase !== 'exit';
  const panelIn = phase === 'open';
  const autoplaying = playing && phase === 'open';

  const api: ShowcaseApi = {
    index,
    goTo,
    pause,
    close: (then) => {
      onClose();
      then?.();
    },
    dismiss: requestClose,
  };

  const dock = (
    <nav
      aria-label={dockLabel}
      className="relative z-10 mx-auto flex w-full max-w-[480px] shrink-0 items-center gap-1 rounded-[20px] border border-white/10 bg-white/[0.07] p-1 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl transition-[opacity,transform] duration-700 lg:w-auto lg:max-w-[calc(100%-24px)] lg:p-1.5"
      style={{
        opacity: panelIn ? 1 : 0,
        transform: panelIn ? 'none' : 'translateY(24px)',
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        ref={railRef}
        onScroll={updateRailFade}
        className="flex min-w-0 flex-1 snap-x gap-0.5 overflow-x-auto py-1 scrollbar-hide lg:flex-none"
        style={{ maskImage: railMask, WebkitMaskImage: railMask }}
      >
        {entries.map((entry, i) => {
          const active = i === index;
          return (
            <button
              key={entry.key}
              type="button"
              aria-label={entry.label}
              aria-current={active ? 'true' : undefined}
              onClick={() => {
                setTouched(true);
                goTo(i);
              }}
              className="relative shrink-0 snap-center rounded-[14px] p-1 transition-colors duration-300 hover:bg-white/[0.07] lg:p-1.5"
            >
              <img
                src={entry.thumb}
                alt=""
                draggable={false}
                className="block h-8 w-8 object-contain lg:h-10 lg:w-10"
                style={{
                  transform: `rotate(${entry.tilt}deg) scale(${active ? 1.08 : 0.84})`,
                  filter: active ? 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))' : 'saturate(0.35)',
                  opacity: active ? 1 : 0.5,
                  transition: 'opacity 0.35s, filter 0.35s, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              />
              {owned(i) && <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
              <span
                aria-hidden
                className="absolute bottom-0 left-1/2 h-0.5 w-6 -translate-x-1/2 overflow-hidden rounded-full bg-white/10 transition-opacity duration-300"
                style={{ opacity: active ? 1 : 0 }}
              >
                {active && (
                  <span
                    key={index}
                    className="block h-full w-full origin-left bg-white/85"
                    style={
                      {
                        animation: `badge-showcase-fill ${AUTOPLAY_MS}ms linear forwards`,
                        animationPlayState: autoplaying ? 'running' : 'paused',
                      } as CSSProperties
                    }
                    onAnimationEnd={() => goTo(index + 1)}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? t('badgeShowcase.pause') : t('badgeShowcase.play')}
        aria-pressed={!playing}
        className="bs-chrome-dark ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full lg:h-10 lg:w-10"
      >
        {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}
      </button>
    </nav>
  );

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel(index)}
      tabIndex={-1}
      className="fixed inset-0 z-[120] flex flex-col overflow-hidden text-white outline-none transition-[opacity,transform] duration-200"
      style={{ pointerEvents: 'auto', opacity: fading ? 0 : 1, transform: fading ? 'scale(0.98)' : 'none' }}
    >
      <style>{SHOWCASE_CSS}</style>

      {/* The page falls away behind the badge. */}
      <div
        aria-hidden
        onClick={requestClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md transition-opacity duration-500 ease-out"
        style={{ opacity: open ? 1 : 0 }}
      />

      {/* Positioned by a wrapper: the chrome finish sets position: relative on
          the button itself, which would override an absolute class there and
          drop the button into the flow above the stage. */}
      <div
        className="absolute right-4 top-[max(env(safe-area-inset-top),12px)] z-20 transition-opacity duration-300 lg:right-[max(1.5rem,calc(50%-590px+1.5rem))] lg:top-6"
        style={{ opacity: panelIn ? 1 : 0 }}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={requestClose}
          aria-label={t('badgeShowcase.close')}
          className="bs-chrome-dark grid h-9 w-9 place-items-center rounded-full lg:h-10 lg:w-10"
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* Capped and centred on desktop, so the details and the X stay beside
          the badge instead of drifting to the far edges of a wide screen. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-[1180px] lg:flex-row">
        {/* Stage, with the dock centred under the sticker on desktop. */}
        <div className="relative flex min-h-0 flex-1 flex-col lg:pb-6">
          <div ref={stageBoxRef} className="relative min-h-[160px] flex-1">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 transition-opacity duration-700"
              style={{
                opacity: open ? 1 : 0,
                background: 'radial-gradient(50% 50% at 50% 50%, rgba(255,255,255,0.08), transparent 70%)',
              }}
            />
            <canvas
              ref={canvasRef}
              aria-hidden
              className="absolute inset-0 h-full w-full transition-opacity duration-200"
              style={{ opacity: stickerOn ? 1 : 0, touchAction: 'none' }}
            />
            <p
              className="pointer-events-none absolute inset-x-0 bottom-1 hidden text-center text-[11px] text-white/35 transition-opacity duration-500 sm:block"
              style={{ opacity: panelIn && !touched && !glFailed ? 1 : 0 }}
            >
              {t('badgeShowcase.hint')}
            </p>
          </div>
          {isDesktop && dock}
        </div>

        {/* Details: one 8px gap, 16px radius and 12px padding throughout. */}
        <div
          className="relative min-h-0 overflow-y-auto overscroll-contain px-4 pb-3 transition-[opacity,transform] duration-500 ease-out scrollbar-hide lg:flex lg:w-[400px] lg:shrink-0 lg:flex-col lg:py-6 lg:pl-0 lg:pr-8"
          style={{
            opacity: panelIn ? 1 : 0,
            transform: panelIn ? 'none' : 'translateY(14px)',
            pointerEvents: panelIn ? 'auto' : 'none',
          }}
        >
          {/* my-auto rather than justify-center: centred while it fits, and
              scrolling from the top instead of clipping when it does not. */}
          <div className="mx-auto w-full max-w-[480px] lg:my-auto">{children(api)}</div>
        </div>
      </div>

      {/* Same 480px column and 16px gutters as the details, so the edges line up. */}
      {!isDesktop && <div className="mb-[max(env(safe-area-inset-bottom),10px)] mt-2 shrink-0 px-4">{dock}</div>}

      {/* The badge in flight, and the stand-in if WebGL is unavailable. */}
      <img
        ref={flyerRef}
        src={glFailed ? entries[index].art : entries[originIndex].art}
        alt=""
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-20 object-contain will-change-transform"
        style={{
          opacity: stickerOn ? 0 : phase === 'exit' && index !== originIndex ? 0 : 1,
          transition: 'opacity 0.2s',
          filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.55))',
          animation: glFailed && phase === 'open' ? 'badge-showcase-float 4s ease-in-out infinite' : undefined,
        }}
      />
    </div>,
    document.body,
  );
}

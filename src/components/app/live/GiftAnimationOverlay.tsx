/**
 * Gift celebrations over a live stream
 * ====================================
 * Ten tiers, ten distinct animations, all of them playing in a box pinned to
 * the bottom-right of the player — over the live chat when the stream is
 * fullscreen with chat open. Deliberately NOT a screen takeover: the thing the
 * room came for is the broadcast, and a paid gift should decorate the corner it
 * lives in rather than cover the video for everyone watching.
 *
 * Two things make that work.
 *
 * THE STAGE IS THE UNIT, NOT THE VIEWPORT. Every animation is written against
 * `--dhg-w` / `--dhg-h`, the measured pixel size of the corner box, so the same
 * keyframes read correctly whether the player is a card in the feed or filling
 * a phone in fullscreen. Viewport units would have a shield wall march clean
 * past a 320px-wide stage, and transform percentages resolve against the
 * particle rather than its container, which is the trap that makes this look
 * like it should be simpler than it is. A ResizeObserver keeps the measurement
 * honest across rotation and fullscreen transitions.
 *
 * COMPOSITOR ONLY. Every animation is CSS keyframes on `transform` and
 * `opacity`. An Ultimate is ~90 elements moving on top of a decoding video;
 * springing those through React would put the lot on the main thread next to
 * the decoder. Nothing here re-renders per frame.
 *
 * The layer is `pointer-events-none` end to end — a celebration can never eat a
 * tap on the player or the chat underneath it — and collapses to a static
 * caption for anyone who asked for reduced motion.
 */
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { GiftTier } from '@/lib/live/gift-tiers';

export interface GiftCelebration {
  id: string;
  tier: GiftTier;
  amount: number;
  /** Who sent it — a username when we have one, never a raw address. */
  username?: string;
  message?: string;
}

/**
 * Deterministic pseudo-random from a particle's index.
 *
 * Math.random() during render would hand every particle a new position each
 * time the list re-renders, snapping the ones already in flight somewhere else
 * the moment a second gift lands.
 */
const jitter = (seed: number, salt: number) => {
  const v = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** Stage-relative length: a fraction of the corner box's width or height. */
const w = (f: number) => `calc(var(--dhg-w) * ${f})`;
const h = (f: number) => `calc(var(--dhg-h) * ${f})`;

/** One stylesheet for every live card, injected on the first celebration. */
const STYLE_ID = 'dehub-gift-fx';
const KEYFRAMES = `
@keyframes dhg-rise {
  0%   { opacity: 0; transform: translate3d(0, 0, 0) scale(0.4); }
  12%  { opacity: 1; }
  72%  { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--dhg-dx), calc(var(--dhg-h) * -1), 0) scale(1.1) rotate(var(--dhg-spin)); }
}
@keyframes dhg-sweep {
  0%   { opacity: 0; transform: translate3d(0, 0, 0) scale(0.4); }
  12%  { opacity: 1; }
  82%  { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--dhg-dx), var(--dhg-dy), 0) scale(1.05) rotate(var(--dhg-spin)); }
}
@keyframes dhg-beat {
  0%, 100% { transform: scale(1); }
  14%      { transform: scale(1.4); }
  30%      { transform: scale(1.05); }
  46%      { transform: scale(1.25); }
  62%      { transform: scale(1); }
}
@keyframes dhg-fall {
  0%   { opacity: 0; transform: translate3d(0, calc(var(--dhg-h) * -0.15), 0) rotate(0deg); }
  10%  { opacity: 1; }
  86%  { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--dhg-dx), calc(var(--dhg-h) * 1.1), 0) rotate(var(--dhg-spin)); }
}
@keyframes dhg-burst {
  0%   { opacity: 0; transform: translate3d(0, 0, 0) scale(0.2); }
  16%  { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--dhg-dx), var(--dhg-dy), 0) scale(1.05) rotate(var(--dhg-spin)); }
}
@keyframes dhg-cross {
  0%   { opacity: 0; transform: translate3d(var(--dhg-from), calc(var(--dhg-h) * 0.3), 0) rotate(var(--dhg-tilt)) scale(0.45); }
  14%  { opacity: 1; }
  100% { opacity: 0; transform: translate3d(var(--dhg-dx), calc(var(--dhg-h) * -0.25), 0) rotate(calc(var(--dhg-tilt) * -1)) scale(1.05); }
}
@keyframes dhg-drop {
  0%   { opacity: 0; transform: translateY(calc(var(--dhg-h) * -0.7)) scale(0.55) rotate(-14deg); }
  16%  { opacity: 1; }
  42%  { transform: translateY(0) scale(1) rotate(0deg); }
  52%  { transform: translateY(calc(var(--dhg-h) * -0.14)) scale(0.97) rotate(4deg); }
  62%  { transform: translateY(0) scale(1.05) rotate(0deg); }
  70%  { transform: translateY(calc(var(--dhg-h) * -0.05)) scale(1) rotate(0deg); }
  82%  { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
  100% { opacity: 0; transform: translateY(0) scale(1.45) rotate(0deg); }
}
@keyframes dhg-shock {
  0%   { opacity: 0.9; transform: scale(0); }
  100% { opacity: 0; transform: scale(3); }
}
@keyframes dhg-fly {
  0%   { opacity: 0; transform: translate3d(calc(var(--dhg-w) * -0.7), calc(var(--dhg-h) * 0.2), 0) scale(0.45) rotate(-25deg); }
  14%  { opacity: 1; }
  46%  { transform: translate3d(0, 0, 0) scale(1.2) rotate(0deg); }
  60%  { transform: translate3d(0, 0, 0) scale(1.2) rotate(0deg); }
  100% { opacity: 0; transform: translate3d(calc(var(--dhg-w) * 0.7), calc(var(--dhg-h) * -0.2), 0) scale(0.55) rotate(25deg); }
}
@keyframes dhg-march {
  0%   { transform: translate3d(calc(var(--dhg-w) * -0.55), 0, 0); }
  100% { transform: translate3d(calc(var(--dhg-w) * 1.15), 0, 0); }
}
@keyframes dhg-step {
  0%, 100% { transform: translateY(0) rotate(-5deg); }
  50%      { transform: translateY(calc(var(--dhg-h) * -0.035)) rotate(5deg); }
}
@keyframes dhg-quake {
  0%, 100% { transform: translate3d(0, 0, 0); }
  20%      { transform: translate3d(-1.5%, 0.8%, 0); }
  40%      { transform: translate3d(1.5%, -0.8%, 0); }
  60%      { transform: translate3d(-1%, -0.8%, 0); }
  80%      { transform: translate3d(1%, 0.8%, 0); }
}
@keyframes dhg-streamer {
  0%   { opacity: 0; transform: translateY(-100%) scaleY(0.2); }
  16%  { opacity: 1; transform: translateY(0) scaleY(1); }
  84%  { opacity: 1; }
  100% { opacity: 0; transform: translateY(12%) scaleY(1); }
}
@keyframes dhg-swing {
  0%   { opacity: 0; transform: translateY(-120%) rotate(-20deg); }
  16%  { opacity: 1; transform: translateY(0) rotate(-20deg); }
  45%  { transform: translateY(0) rotate(20deg); }
  75%  { transform: translateY(0) rotate(-14deg); }
  100% { opacity: 0; transform: translateY(-120%) rotate(0deg); }
}
@keyframes dhg-lid {
  0%   { opacity: 0; transform: translateY(calc(var(--dhg-h) * 0.2)) scale(0.35) rotate(0deg); }
  22%  { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
  36%  { transform: translateY(0) scale(1.06) rotate(-9deg); }
  46%  { transform: translateY(0) scale(1.06) rotate(9deg); }
  58%  { transform: translateY(0) scale(1.2) rotate(0deg); }
  72%  { opacity: 1; transform: translateY(calc(var(--dhg-h) * -0.06)) scale(1.24) rotate(0deg); }
  100% { opacity: 0; transform: translateY(calc(var(--dhg-h) * -0.22)) scale(0.8) rotate(14deg); }
}
@keyframes dhg-wash {
  0%   { opacity: 0; }
  12%  { opacity: 1; }
  88%  { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes dhg-siren {
  0%, 100% { opacity: 0.2; }
  50%      { opacity: 0.8; }
}
@keyframes dhg-searchlight {
  0%   { transform: translateX(calc(var(--dhg-w) * -0.6)) rotate(14deg); }
  100% { transform: translateX(calc(var(--dhg-w) * 1.6)) rotate(14deg); }
}
@keyframes dhg-glint {
  0%   { opacity: 0; transform: translateX(calc(var(--dhg-w) * -0.6)) skewX(-20deg); }
  50%  { opacity: 0.85; }
  100% { opacity: 0; transform: translateX(calc(var(--dhg-w) * 1.6)) skewX(-20deg); }
}
@keyframes dhg-banner {
  0%   { opacity: 0; transform: translateY(40%) scale(0.92); }
  14%  { opacity: 1; transform: translateY(0) scale(1); }
  86%  { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-24%) scale(0.96); }
}
`;

function useGiftKeyframes(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = KEYFRAMES;
    document.head.appendChild(el);
    // Never removed on purpose: static keyframes shared by every live card, and
    // tearing them down would strip the effect off a celebration still playing
    // somewhere else.
  }, [active]);
}

/** Viewers who asked for less motion get the caption and none of the movement. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * The corner box's size in pixels.
 *
 * Measured rather than assumed: the same card is a 16:9 tile in the feed and a
 * full phone screen in fullscreen, and the animations are written as fractions
 * of this. Falls back to a sane box before the first measurement so a gift that
 * lands on the very first frame still plays.
 */
function useStageSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ w: 280, h: 360 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/* ------------------------------------------------------------------ *
 * Shared particle fields
 * ------------------------------------------------------------------ */

/** Glyphs falling the height of the stage, across its width. */
const FallField = memo(
  ({
    count,
    glyphs,
    durationMs,
    sizeFrom = 0.05,
    sizeTo = 0.11,
  }: {
    count: number;
    glyphs: string[];
    durationMs: number;
    /** Glyph size as a fraction of stage width. */
    sizeFrom?: number;
    sizeTo?: number;
  }) => {
    const particles = useMemo(
      () =>
        Array.from({ length: count }, (_, i) => {
          const a = jitter(i + 1, 23);
          const b = jitter(i + 1, 31);
          return {
            i,
            glyph: glyphs[i % glyphs.length],
            style: {
              left: `${a * 100}%`,
              top: 0,
              fontSize: w(sizeFrom + b * (sizeTo - sizeFrom)),
              animationName: 'dhg-fall',
              animationTimingFunction: 'linear',
              animationFillMode: 'both',
              animationDelay: `${a * durationMs * 0.5}ms`,
              animationDuration: `${1300 + b * 1300}ms`,
              animationIterationCount: Math.max(1, Math.round(durationMs / 2200)),
              '--dhg-dx': w((b - 0.5) * 0.3),
              '--dhg-spin': `${(a - 0.5) * 900}deg`,
            } as CSSProperties,
          };
        }),
      [count, glyphs, durationMs, sizeFrom, sizeTo],
    );
    return (
      <>
        {particles.map((p) => (
          <span key={p.i} className="absolute select-none" style={p.style}>
            {p.glyph}
          </span>
        ))}
      </>
    );
  },
);
FallField.displayName = 'FallField';

/** A radial burst from a point on the stage. */
const BurstField = memo(
  ({
    count,
    glyphs,
    originX,
    originY,
    reach = 0.55,
    size = 0.1,
    stagger = 45,
    durationMs,
  }: {
    count: number;
    glyphs: string[];
    /** Origin as a percentage of the stage. */
    originX: string;
    originY: string;
    /** Throw distance as a fraction of the stage. */
    reach?: number;
    size?: number;
    stagger?: number;
    durationMs: number;
  }) => {
    const particles = useMemo(
      () =>
        Array.from({ length: count }, (_, i) => {
          const angle = (Math.PI * 2 * i) / count + jitter(i + 1, 7);
          const r = reach * (0.55 + jitter(i + 1, 5) * 0.8);
          return {
            i,
            glyph: glyphs[i % glyphs.length],
            style: {
              left: originX,
              top: originY,
              fontSize: w(size * (0.7 + jitter(i + 1, 19) * 0.8)),
              animationName: 'dhg-burst',
              animationTimingFunction: 'cubic-bezier(0.15, 0.7, 0.3, 1)',
              animationFillMode: 'both',
              animationDelay: `${i * stagger}ms`,
              animationDuration: `${1100 + jitter(i + 1, 11) * 800}ms`,
              '--dhg-dx': w(Math.cos(angle) * r),
              '--dhg-dy': h(Math.sin(angle) * r),
              '--dhg-spin': `${(jitter(i + 1, 13) - 0.5) * 540}deg`,
            } as CSSProperties,
          };
        }),
      [count, glyphs, originX, originY, reach, size, stagger],
    );
    return (
      <>
        {particles.map((p) => (
          <span key={p.i} className="absolute select-none" style={p.style}>
            {p.glyph}
          </span>
        ))}
      </>
    );
  },
);
BurstField.displayName = 'BurstField';

/** The tier's own emoji climbing out of the bottom of the stage. Every tier. */
const CornerFloat = memo(({ tier, count }: { tier: GiftTier; count: number }) => {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = jitter(i + 1, 3);
        const b = jitter(i + 1, 9);
        const c = jitter(i + 1, 17);
        return {
          i,
          style: {
            left: `${6 + a * 82}%`,
            bottom: `${2 + b * 10}%`,
            fontSize: w(0.07 + c * 0.07),
            animationName: 'dhg-rise',
            animationTimingFunction: 'ease-out',
            animationFillMode: 'both',
            animationDelay: `${(i / Math.max(count, 1)) * (tier.durationMs * 0.6)}ms`,
            animationDuration: `${1700 + b * 1400}ms`,
            '--dhg-dx': w((a - 0.5) * 0.35),
            '--dhg-spin': `${(b - 0.5) * 90}deg`,
          } as CSSProperties,
        };
      }),
    [count, tier.durationMs],
  );
  return (
    <>
      {particles.map((p) => (
        <span
          key={p.i}
          className="absolute select-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
          style={p.style}
        >
          {tier.emoji}
        </span>
      ))}
    </>
  );
});
CornerFloat.displayName = 'CornerFloat';

/** A colour wash across the stage. Doubles as a delay gate for its children. */
const Wash = memo(
  ({
    durationMs,
    className,
    siren,
    delay = 0,
    children,
  }: {
    durationMs: number;
    className?: string;
    siren?: boolean;
    delay?: number;
    children?: React.ReactNode;
  }) => (
    <>
      {className && (
        <div className={cn('absolute inset-0', className)} style={{ animation: `dhg-wash ${durationMs}ms ease-in-out ${delay}ms both` }} />
      )}
      {siren && (
        <div
          className="absolute inset-0"
          style={{
            boxShadow: 'inset 0 0 40% 12% rgba(251,191,36,0.85)',
            animation: `dhg-siren 900ms ease-in-out infinite, dhg-wash ${durationMs}ms ease-in-out ${delay}ms both`,
          }}
        />
      )}
      {children && (
        // Children ride the wash's opacity so a burst can be timed to land on
        // the frame the thing above it opens, without a timer in JS.
        <div className="absolute inset-0" style={{ animation: `dhg-wash ${durationMs}ms linear ${delay}ms both` }}>
          {children}
        </div>
      )}
    </>
  ),
);
Wash.displayName = 'Wash';

/** A bar of light raking across the stage. */
const Glint = memo(({ durationMs, delay = 300 }: { durationMs: number; delay?: number }) => (
  <span
    className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-white/70 to-transparent"
    style={{ width: w(0.28), animation: `dhg-glint ${Math.min(durationMs, 1700)}ms ease-in-out ${delay}ms both` }}
  />
));
Glint.displayName = 'Glint';

/** Expanding rings from the middle of the stage. */
const Shockwave = memo(({ durationMs, color, rings = 3 }: { durationMs: number; color: string; rings?: number }) => (
  <div className="absolute inset-0 flex items-center justify-center">
    {Array.from({ length: rings }, (_, i) => (
      <span
        key={i}
        className={cn('absolute rounded-full border-2', color)}
        style={{
          width: w(0.34),
          height: w(0.34),
          animation: `dhg-shock ${Math.min(durationMs, 1600)}ms ease-out ${i * 240}ms infinite`,
        }}
      />
    ))}
  </div>
));
Shockwave.displayName = 'Shockwave';

/** The one big glyph, centred on the stage. */
const Hero = memo(({ glyph, durationMs, keyframe = 'dhg-drop' }: { glyph: string; durationMs: number; keyframe?: string }) => (
  <div className="absolute inset-0 flex items-center justify-center">
    <span
      className="select-none leading-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.65)]"
      style={{ fontSize: w(0.42), animation: `${keyframe} ${durationMs}ms cubic-bezier(0.2, 0.8, 0.3, 1) both` }}
    >
      {glyph}
    </span>
  </div>
));
Hero.displayName = 'Hero';

/* ------------------------------------------------------------------ *
 * The ten
 * ------------------------------------------------------------------ */

const COINS = ['🪙', '💰', '🟡'];
const CONFETTI = ['🎊', '🎉', '✨', '🔴', '🔵', '🟢', '🟣'];
const CHOCOLATES = ['🍫', '🍬', '🍪', '🟤'];
const PETALS = ['🌸', '🌹', '💐', '🌷', '🌺'];
const SPARKS = ['✨', '💫', '⭐', '🌟'];

/** 1,000 — hearts sweep up the stage on the diagonal, beating as they climb. */
const HeartSweep = memo(({ durationMs }: { durationMs: number }) => {
  const hearts = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = jitter(i + 1, 3);
        const b = jitter(i + 1, 21);
        return {
          i,
          glyph: ['❤️', '💖', '💕', '💗'][i % 4],
          outer: {
            left: `${a * 55}%`,
            bottom: `${b * 18}%`,
            animationName: 'dhg-sweep',
            animationTimingFunction: 'cubic-bezier(0.3, 0.1, 0.4, 1)',
            animationFillMode: 'both',
            animationDelay: `${i * 95}ms`,
            animationDuration: `${1700 + a * 900}ms`,
            '--dhg-dx': w(0.55 + a * 0.45),
            '--dhg-dy': h(-0.85 - b * 0.3),
            '--dhg-spin': `${(b - 0.5) * 90}deg`,
          } as CSSProperties,
          inner: {
            fontSize: w(0.09 + b * 0.09),
            animation: `dhg-beat ${740 + a * 320}ms ease-in-out infinite`,
            display: 'inline-block',
          } as CSSProperties,
        };
      }),
    [],
  );
  return (
    <>
      <Wash durationMs={durationMs} className="bg-gradient-to-tr from-rose-500/25 via-transparent to-pink-400/15" />
      {hearts.map((hx) => (
        <span key={hx.i} className="absolute select-none" style={hx.outer}>
          <span style={hx.inner}>{hx.glyph}</span>
        </span>
      ))}
    </>
  );
});
HeartSweep.displayName = 'HeartSweep';

/** 10,000 — a box lands, rattles, bursts open, chocolates spill and tumble. */
const ChocolateBox = memo(({ durationMs }: { durationMs: number }) => (
  <>
    <Wash durationMs={durationMs} className="bg-amber-900/25" />
    <div className="absolute inset-0 flex items-center justify-center">
      <span
        className="select-none leading-none drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)]"
        style={{ fontSize: w(0.34), animation: `dhg-lid ${durationMs * 0.72}ms ease-out both` }}
      >
        🎁
      </span>
    </div>
    <Wash durationMs={durationMs} delay={durationMs * 0.3}>
      <BurstField count={14} glyphs={CHOCOLATES} originX="50%" originY="46%" reach={0.62} size={0.11} stagger={35} durationMs={durationMs} />
    </Wash>
    <Wash durationMs={durationMs} delay={durationMs * 0.36}>
      <FallField count={12} glyphs={CHOCOLATES} durationMs={durationMs} sizeFrom={0.05} sizeTo={0.1} />
    </Wash>
  </>
));
ChocolateBox.displayName = 'ChocolateBox';

/** 25,000 — flowers fly in from both sides, cross, then petals fall. */
const FlowerCross = memo(({ durationMs }: { durationMs: number }) => {
  const stems = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const fromLeft = i % 2 === 0;
        const a = jitter(i + 1, 5);
        return {
          i,
          glyph: PETALS[i % PETALS.length],
          style: {
            left: '50%',
            top: `${18 + a * 52}%`,
            fontSize: w(0.09 + a * 0.08),
            animationName: 'dhg-cross',
            animationTimingFunction: 'cubic-bezier(0.2, 0.6, 0.3, 1)',
            animationFillMode: 'both',
            animationDelay: `${i * 75}ms`,
            animationDuration: `${1400 + a * 600}ms`,
            '--dhg-from': w(fromLeft ? -0.65 : 0.65),
            '--dhg-dx': w(fromLeft ? 0.7 : -0.7),
            '--dhg-tilt': `${fromLeft ? -40 : 40}deg`,
          } as CSSProperties,
        };
      }),
    [],
  );
  return (
    <>
      <Wash durationMs={durationMs} className="bg-gradient-to-b from-rose-400/20 to-transparent" />
      {stems.map((s) => (
        <span key={s.i} className="absolute select-none" style={s.style}>
          {s.glyph}
        </span>
      ))}
      <FallField count={12} glyphs={['🌸', '🌺']} durationMs={durationMs} sizeFrom={0.04} sizeTo={0.08} />
    </>
  );
});
FlowerCross.displayName = 'FlowerCross';

/** 50,000 — the crown falls, lands hard, and the stage rings out. */
const CrownDrop = memo(({ durationMs }: { durationMs: number }) => (
  <>
    <Wash durationMs={durationMs} className="bg-gradient-to-b from-yellow-300/25 via-transparent to-amber-500/20" />
    <Hero glyph="👑" durationMs={durationMs} />
    {/* Delayed to the frame the crown actually lands on. */}
    <Wash durationMs={durationMs} delay={durationMs * 0.4}>
      <Shockwave durationMs={durationMs} color="border-yellow-200/80" />
      <Glint durationMs={durationMs} delay={0} />
      <BurstField count={10} glyphs={SPARKS} originX="50%" originY="46%" reach={0.45} size={0.08} stagger={45} durationMs={durationMs} />
    </Wash>
  </>
));
CrownDrop.displayName = 'CrownDrop';

/** 100,000 — the ring flies across the stage, then rings out in sparkles. */
const RingFlight = memo(({ durationMs }: { durationMs: number }) => (
  <>
    <Wash durationMs={durationMs} className="bg-gradient-to-r from-purple-500/25 via-fuchsia-400/12 to-purple-500/25" />
    <div className="absolute inset-0 flex items-center justify-center">
      <span
        className="select-none leading-none drop-shadow-[0_0_24px_rgba(216,180,254,0.9)]"
        style={{ fontSize: w(0.32), animation: `dhg-fly ${durationMs}ms cubic-bezier(0.3,0.1,0.3,1) both` }}
      >
        💍
      </span>
    </div>
    <Wash durationMs={durationMs} delay={durationMs * 0.42}>
      <Shockwave durationMs={durationMs} color="border-purple-300/80" rings={4} />
      <BurstField count={14} glyphs={SPARKS} originX="50%" originY="48%" reach={0.58} size={0.075} stagger={35} durationMs={durationMs} />
    </Wash>
  </>
));
RingFlight.displayName = 'RingFlight';

/** 200,000 — the wall crosses the stage and the stage shakes as it passes. */
const SpartanWall = memo(({ durationMs }: { durationMs: number }) => (
  <div
    className="absolute inset-0"
    style={{ animation: `dhg-quake 420ms ease-in-out infinite, dhg-wash ${durationMs}ms linear both` }}
  >
    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/55 via-transparent to-transparent" />
    <div
      className="absolute left-0 flex items-end"
      style={{ top: '46%', gap: w(0.015), animation: `dhg-march ${durationMs}ms linear both` }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className="select-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)]"
          style={{
            fontSize: w(0.16),
            animation: `dhg-step ${600 + (i % 3) * 70}ms ease-in-out ${i * 60}ms infinite`,
          }}
        >
          {i % 3 === 1 ? '🗡️' : '🛡️'}
        </span>
      ))}
    </div>
    {/* Dust along the line they march. */}
    <div
      className="absolute inset-x-0 bg-gradient-to-t from-amber-100/25 to-transparent"
      style={{ top: '58%', height: h(0.16) }}
    />
  </div>
));
SpartanWall.displayName = 'SpartanWall';

/** 300,000 — streamers, confetti and a disco ball over the whole stage. */
const PartyScreen = memo(({ durationMs }: { durationMs: number }) => {
  const streamers = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const a = jitter(i + 1, 29);
        return {
          i,
          style: {
            left: `${(i / 7) * 100 + a * 8}%`,
            top: 0,
            width: w(0.02),
            height: `${18 + a * 32}%`,
            transformOrigin: 'top center',
            animation: `dhg-streamer ${durationMs}ms cubic-bezier(0.3,0.8,0.4,1) ${i * 85}ms both`,
          } as CSSProperties,
          cls: ['bg-pink-400/80', 'bg-cyan-300/80', 'bg-amber-300/80', 'bg-violet-400/80'][i % 4],
        };
      }),
    [durationMs],
  );
  return (
    <>
      <Wash durationMs={durationMs} className="bg-gradient-to-br from-fuchsia-500/20 via-transparent to-cyan-400/20" />
      {streamers.map((s) => (
        <span key={s.i} className={cn('absolute rounded-b-full', s.cls)} style={s.style} />
      ))}
      <FallField count={26} glyphs={CONFETTI} durationMs={durationMs} sizeFrom={0.045} sizeTo={0.1} />
      <div className="absolute inset-x-0 top-0 flex justify-center">
        <span
          className="select-none drop-shadow-[0_6px_18px_rgba(255,255,255,0.6)]"
          style={{ fontSize: w(0.2), transformOrigin: 'top center', animation: `dhg-swing ${durationMs}ms ease-in-out both` }}
        >
          🪩
        </span>
      </div>
    </>
  );
});
PartyScreen.displayName = 'PartyScreen';

/** 500,000 / 750,000 — the stage turns gold and it rains money. */
const GoldenScreen = memo(({ durationMs, long }: { durationMs: number; long?: boolean }) => (
  <>
    <Wash
      durationMs={durationMs}
      className="bg-gradient-to-b from-amber-300/55 via-yellow-400/35 to-amber-500/55 mix-blend-screen"
      siren
    />
    <FallField count={long ? 30 : 18} glyphs={COINS} durationMs={durationMs} sizeFrom={0.055} sizeTo={0.13} />
    {long && (
      // The long one earns a searchlight raking the stage; the 3s version is
      // over before a slow sweep would read as anything at all.
      <span
        className="absolute bg-gradient-to-b from-transparent via-white/45 to-transparent"
        style={{ top: '-25%', height: '150%', width: w(0.2), animation: `dhg-searchlight ${durationMs}ms linear both` }}
      />
    )}
    <Glint durationMs={durationMs} delay={200} />
  </>
));
GoldenScreen.displayName = 'GoldenScreen';

/** 1,000,000 — gold, money, confetti, fireworks and a trophy. */
const Ultimate = memo(({ durationMs }: { durationMs: number }) => {
  const fireworks = useMemo(
    () => [
      { x: '24%', y: '24%', delay: 400 },
      { x: '76%', y: '18%', delay: 1200 },
      { x: '50%', y: '12%', delay: 2000 },
      { x: '18%', y: '58%', delay: 2900 },
      { x: '82%', y: '52%', delay: 3800 },
    ],
    [],
  );
  return (
    <>
      <Wash
        durationMs={durationMs}
        className="bg-gradient-to-b from-amber-300/50 via-yellow-400/25 to-amber-500/50 mix-blend-screen"
        siren
      />
      <FallField count={22} glyphs={COINS} durationMs={durationMs} sizeFrom={0.055} sizeTo={0.12} />
      <FallField count={20} glyphs={CONFETTI} durationMs={durationMs} sizeFrom={0.04} sizeTo={0.09} />
      {fireworks.map((f, i) => (
        <Wash key={i} durationMs={durationMs} delay={f.delay}>
          <BurstField count={8} glyphs={SPARKS} originX={f.x} originY={f.y} reach={0.26} size={0.07} stagger={0} durationMs={durationMs} />
        </Wash>
      ))}
      <div className="absolute inset-x-0 top-0 flex justify-center">
        <span
          className="select-none"
          style={{ fontSize: w(0.18), transformOrigin: 'top center', animation: `dhg-swing ${durationMs}ms ease-in-out both` }}
        >
          🪩
        </span>
      </div>
      <Hero glyph="🏆" durationMs={durationMs} />
      <Shockwave durationMs={durationMs} color="border-amber-200/80" rings={4} />
      <Glint durationMs={durationMs} delay={600} />
    </>
  );
});
Ultimate.displayName = 'Ultimate';

function TierEffect({ tier }: { tier: GiftTier }) {
  const d = tier.durationMs;
  switch (tier.key) {
    case 'ultimate':
      return <Ultimate durationMs={d} />;
    case 'gold10':
      return <GoldenScreen durationMs={d} long />;
    case 'gold3':
      return <GoldenScreen durationMs={d} />;
    case 'party':
      return <PartyScreen durationMs={d} />;
    case 'spartans':
      return <SpartanWall durationMs={d} />;
    case 'magicRing':
      return <RingFlight durationMs={d} />;
    case 'crown':
      return <CrownDrop durationMs={d} />;
    case 'bouquet':
      return <FlowerCross durationMs={d} />;
    case 'chocolate':
      return <ChocolateBox durationMs={d} />;
    case 'heart':
    default:
      return <HeartSweep durationMs={d} />;
  }
}

/** How many of the tier's own emoji climb the stage. */
const FLOAT_COUNT: Record<string, number> = {
  heart: 8,
  chocolate: 9,
  bouquet: 8,
  crown: 9,
  magicRing: 9,
  spartans: 10,
  party: 12,
  gold3: 12,
  gold10: 16,
  ultimate: 18,
};

const Celebration = memo(({ item }: { item: GiftCelebration }) => {
  const { t } = useTranslation();
  const { tier } = item;
  return (
    <div className="absolute inset-0 overflow-hidden">
      <TierEffect tier={tier} />
      <CornerFloat tier={tier} count={FLOAT_COUNT[tier.key] ?? 8} />
      {/* Who paid, and how much. The effect on its own reads as decoration. */}
      <div
        className="absolute inset-x-2 bottom-2"
        style={{ animation: `dhg-banner ${tier.durationMs}ms ease-out both` }}
      >
        <div className="rounded-xl border border-white/20 bg-black/65 px-3 py-2 backdrop-blur-sm">
          <p className="truncate text-xs font-semibold text-white">
            <span aria-hidden className="mr-1">{tier.emoji}</span>
            {t(tier.labelKey, tier.name)}
          </p>
          <p className="truncate text-[11px] text-white/75">
            {item.username ? `${item.username} · ` : ''}
            {item.amount.toLocaleString()} DHB
          </p>
          {item.message && <p className="mt-0.5 line-clamp-2 text-[11px] text-white/85">{item.message}</p>}
        </div>
      </div>
    </div>
  );
});
Celebration.displayName = 'Celebration';

/** Reduced motion: the same information, none of the movement. */
const ReducedCelebration = memo(({ item }: { item: GiftCelebration }) => {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-x-2 bottom-2 rounded-xl border border-white/20 bg-black/75 px-3 py-2">
      <p className="truncate text-xs font-semibold text-white">
        <span aria-hidden className="mr-1">{item.tier.emoji}</span>
        {t(item.tier.labelKey, item.tier.name)}
      </p>
      <p className="truncate text-[11px] text-white/75">
        {item.username ? `${item.username} · ` : ''}
        {item.amount.toLocaleString()} DHB
      </p>
    </div>
  );
});
ReducedCelebration.displayName = 'ReducedCelebration';

interface Props {
  items: GiftCelebration[];
  className?: string;
}

/**
 * The corner stage.
 *
 * Pinned bottom-right of whatever it is mounted in — which is the player, so in
 * fullscreen with chat open it lands over the chat column, and inline in the
 * feed it sits in the corner of the card. Sized as a share of the player rather
 * than fixed pixels, with a ceiling so it cannot swallow a big desktop stream
 * and a floor so it stays legible on a phone.
 */
export function GiftAnimationOverlay({ items, className }: Props) {
  const active = items.length > 0;
  useGiftKeyframes(active);
  const reduced = usePrefersReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const { w: sw, h: sh } = useStageSize(stageRef);

  // Newest on top of an older one still playing.
  const rendered = items.slice(-2);

  return (
    <div
      ref={stageRef}
      aria-hidden
      className={cn(
        'pointer-events-none absolute bottom-0 right-0 z-30 overflow-hidden',
        'w-[min(68%,340px)] h-[min(78%,440px)]',
        className,
      )}
      style={{ '--dhg-w': `${sw}px`, '--dhg-h': `${sh}px` } as CSSProperties}
    >
      {active &&
        rendered.map((item) =>
          reduced ? <ReducedCelebration key={item.id} item={item} /> : <Celebration key={item.id} item={item} />,
        )}
    </div>
  );
}

export default GiftAnimationOverlay;

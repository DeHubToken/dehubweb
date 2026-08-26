/**
 * The reply orb — a ball of cosmic dust turning on its own axis, sitting under
 * the suggestion cards.
 *
 * Monochrome by design: white motes over near-black, nothing hued, so it takes
 * whatever canvas the active theme paints instead of fighting it.
 *
 * GEOMETRY IS SHARED WITH MOBILE. dehub-mobile's components/DM/ReplyOrb.tsx is
 * the Reanimated twin of this file — same mote distribution, same durations,
 * same depth curve. Change one, change the other, or the two apps stop looking
 * like the same product.
 *
 * How the spin works without a single frame of JS: every mote sits at a fixed
 * latitude and rides one shared keyframe track (`dust-spin`) that sweeps it
 * around its latitude ring. What makes each mote different is the radius of
 * that ring, passed as the `--dust-r` custom property, and a *negative*
 * animation-delay that drops it into the track at its own starting angle. So
 * thirty motes cost thirty composited transforms and no main-thread work.
 */

import type { CSSProperties } from 'react';

/** Enough to read as dust at 44px; every one is an animated element. */
const MOTES = 30;

/**
 * Golden-angle fraction (137.5°/360°). Spacing the starting angles by this
 * scatters the motes instead of banding them into visible stripes, which is
 * what any simple i/N spacing does.
 */
const GOLDEN_FRACTION = 0.381966;

/** ms — mirrored in the mobile port. */
const DURATION = {
  idle: { spin: 9000, haze: 3000 },
  thinking: { spin: 2600, haze: 1200 },
} as const;

/** Sphere radius and mote size as fractions of the box. */
const RATIO = { sphere: 0.42, mote: 0.05, haze: 0.62 } as const;

/** The ball leans, so the spin axis reads as 3D rather than a spinning disc. */
const TILT_DEG = -14;

export type ReplyOrbState = 'idle' | 'thinking';

interface ReplyOrbProps {
  state?: ReplyOrbState;
  /** Box size in px. Everything is derived from this. */
  size?: number;
  className?: string;
}

/**
 * Fixed mote layout. `y` is uniform in [-1, 1] rather than an even sweep of
 * latitude angles — even latitudes crowd the poles, uniform y spreads points
 * evenly over the actual surface.
 */
const LAYOUT = Array.from({ length: MOTES }, (_, i) => {
  const t = (i + 0.5) / MOTES;
  const y = 1 - 2 * t;
  return {
    y,
    ringRadius: Math.sqrt(Math.max(0, 1 - y * y)),
    phase: (i * GOLDEN_FRACTION) % 1,
    // A few brighter, larger grains stop the field reading as uniform noise.
    bright: i % 7 === 3,
  };
});

export function ReplyOrb({ state = 'idle', size = 44, className = '' }: ReplyOrbProps) {
  const d = DURATION[state];
  const busy = state === 'thinking';
  const R = size * RATIO.sphere;
  const moteBase = Math.max(1.5, size * RATIO.mote);

  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size, transform: `rotate(${TILT_DEG}deg)` }}
      aria-hidden="true"
    >
      {/* Faint core haze — without it the motes read as a ring of dots rather
          than a body with volume. */}
      <span
        className="animate-[dust-haze_2s_ease-in-out_infinite] motion-reduce:animate-none"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: size * RATIO.haze,
          height: size * RATIO.haze,
          marginLeft: -(size * RATIO.haze) / 2,
          marginTop: -(size * RATIO.haze) / 2,
          borderRadius: '9999px',
          background: busy
            ? 'radial-gradient(circle, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 70%)'
            : 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)',
          animationDuration: `${d.haze}ms`,
        }}
      />

      {LAYOUT.map((m, i) => {
        const dot = m.bright ? moteBase * 1.45 : moteBase;

        // Resting pose: where this mote sits at phase 0 of its own track. A
        // running animation overrides inline styles for the properties it
        // touches, so this only shows through before the animation starts and
        // under prefers-reduced-motion — where the alternative is every mote
        // frozen at translateX(0), i.e. the ball collapsed into a column.
        const angle = m.phase * Math.PI * 2;
        const depth = (Math.cos(angle) + 1) / 2;

        const style: CSSProperties = {
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: dot,
          height: dot,
          // Latitude is fixed; only the ring sweep is animated.
          marginLeft: -dot / 2,
          marginTop: -dot / 2 + m.y * R,
          background: m.bright
            ? 'rgba(255,255,255,0.95)'
            : busy
            ? 'rgba(255,255,255,0.8)'
            : 'rgba(255,255,255,0.68)',
          transform: `translateX(${(m.ringRadius * R * Math.sin(angle)).toFixed(2)}px) scale(${(0.55 + 0.45 * depth).toFixed(3)})`,
          opacity: 0.2 + 0.8 * depth,
          animationDuration: `${d.spin}ms`,
          // Negative delay = start already that far into the loop, which is
          // this mote's angle around its ring.
          animationDelay: `-${Math.round(m.phase * d.spin)}ms`,
        };
        // Custom properties aren't part of CSSProperties, so the ring radius
        // the keyframe reads has to be attached with a cast.
        const withRadius = {
          ...style,
          '--dust-r': `${(m.ringRadius * R).toFixed(2)}px`,
        } as CSSProperties;

        return (
          <span
            key={i}
            className="animate-[dust-spin_2s_linear_infinite] motion-reduce:animate-none"
            style={withRadius}
          />
        );
      })}
    </span>
  );
}

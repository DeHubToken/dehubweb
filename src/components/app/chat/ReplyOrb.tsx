/**
 * The reply orb — the AI affordance that sits under the suggestion cards.
 *
 * Deliberately monochrome: a white core over stacked white-alpha haloes on the
 * near-black composer. No hue anywhere, so it inherits whatever canvas the
 * active theme paints instead of fighting it.
 *
 * GEOMETRY IS SHARED WITH MOBILE. dehub-mobile's components/DM/ReplyOrb.tsx is
 * a Reanimated port of this exact spec — same ratios, same durations, same
 * scale endpoints. Change one, change the other, or the two apps stop looking
 * like the same product. The ratios below are fractions of the box size so
 * both platforms can take a single `size` and derive everything.
 *
 * Everything animates transform and opacity only. On web that keeps all four
 * layers on the compositor; on mobile the same restriction is what lets the
 * port run on the UI thread.
 */

import type { CSSProperties } from 'react';

const RATIO = {
  halo3: 1,       // outermost wash
  halo2: 0.77,
  halo1: 0.59,
  sonar: 0.5,     // ring that expands away
  core: 0.41,
  dot: 0.068,     // orbiting speck
  orbit: 0.34,    // orbit radius
} as const;

/** ms — mirrored in the mobile port. */
const DURATION = {
  idle: { breathe: 2600, sonar: 3400, orbit: 6000 },
  thinking: { breathe: 900, sonar: 1600, orbit: 1400 },
} as const;

export type ReplyOrbState = 'idle' | 'thinking';

interface ReplyOrbProps {
  state?: ReplyOrbState;
  /** Box size in px. Every layer is derived from this. */
  size?: number;
  className?: string;
}

export function ReplyOrb({ state = 'idle', size = 44, className = '' }: ReplyOrbProps) {
  const d = DURATION[state];
  const px = (r: number) => `${Math.round(size * r)}px`;
  const busy = state === 'thinking';
  // At the 22px toolbar size the ratio rounds the speck down to 1px, which
  // renders as a smudge on a 3x screen. Two is the smallest it reads at.
  const dot = Math.max(2, Math.round(size * RATIO.dot));

  /** Absolutely-centred layer of a given diameter. */
  const layer = (ratio: number): CSSProperties => ({
    position: 'absolute',
    width: px(ratio),
    height: px(ratio),
    left: '50%',
    top: '50%',
    marginLeft: `-${Math.round(size * ratio) / 2}px`,
    marginTop: `-${Math.round(size * ratio) / 2}px`,
    borderRadius: '9999px',
  });

  return (
    <span
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Three stacked washes instead of a blur: a real filter would cost a
          separate compositor layer per frame on web and has no cheap mobile
          equivalent, and at this size the banding is invisible. */}
      <span style={{ ...layer(RATIO.halo3), background: 'rgba(255,255,255,0.05)' }} />
      <span style={{ ...layer(RATIO.halo2), background: 'rgba(255,255,255,0.08)' }} />
      <span style={{ ...layer(RATIO.halo1), background: 'rgba(255,255,255,0.14)' }} />

      {/* Two sonar rings half a period apart, so one is always mid-flight.
          The duration in the class is a placeholder — the real one is set
          inline per state. It has to be a literal here rather than a CSS var:
          Tailwind only emits an @keyframes block when it can parse the
          animation name out of the utility, and it does that at build time
          from the class string alone. */}
      <span
        className="animate-[orb-sonar_2s_ease-out_infinite] motion-reduce:animate-none motion-reduce:opacity-0"
        style={{
          ...layer(RATIO.sonar),
          border: '1px solid rgba(255,255,255,0.5)',
          animationDuration: `${d.sonar}ms`,
        }}
      />
      <span
        className="animate-[orb-sonar_2s_ease-out_infinite] motion-reduce:animate-none motion-reduce:opacity-0"
        style={{
          ...layer(RATIO.sonar),
          border: '1px solid rgba(255,255,255,0.5)',
          animationDuration: `${d.sonar}ms`,
          // Negative delay starts this ring mid-flight, so one is always
          // expanding rather than both firing together.
          animationDelay: `-${Math.round(d.sonar / 2)}ms`,
        }}
      />

      {/* Orbiting speck: a full-box rotator with the dot pinned at its top
          edge, so one rotate transform does all the work. */}
      <span
        className="animate-[orb-orbit_2s_linear_infinite] motion-reduce:animate-none"
        style={{ ...layer(RATIO.orbit * 2), animationDuration: `${d.orbit}ms` }}
      >
        <span
          style={{
            position: 'absolute',
            width: `${dot}px`,
            height: `${dot}px`,
            left: '50%',
            top: 0,
            marginLeft: `-${dot / 2}px`,
            marginTop: `-${dot / 2}px`,
            borderRadius: '9999px',
            background: busy ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)',
          }}
        />
      </span>

      <span
        className="animate-[orb-breathe_2s_ease-in-out_infinite] motion-reduce:animate-none"
        style={{
          ...layer(RATIO.core),
          background: busy ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.88)',
          boxShadow: busy
            ? '0 0 14px rgba(255,255,255,0.45)'
            : '0 0 8px rgba(255,255,255,0.22)',
          animationDuration: `${d.breathe}ms`,
        }}
      />
    </span>
  );
}

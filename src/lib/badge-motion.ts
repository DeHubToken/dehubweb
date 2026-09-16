/**
 * Badge ascension — the motion contract
 * =====================================
 * One record per tier, describing how that tier's promotion should feel. The
 * web overlay (`components/app/BadgeAscension.tsx`) and the mobile one read the
 * same numbers, so a tier tuned on one client is tuned on the other.
 *
 * Nothing here is artwork. The ceremony animates the live badge asset out of
 * `staking-badges`, which is the point: re-export a badge and the ceremony
 * follows it. Pre-rendered clips would have to be re-cut, would carry an opaque
 * background over a live profile, and could never fly out of the username.
 *
 * Intensity is derived from rank rather than written per tier — thirteen
 * hand-tuned rows drift apart the moment the ladder changes length.
 *
 * @module lib/badge-motion
 */
import { BADGE_ORDER, badgeImage, canonicalTierName } from '@/lib/staking-badges';

/** Beat boundaries as a fraction of a ceremony's runtime. */
export const BEATS = {
  lift: [0, 0.13],
  charge: [0.13, 0.25],
  shatter: [0.25, 0.37],
  converge: [0.37, 0.6],
  form: [0.6, 0.7],
  wave: [0.7, 0.8],
  name: [0.8, 0.92],
  ret: [0.92, 1],
} as const;

export interface BadgeMotion {
  /** 1-based position on the ladder. */
  rank: number;
  tier: string;
  /** The badge artwork, already resolved to a bundled URL. */
  asset: string | null;
  /** 0 at Crab, 1 at Megalodon. Everything below scales off this. */
  intensity: number;
  /** Wedges the outgoing badge breaks into. */
  shards: number;
  /** Motes that converge to form the new one. */
  motes: number;
  /** Expanding rings on the form beat — how a whale outranks a crab. */
  shockwaves: number;
  /** Total runtime. */
  durationMs: number;
  /** i18n key for the line shown above the tier name. */
  lineKey: string;
  /**
   * How far the room goes dark. The lower half of the ladder is climbed often
   * and should not stop what the holder was doing; the top of it is earned
   * once, so it gets the full show. Every effect is white on black — no colour
   * is introduced anywhere, which is what keeps a firework reading as
   * cinematic rather than as a party popper.
   */
  fx: {
    /** Vignette closes in and the profile behind sinks further back. */
    vignette: boolean;
    /** Anamorphic flare across the badge as it forms. */
    streak: boolean;
    /** Slow searchlights sweeping out of the centre. */
    beams: boolean;
    /** One frame of white on the form beat. */
    flash: boolean;
    /** Monochrome bursts with real gravity. 0 for none. */
    fireworks: number;
    /** Sparks still drifting as the badge flies home. */
    embers: boolean;
    /** Slow push-in through the name beat. */
    push: boolean;
  };
}

const LAST = BADGE_ORDER.length - 1;

/**
 * i18n keys are written out rather than derived from the tier name, so a
 * rename on the ladder is a compile error here instead of 110 locale files
 * quietly falling back to English.
 */
const LINE_KEYS: Record<string, string> = {
  Crab: 'badgeAscension.lines.crab',
  Lobster: 'badgeAscension.lines.lobster',
  Piranha: 'badgeAscension.lines.piranha',
  Tortoise: 'badgeAscension.lines.tortoise',
  Cobra: 'badgeAscension.lines.cobra',
  Octopus: 'badgeAscension.lines.octopus',
  Crocodile: 'badgeAscension.lines.crocodile',
  Dolphin: 'badgeAscension.lines.dolphin',
  'Tiger Shark': 'badgeAscension.lines.tigerShark',
  'Great White Shark': 'badgeAscension.lines.greatWhiteShark',
  'Killer Whale': 'badgeAscension.lines.killerWhale',
  'Blue Whale': 'badgeAscension.lines.blueWhale',
  Megalodon: 'badgeAscension.lines.megalodon',
};

/** The motion record for a tier, or null if the name is not on the ladder. */
export function badgeMotion(tier: string | null | undefined): BadgeMotion | null {
  const name = canonicalTierName(tier);
  if (!name) return null;
  const i = BADGE_ORDER.indexOf(name);
  if (i < 0) return null;

  const intensity = LAST > 0 ? i / LAST : 0;
  return {
    rank: i + 1,
    tier: name,
    asset: badgeImage(name),
    intensity,
    shards: 10 + Math.round(intensity * 12),
    motes: Math.round(60 + intensity * 190),
    shockwaves: i >= 10 ? 3 : i >= 8 ? 2 : 1,
    durationMs: Math.round(3400 + intensity * 1800),
    lineKey: LINE_KEYS[name] ?? 'badgeAscension.lines.crab',
    fx: {
      vignette: i >= 6,
      streak: i >= 6,
      beams: i >= 8,
      flash: i >= 10,
      fireworks: i >= 12 ? 7 : i >= 10 ? 4 : 0,
      embers: i >= 11,
      push: i >= 12,
    },
  };
}

/** True when `to` sits strictly above `from` on the ladder. */
export function isPromotion(from: string | null | undefined, to: string | null | undefined): boolean {
  const a = canonicalTierName(from);
  const b = canonicalTierName(to);
  if (!b) return false;
  const bi = BADGE_ORDER.indexOf(b);
  if (bi < 0) return false;
  // No badge at all, then a badge, is the entry promotion.
  if (!a) return true;
  const ai = BADGE_ORDER.indexOf(a);
  return ai >= 0 && bi > ai;
}

/**
 * The threshold as a short label — `10k`, `1m`, `50m`. The ceremony shows the
 * requirement next to the coin, where the full digit string is noise; the
 * holder's actual balance is printed in full underneath it.
 */
export function shortDhb(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${Number.isInteger(m) ? m : Number(m.toFixed(1))}m`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `${Number.isInteger(k) ? k : Number(k.toFixed(1))}k`;
  }
  return String(Math.round(value));
}

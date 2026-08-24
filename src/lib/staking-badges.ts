/**
 * Staking badges — a ladder priced in dollars, held in DHB
 * ========================================================
 * Thirteen tiers, from Crab to Meglodon, drawn next to a name from
 * `Account.badgeBalance` (DHB held plus DHB staked, on BSC and Base).
 *
 * The thresholds were written as flat DHB amounts against a $0.001 token, so
 * Meglodon meant 50,000,000 DHB and, at that price, $50,000. Flat amounts do
 * not survive the token appreciating: at $0.01 the same 50,000,000 DHB is
 * half a million dollars, and the top tier quietly stops being reachable by
 * anyone who was not already there. The ladder is meant to sort holders, not
 * to become a closed club because the chart moved.
 *
 * So the ladder is pegged in **dollars**, not in DHB. `BADGE_LEVELS` stays as
 * the reference — the numbers as written, at the anchor price — and the DHB
 * requirement at any other price is that reference scaled by
 * `BADGE_PRICE_ANCHOR / price`. Meglodon costs about $50,000 whatever DHB is
 * worth; what changes is how many tokens that is.
 *
 * Two deliberate limits on that:
 *
 * - **The scale is capped at 1.** A price *below* the anchor does not raise
 *   the requirement above the numbers written here. Demanding more tokens
 *   during a drawdown would strip badges at the worst possible moment and
 *   leave new holders facing a steeper ladder than the people already on it.
 *   Today's numbers are the ceiling; the peg only ever makes them cheaper.
 *   (`MAX_BADGE_SCALE` is the one constant to change if that call is revised.)
 * - **The scale is rounded to two significant figures** and floored at
 *   `MIN_BADGE_SCALE`. Thresholds that chase every tick would renumber the
 *   ladder constantly, and a lock (below) taken on a one-second wick would be
 *   permanent. Coarse steps make the ladder something you can quote.
 *
 * **A tier, once earned, is not taken back by the price.** `BadgeLock` records
 * what a holder actually had to hold when they reached their highest tier, and
 * they keep that tier for as long as their balance stays at or above that
 * number — even if the price falls and the live requirement climbs past them.
 * Only selling below what they originally needed drops them. The lock is
 * written by the API (it is the only side that can see a holder's history);
 * everything here just applies it, and works without one.
 *
 * Everything downstream — post quotas, profile slots, editor storage, the
 * gateway's holder discount — resolves through `getBadgeName`, so the peg and
 * the lock reach all of them without any of those tables learning about price.
 *
 * @module lib/staking-badges
 */

// Badge tier definitions (ascending by min stake requirement)
interface BadgeDef {
  name: string;
  min: number;
}

/**
 * The reference ladder: the DHB required at `BADGE_PRICE_ANCHOR`.
 *
 * Do not read these as live requirements — `badgeThresholds()` is the live
 * ladder. These are the numbers the dollar targets are derived from.
 */
const BADGE_LEVELS: BadgeDef[] = [
  { name: "Crab", min: 10000 },
  { name: "Lobster", min: 25000 },
  { name: "Piranha", min: 50000 },
  { name: "Tortoise", min: 100000 },
  { name: "Cobra", min: 250000 },
  { name: "Octopus", min: 500000 },
  { name: "Crocodite", min: 1000000 },
  { name: "Dolphin", min: 2000000 },
  { name: "Tiger Shark", min: 3000000 },
  { name: "Killer Whale", min: 5000000 },
  { name: "Great White Shark", min: 10000000 },
  { name: "Blue Whale", min: 25000000 },
  { name: "Meglodon", min: 50000000 },
];

/**
 * The DHB price, in USD, that `BADGE_LEVELS` was written against.
 *
 * This is also the price the token is currently pinned to (the `get-dhb-price`
 * function returns it while trading is paused), so the live ladder is
 * identical to the reference ladder until that peg lifts.
 */
export const BADGE_PRICE_ANCHOR = 0.001;

/**
 * Ceiling on the scale: the ladder is never harder than `BADGE_LEVELS`.
 * See the module note — set this above 1 to let a sub-anchor price raise
 * requirements instead.
 */
export const MAX_BADGE_SCALE = 1;

/**
 * Floor on the scale, at a $1 token: Crab 10 DHB, Meglodon 50,000 DHB. Past
 * this the ladder stops meaning anything in whole tokens.
 */
export const MIN_BADGE_SCALE = 0.001;

/**
 * Tier names, lowest first.
 */
export const BADGE_ORDER: string[] = BADGE_LEVELS.map((b) => b.name);

/** What each tier costs, in USD. The invariant the peg preserves. */
export const BADGE_USD_TARGETS: Record<string, number> = Object.fromEntries(
  BADGE_LEVELS.map((b) => [b.name, b.min * BADGE_PRICE_ANCHOR]),
);

/** Username-based badge overrides (always get this badge regardless of balance) */
const USERNAME_BADGE_OVERRIDES: Record<string, string> = {
  "maldoteth": "Meglodon",
  "mal": "Meglodon",
  "aaron": "Meglodon",
};

// Import all badge images
import TortoiseBadge from '@/assets/badges/Tortoise.webp';
import CrabBadge from '@/assets/badges/Crab.webp';
import PiranhaBadge from '@/assets/badges/Piranha.webp';
import LobsterBadge from '@/assets/badges/Lobster.webp';
import OctopusBadge from '@/assets/badges/Octopus.webp';
import CobraBadge from '@/assets/badges/Cobra.webp';
import CrocoditeBadge from '@/assets/badges/Crocodite.webp';
import DolphinBadge from '@/assets/badges/Dolphin.webp';
import TigerSharkBadge from '@/assets/badges/Tiger Shark.webp';
import GreatWhiteSharkBadge from '@/assets/badges/Great White Shark.webp';
import KillerWhaleBadge from '@/assets/badges/Killer Whale.webp';
import BlueWhaleBadge from '@/assets/badges/Blue Whale.webp';
import MeglodonBadge from '@/assets/badges/Meglodon.webp';

const BADGE_IMAGES: Record<string, string> = {
  "Tortoise": TortoiseBadge,
  "Crab": CrabBadge,
  "Piranha": PiranhaBadge,
  "Lobster": LobsterBadge,
  "Octopus": OctopusBadge,
  "Cobra": CobraBadge,
  "Crocodite": CrocoditeBadge,
  "Dolphin": DolphinBadge,
  "Tiger Shark": TigerSharkBadge,
  "Great White Shark": GreatWhiteSharkBadge,
  "Killer Whale": KillerWhaleBadge,
  "Blue Whale": BlueWhaleBadge,
  "Meglodon": MeglodonBadge,
};

/**
 * Round to `digits` significant figures.
 *
 * Via `toPrecision` rather than multiply-round-divide: the arithmetic version
 * returns 50000000.00000001 for fifty million, which is enough to put a holder
 * with exactly the advertised balance one rung below the tier they were told
 * they had bought.
 */
function significant(value: number, digits: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  return Number(value.toPrecision(digits));
}

/**
 * The ladder scale a DHB price implies.
 *
 * Rounded to two significant figures so the ladder steps rather than drifts,
 * and clamped to [`MIN_BADGE_SCALE`, `MAX_BADGE_SCALE`]. An unreadable price
 * — missing, zero, NaN — returns 1, which is the reference ladder: a badge
 * should never move because a price lookup failed.
 */
export function badgeScaleForPrice(price: number | string | null | undefined): number {
  const numeric = typeof price === 'string' ? Number.parseFloat(price) : price;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric) || numeric <= 0) {
    return MAX_BADGE_SCALE;
  }
  const raw = significant(BADGE_PRICE_ANCHOR / numeric, 2);
  return Math.min(MAX_BADGE_SCALE, Math.max(MIN_BADGE_SCALE, raw));
}

/**
 * The scale every non-React caller resolves against.
 *
 * Post quotas, profile allowances and editor storage all call `getBadgeName`
 * from plain functions with no hook in sight, so the scale has to be readable
 * without one. `<SelfBadgeSync/>` sets it from the price query; until it does,
 * this is the reference ladder.
 */
let activeScale: number = MAX_BADGE_SCALE;

/** The scale in force right now. */
export function activeBadgeScale(): number {
  return activeScale;
}

/** Set the scale used when a caller does not pass one. Returns the clamped value. */
export function setActiveBadgeScale(scale: number): number {
  const clamped = Math.min(MAX_BADGE_SCALE, Math.max(MIN_BADGE_SCALE, scale));
  activeScale = Number.isFinite(clamped) ? clamped : MAX_BADGE_SCALE;
  return activeScale;
}

/**
 * Scaled ladders, cached by scale. There are only ever a handful of distinct
 * scales in a session, and every badge on a busy feed asks for one.
 */
const ladderCache = new Map<number, readonly BadgeDef[]>();

/**
 * The live ladder: what each tier costs in DHB at `scale`.
 *
 * Thresholds are rounded to three significant figures so they read as prices
 * rather than as arithmetic, then forced strictly ascending — rounding two
 * adjacent tiers cannot collapse them at any scale the clamp allows, but a
 * ladder that is not strictly ascending would silently hand a lower tier the
 * higher one's benefits, so it is enforced rather than assumed.
 */
export function badgeThresholds(scale: number = activeScale): readonly BadgeDef[] {
  const key = Number.isFinite(scale) ? scale : MAX_BADGE_SCALE;
  const cached = ladderCache.get(key);
  if (cached) return cached;

  let previous = 0;
  const ladder = BADGE_LEVELS.map((level) => {
    const min = Math.max(1, previous + 1, significant(level.min * key, 3));
    previous = min;
    return { name: level.name, min };
  });

  // Bounded: a runaway price feed must not grow this without limit.
  if (ladderCache.size > 32) ladderCache.clear();
  ladderCache.set(key, ladder);
  return ladder;
}

/** DHB needed for `tier` at `scale`, or null for an unknown tier name. */
export function badgeThreshold(tier: string | null | undefined, scale: number = activeScale): number | null {
  if (!tier) return null;
  return badgeThresholds(scale).find((b) => b.name === tier)?.min ?? null;
}

/** The entry requirement — below this there is no badge at all. */
export function minBadgeThreshold(scale: number = activeScale): number {
  return badgeThresholds(scale)[0].min;
}

/**
 * A tier a holder has already earned, and what it cost them to earn it.
 *
 * Written by the API when a balance is refreshed: `tier` only ever moves up,
 * `requirement` only ever moves down (re-qualifying at a cheaper ladder
 * improves the lock). Holding `requirement` keeps `tier` regardless of what
 * the live ladder says.
 */
export interface BadgeLock {
  /** Tier name, matching `BADGE_ORDER`. */
  tier: string;
  /** DHB the holder had to hold to reach it. */
  requirement: number;
}

/** Everything other than the balance that can decide which badge is drawn. */
export interface BadgeContext {
  /** Username, for the override table. */
  username?: string | null;
  /** Ladder scale. Defaults to the active one. */
  scale?: number;
  /** The holder's grandfathered tier, when the payload carries one. */
  lock?: BadgeLock | null;
}

/** Position in the ladder, -1 for "no badge". */
function tierIndex(name: string | null | undefined): number {
  return name ? BADGE_ORDER.indexOf(name) : -1;
}

/** Normalise whatever a payload calls a balance into a number. */
function toAmount(badgeBalance: number | string | undefined | null): number | null {
  if (badgeBalance === undefined || badgeBalance === null) return null;
  const amount = typeof badgeBalance === "string" ? parseFloat(badgeBalance) : badgeBalance;
  return Number.isFinite(amount) ? amount : null;
}

/** The tier a balance earns outright on the ladder at `scale`. */
function earnedTier(amount: number, scale: number): string | null {
  let current: string | null = null;
  for (const b of badgeThresholds(scale)) {
    if (amount >= b.min) current = b.name;
    else break;
  }
  return current;
}

/**
 * Read a lock out of an API payload.
 *
 * Anything malformed resolves to null rather than throwing: a bad lock should
 * cost someone their grandfathering, not the page.
 */
export function parseBadgeLock(raw: unknown): BadgeLock | null {
  if (!raw || typeof raw !== 'object') return null;
  const { tier, requirement } = raw as { tier?: unknown; requirement?: unknown };
  if (typeof tier !== 'string' || tierIndex(tier) < 0) return null;
  const amount = typeof requirement === 'string' ? parseFloat(requirement) : requirement;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
  return { tier, requirement: amount };
}

/**
 * Advance a lock for a balance seen at `scale`.
 *
 * Returns the lock that should be stored: the highest tier ever reached, at
 * the cheapest requirement it was ever reached for. Returns `previous`
 * unchanged when nothing improves, so a caller can compare by identity to
 * decide whether a write is needed.
 *
 * Exported for the API to share rather than reimplement — a lock computed two
 * different ways is a lock nobody can reason about.
 */
export function ratchetBadgeLock(
  previous: BadgeLock | null | undefined,
  badgeBalance: number | string | undefined | null,
  scale: number = activeScale,
): BadgeLock | null {
  const amount = toAmount(badgeBalance);
  const prior = parseBadgeLock(previous) ?? null;
  if (amount === null) return prior;

  const earned = earnedTier(amount, scale);
  if (!earned) return prior;

  const requirement = badgeThreshold(earned, scale);
  if (requirement === null) return prior;

  if (!prior) return { tier: earned, requirement };

  // A higher tier replaces the lock outright — its requirement is the one that
  // now matters, and it is by construction dearer than the tier below it.
  if (tierIndex(earned) > tierIndex(prior.tier)) return { tier: earned, requirement };

  // Same tier reached more cheaply than before: keep the cheaper number.
  if (tierIndex(earned) === tierIndex(prior.tier) && requirement < prior.requirement) {
    return { tier: earned, requirement };
  }

  return prior;
}

/**
 * Get badge name based on badge balance (holdings + staked)
 *
 * `username` checks the override table first. `context` supplies the ladder
 * scale and the holder's lock; both default to "whatever is in force", so
 * existing two-argument callers keep working unchanged.
 */
export function getBadgeName(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
  context?: BadgeContext,
): string | null {
  const name = username ?? context?.username;

  // Check username overrides first
  if (name) {
    const clean = name.replace('@', '').toLowerCase();
    const override = USERNAME_BADGE_OVERRIDES[clean];
    if (override) return override;
  }

  const amount = toAmount(badgeBalance);
  if (amount === null) return null;

  const scale = context?.scale ?? activeScale;
  const earned = earnedTier(amount, scale);

  // A tier already earned is not taken back by the ladder moving under it —
  // only by the holder falling below what it cost them.
  const lock = parseBadgeLock(context?.lock);
  const locked = lock && amount >= lock.requirement ? lock.tier : null;

  return tierIndex(locked) > tierIndex(earned) ? locked : earned;
}

/**
 * Get badge image URL based on badge balance (holdings + staked)
 */
export function getBadgeUrl(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
  context?: BadgeContext,
): string | null {
  const badge = getBadgeName(badgeBalance, username, context);
  if (!badge) return null;
  return BADGE_IMAGES[badge] || null;
}

/** The badge art for a tier name, for surfaces that already know the tier. */
export function badgeImage(tier: string | null | undefined): string | null {
  return tier ? BADGE_IMAGES[tier] ?? null : null;
}

/**
 * Get badge tier info (name, min, and image)
 */
export function getBadgeInfo(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
  context?: BadgeContext,
): {
  name: string | null;
  imageUrl: string | null;
  minStake: number;
} {
  const scale = context?.scale ?? activeScale;
  const name = getBadgeName(badgeBalance, username, context);
  if (!name) return { name: null, imageUrl: null, minStake: minBadgeThreshold(scale) };
  return {
    name,
    imageUrl: BADGE_IMAGES[name] || null,
    minStake: badgeThreshold(name, scale) ?? minBadgeThreshold(scale),
  };
}

/**
 * Where a holder sits on the ladder: what they hold, what they have, and what
 * the next rung costs. The progress bar's whole data model.
 */
export interface BadgeStanding {
  /** Current tier, or null below the entry rung. */
  tier: string | null;
  /** Art for `tier`. */
  imageUrl: string | null;
  /** Index in `BADGE_ORDER`, -1 when there is no badge yet. */
  index: number;
  /** DHB counted toward the ladder. */
  balance: number;
  /** DHB the current tier costs today, or the entry rung when there is none. */
  currentThreshold: number;
  /** The next tier up, or null at Meglodon. */
  nextTier: string | null;
  /** DHB the next tier costs, or null at Meglodon. */
  nextThreshold: number | null;
  /** DHB still to buy for the next tier, 0 at the top. */
  remaining: number;
  /** Progress toward the next tier, 0–1. 1 at the top. */
  progress: number;
  /** True when the tier is held on a lock rather than on the live ladder. */
  grandfathered: boolean;
  /** The ladder scale this was resolved against. */
  scale: number;
}

/**
 * Resolve a holder's full standing.
 *
 * `progress` runs from the current rung to the next, not from zero, so the bar
 * fills across a tier rather than crawling across the whole ladder. Below the
 * entry rung it runs from zero to Crab.
 */
export function getBadgeStanding(
  badgeBalance: number | string | undefined | null,
  context?: BadgeContext,
): BadgeStanding {
  const scale = context?.scale ?? activeScale;
  const ladder = badgeThresholds(scale);
  const balance = Math.max(0, toAmount(badgeBalance) ?? 0);
  const tier = getBadgeName(badgeBalance, context?.username, context);
  const index = tierIndex(tier);

  const currentThreshold = index >= 0 ? ladder[index].min : ladder[0].min;
  const next = index + 1 < ladder.length ? ladder[index + 1] : null;

  const floor = index >= 0 ? currentThreshold : 0;
  const span = next ? next.min - floor : 0;
  const progress = next ? Math.min(1, Math.max(0, (balance - floor) / (span || 1))) : 1;

  const earned = tierIndex(earnedTier(balance, scale));

  return {
    tier,
    imageUrl: tier ? BADGE_IMAGES[tier] ?? null : null,
    index,
    balance,
    currentThreshold,
    nextTier: next?.name ?? null,
    nextThreshold: next?.min ?? null,
    remaining: next ? Math.max(0, next.min - balance) : 0,
    progress,
    grandfathered: index >= 0 && index > earned,
    scale,
  };
}

/**
 * Returns true if the badge is a shark or whale tier (excluding Megalodon) — rendered 10% larger.
 */
const BIG_BADGE_NAMES = new Set(["Tiger Shark", "Killer Whale", "Great White Shark", "Blue Whale"]);

export function isBigBadge(
  badgeBalance: number | string | undefined | null,
  username?: string | null,
  context?: BadgeContext,
): boolean {
  const name = getBadgeName(badgeBalance, username, context);
  return name ? BIG_BADGE_NAMES.has(name) : false;
}

/** Check if a badge URL corresponds to a "big badge" tier */
const BIG_BADGE_URLS = new Set(
  Array.from(BIG_BADGE_NAMES).map(n => BADGE_IMAGES[n]).filter(Boolean)
);
export function isBigBadgeUrl(url: string | null): boolean {
  return url ? BIG_BADGE_URLS.has(url) : false;
}

/**
 * Export badge levels for reference (e.g., tooltip showing all tiers)
 *
 * These are the anchor-price numbers. Anything showing a requirement to a user
 * wants `badgeThresholds()` instead.
 */
export { BADGE_LEVELS };

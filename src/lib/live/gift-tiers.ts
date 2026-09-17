/**
 * Live stream gift tiers
 * ======================
 * The ladder a gift amount lands on, and the celebration it buys.
 *
 * This is the web half of a contract the mobile app already shipped: its
 * GiftModal writes the tier's NAME into the gift record as `selectedTier`, and
 * its viewer reads that name back off the `streamer.tip` socket broadcast to
 * decide what to play. Web sent no tier at all, so a gift from a browser
 * played the bottom tier on every phone watching — and browsers played
 * nothing, because web had no picker and no overlay.
 *
 * So the names below are not free text. They are the strings mobile matches
 * on, and changing one silently downgrades every cross-platform gift to a
 * Love Heart. Display names go through i18n; `name` stays English on the wire.
 */

export type GiftTierKey =
  | 'heart'
  | 'chocolate'
  | 'bouquet'
  | 'crown'
  | 'magicRing'
  | 'spartans'
  | 'party'
  | 'gold3'
  | 'gold10'
  | 'ultimate';

export interface GiftTier {
  key: GiftTierKey;
  /** Lowest DHB amount that buys this tier. */
  min: number;
  /** The wire name. Matched by mobile — do not translate this one. */
  name: string;
  /** i18n key for the label a viewer reads. */
  labelKey: string;
  /** i18n key for the one-line description under the picker. */
  descKey: string;
  descFallback: string;
  /** The character that floats up the bottom-right corner. */
  emoji: string;
  /** How long the celebration holds the screen. */
  durationMs: number;
  /** Tailwind text colour for the picker tile's icon. */
  accent: string;
}

/** Richest first, so `tierFromAmount` can take the first match. */
export const GIFT_TIERS: readonly GiftTier[] = [
  {
    key: 'ultimate',
    min: 1_000_000,
    name: 'Ultimate Celebration',
    labelKey: 'liveGift.tier.ultimate',
    descKey: 'liveGift.tierDesc.ultimate',
    descFallback: 'Every celebration at once — gold, confetti, coins and a trophy.',
    emoji: '🏆',
    durationMs: 12000,
    accent: 'text-indigo-400',
  },
  {
    key: 'gold10',
    min: 750_000,
    name: 'Golden Screen (10s)',
    labelKey: 'liveGift.tier.gold10',
    descKey: 'liveGift.tierDesc.gold10',
    descFallback: 'The screen turns gold and coins rain down for 10 seconds.',
    emoji: '🪙',
    durationMs: 10000,
    accent: 'text-yellow-400',
  },
  {
    key: 'gold3',
    min: 500_000,
    name: 'Golden Screen (3s)',
    labelKey: 'liveGift.tier.gold3',
    descKey: 'liveGift.tierDesc.gold3',
    descFallback: 'The screen turns gold and coins rain down for 3 seconds.',
    emoji: '🪙',
    durationMs: 3600,
    accent: 'text-amber-400',
  },
  {
    key: 'party',
    min: 300_000,
    name: 'Party Celebration',
    labelKey: 'liveGift.tier.party',
    descKey: 'liveGift.tierDesc.party',
    descFallback: 'Confetti flies and a disco ball drops in.',
    emoji: '🎉',
    durationMs: 5000,
    accent: 'text-pink-400',
  },
  {
    key: 'spartans',
    min: 200_000,
    name: 'Spartans Army',
    labelKey: 'liveGift.tier.spartans',
    descKey: 'liveGift.tierDesc.spartans',
    descFallback: 'A shield wall marches across the stream.',
    emoji: '🛡️',
    durationMs: 4500,
    accent: 'text-zinc-200',
  },
  {
    key: 'magicRing',
    min: 100_000,
    name: 'Magic Ring',
    labelKey: 'liveGift.tier.magicRing',
    descKey: 'liveGift.tierDesc.magicRing',
    descFallback: 'A ring lands in the middle and rings out in sparkles.',
    emoji: '💍',
    durationMs: 3500,
    accent: 'text-purple-400',
  },
  {
    key: 'crown',
    min: 50_000,
    name: 'Crown',
    labelKey: 'liveGift.tier.crown',
    descKey: 'liveGift.tierDesc.crown',
    descFallback: 'A crown rises over the stream and glints.',
    emoji: '👑',
    durationMs: 3200,
    accent: 'text-yellow-300',
  },
  {
    key: 'bouquet',
    min: 25_000,
    name: 'Bouquet of Flowers',
    labelKey: 'liveGift.tier.bouquet',
    descKey: 'liveGift.tierDesc.bouquet',
    descFallback: 'A bouquet bursts open across the corner.',
    emoji: '💐',
    durationMs: 3000,
    accent: 'text-rose-400',
  },
  {
    key: 'chocolate',
    min: 10_000,
    name: 'Box of Chocolate',
    labelKey: 'liveGift.tier.chocolate',
    descKey: 'liveGift.tierDesc.chocolate',
    descFallback: 'A box of chocolates tumbles up the screen.',
    emoji: '🍫',
    durationMs: 2800,
    accent: 'text-amber-600',
  },
  {
    key: 'heart',
    min: 1_000,
    name: 'Love Heart',
    labelKey: 'liveGift.tier.heart',
    descKey: 'liveGift.tierDesc.heart',
    descFallback: 'Hearts drift up the corner of the stream.',
    emoji: '❤️',
    durationMs: 2400,
    accent: 'text-red-400',
  },
] as const;

/** The floor: any gift at all plays something, even one below the ladder. */
export const BASE_GIFT_TIER = GIFT_TIERS[GIFT_TIERS.length - 1];

export function tierFromAmount(amount: number): GiftTier {
  const amt = Number(amount) || 0;
  return GIFT_TIERS.find((t) => amt >= t.min) ?? BASE_GIFT_TIER;
}

/**
 * Resolve what a gift record says it bought.
 *
 * The name wins when it is one we know, because it is what the sender picked
 * and paid for. The amount is the fallback — mobile's older records, and every
 * gift web has ever sent, carry no tier at all.
 */
export function tierFromGift(gift: { amount?: number | string; selectedTier?: string }): GiftTier {
  const named = gift.selectedTier
    ? GIFT_TIERS.find((t) => t.name === gift.selectedTier)
    : undefined;
  return named ?? tierFromAmount(Number(gift.amount) || 0);
}

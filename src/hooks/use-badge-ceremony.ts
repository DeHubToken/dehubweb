/**
 * Decides when the badge ascension ceremony plays.
 *
 * Not at the moment the balance crosses a threshold: a holder who tips over
 * while scrolling a feed, or with the app in the background, would spend the
 * animation somewhere it cannot be seen, and it would never play again. It
 * plays on the first visit to their *own* profile after the tier went up —
 * the one screen where the badge is large, still, and beside their name.
 *
 * What is stored is the tier the holder last saw a ceremony for, not a
 * boolean. Two behaviours fall out of that for free:
 *
 * - Someone who climbs two tiers between visits gets one ceremony, for the
 *   tier they actually landed on, rather than a queue of them.
 * - Someone who drops a tier and earns it back sees it again, because the
 *   stored name no longer matches.
 *
 * Demotions never play. Nobody needs an animation about losing.
 *
 * The marker is per-wallet in `localStorage`, so it is device-local: a holder
 * who promotes, watches the ceremony on their phone, then opens the web app
 * sees it once more. That is the right failure — the alternative is an account
 * field, an API write on profile mount, and a holder who misses it entirely
 * when that write races the page.
 *
 * @module hooks/use-badge-ceremony
 */
import { useCallback, useEffect, useState } from 'react';
import { canonicalTierName } from '@/lib/staking-badges';
import { isPromotion } from '@/lib/badge-motion';

const KEY_PREFIX = 'dehub.badgeCeremonySeen.';

/** `null` for a holder with no wallet — nothing is stored and nothing plays. */
function storageKey(address: string | null | undefined): string | null {
  const a = address?.trim().toLowerCase();
  return a ? `${KEY_PREFIX}${a}` : null;
}

function readSeen(address: string | null | undefined): string | null {
  const key = storageKey(address);
  if (!key) return null;
  try {
    return canonicalTierName(window.localStorage.getItem(key));
  } catch {
    // Private windows and blocked site data both throw on read. A holder who
    // cannot store the marker simply never gets the ceremony, which is quieter
    // than getting it on every profile visit forever.
    return null;
  }
}

function writeSeen(address: string | null | undefined, tier: string | null): void {
  const key = storageKey(address);
  if (!key || !tier) return;
  try {
    window.localStorage.setItem(key, tier);
  } catch {
    /* see readSeen */
  }
}

interface CeremonyArgs {
  /** Only ever true on the holder's own profile. */
  enabled: boolean;
  /** The wallet the marker is stored against. */
  address: string | null | undefined;
  /** The tier the holder is on right now. */
  tier: string | null | undefined;
}

export interface Ceremony {
  /** The tier being left behind — null when this is the first badge earned. */
  from: string | null;
  /** The tier being arrived at. */
  to: string;
}

/**
 * Returns the ceremony to play, or null. Call `dismiss` when it finishes (or
 * when it is interrupted) — the marker is written there, so an interrupted
 * ceremony is not replayed on the next visit.
 */
export function useBadgeCeremony({ enabled, address, tier }: CeremonyArgs) {
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const current = canonicalTierName(tier);

  useEffect(() => {
    if (!enabled || !current || !address) return;
    // Already showing one. Let it finish rather than restarting it when the
    // profile query refetches underneath.
    if (ceremony) return;

    const seen = readSeen(address);
    if (seen === current) return;

    if (!isPromotion(seen, current)) {
      // A demotion, or a tier the holder has already been shown. Move the
      // marker so the next genuine promotion is the one that plays.
      writeSeen(address, current);
      return;
    }

    setCeremony({ from: seen, to: current });
  }, [enabled, address, current, ceremony]);

  const dismiss = useCallback(() => {
    setCeremony((playing) => {
      if (playing) writeSeen(address, playing.to);
      return null;
    });
  }, [address]);

  return { ceremony, dismiss };
}

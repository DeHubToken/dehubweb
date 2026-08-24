/**
 * SelfBadgeSync — owns the signed-in user's live badge balance.
 *
 * Renders nothing. Mounted once in the app shell so exactly one query polls
 * the chain; every badge on screen reads that one cached answer through
 * `useSelfBadge`.
 *
 * When the live balance crosses into a new tier it also asks the API for a
 * fresh account row, once per tier. That is what moves the badge-gated
 * allowances (editor quota, builder allowance, governance weight) which read
 * `user.badgeBalance` rather than the badge itself — they follow the server on
 * purpose, so all this does is stop them waiting for the next sign-in to
 * notice. The badge itself does not wait for that round trip.
 *
 * It also owns the ladder scale (`useBadgeLadderSync`), for the same reason:
 * tiers are pegged in dollars, so every badge on screen needs the DHB price,
 * and exactly one component should be the thing that asks for it.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useSelfBadgeBalance } from '@/hooks/use-self-badge-balance';
import { useBadgeLadderSync } from '@/hooks/use-badge-scale';
import { getBadgeName, parseBadgeLock } from '@/lib/staking-badges';

export function SelfBadgeSync() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const live = useSelfBadgeBalance();
  const scale = useBadgeLadderSync();

  const stored = user?.badgeBalance;
  const username = user?.username ?? null;
  const lockKey = user?.badgeLock ? `${user.badgeLock.tier}:${user.badgeLock.requirement}` : '';

  // Both are re-created on every AuthProvider render; holding them in refs
  // keeps this effect keyed on the tier and nothing else.
  const refreshRef = useRef(refreshUser);
  refreshRef.current = refreshUser;
  const clientRef = useRef(queryClient);
  clientRef.current = queryClient;

  /** The tier we last reconciled, so a stale API answer can't loop us. */
  const reconciled = useRef<string | null>(null);

  useEffect(() => {
    if (live === undefined) return;

    const context = { scale, lock: parseBadgeLock(user?.badgeLock) };
    const liveTier = getBadgeName(live, username, context);
    if (liveTier === getBadgeName(stored, username, context)) return;
    if (liveTier === reconciled.current) return;
    reconciled.current = liveTier;

    refreshRef.current?.();
    // Other people's names may be drawing a balance fetched before this
    // moment; the cheap ones are worth re-reading now that a tier moved.
    clientRef.current.invalidateQueries({ queryKey: ['badge-balance'] });
    // `user.badgeLock` is read through `lockKey` so a new object identity from
    // an AuthProvider render cannot re-run this on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, stored, username, scale, lockKey]);

  return null;
}

export default SelfBadgeSync;

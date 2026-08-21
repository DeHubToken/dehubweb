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
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useSelfBadgeBalance } from '@/hooks/use-self-badge-balance';
import { getBadgeName } from '@/lib/staking-badges';

export function SelfBadgeSync() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const live = useSelfBadgeBalance();

  const stored = user?.badgeBalance;
  const username = user?.username ?? null;

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

    const liveTier = getBadgeName(live, username);
    if (liveTier === getBadgeName(stored, username)) return;
    if (liveTier === reconciled.current) return;
    reconciled.current = liveTier;

    refreshRef.current?.();
    // Other people's names may be drawing a balance fetched before this
    // moment; the cheap ones are worth re-reading now that a tier moved.
    clientRef.current.invalidateQueries({ queryKey: ['badge-balance'] });
  }, [live, stored, username]);

  return null;
}

export default SelfBadgeSync;

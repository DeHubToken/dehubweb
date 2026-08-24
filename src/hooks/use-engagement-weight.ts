/**
 * What the signed-in viewer's own view or reaction counts for
 * ===========================================================
 * The badge multiplier for *me* — 1 with no badge, 2 at Crab, up to 14 at
 * Meglodon. Used to move an optimistic count by the right amount instead of by
 * one and then snapping when the server's number arrives.
 *
 * Reads the same balance every badge on the site draws from: the account row,
 * promoted by the live wallet read (`preferLiveBalance`). The ladder scale
 * comes from module state, which `useBadgeScale` publishes once per sync — so
 * this costs nothing on a feed of two hundred cards.
 *
 * **Advisory, not authoritative.** The server prices the weight off the
 * account's EARNED balance and this side cannot see the earned/lent split, so a
 * borrowed badge reads heavier here than it counts there. `/request_vote` and
 * `/request_reaction` both return the weight they actually applied; settle
 * against that rather than trusting this number after the fact.
 */

import { useContext, useMemo } from 'react';
import { AuthContext } from '@/contexts/AuthContext';
import { preferLiveBalance, useSelfBadge } from '@/hooks/use-self-badge-balance';
import { engagementWeight, NO_BADGE_ENGAGEMENT_WEIGHT } from '@/lib/engagement-weight';

export function useEngagementWeight(): number {
  // The context directly, not useAuth: this is reachable from surfaces that
  // sit above AuthProvider, where the hook throws.
  const auth = useContext(AuthContext);
  const self = useSelfBadge();

  const balance = preferLiveBalance(auth?.user?.badgeBalance, self.balance);
  const username = auth?.user?.username ?? null;
  const lock = self.lock;

  return useMemo(() => {
    if (!auth?.isAuthenticated) return NO_BADGE_ENGAGEMENT_WEIGHT;
    return engagementWeight(balance, username, { lock });
  }, [auth?.isAuthenticated, balance, username, lock]);
}

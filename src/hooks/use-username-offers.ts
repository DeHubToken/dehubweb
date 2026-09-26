/**
 * Username offer hooks
 * ====================
 * Bidding for handles their owners have not put up for sale.
 *
 * The one rule worth stating up front, because the UI has to keep saying it:
 * **making an offer costs nothing and commits nothing**. No DHB moves, no
 * balance is checked, nothing is held. The money only leaves when an accepted
 * offer is paid for, and that goes through `useBuyUsername` in
 * `use-username-market` like any other purchase — an accepted offer carries
 * the `listingId` to hand it.
 *
 * Every mutation invalidates the listings caches alongside the offers, because
 * accepting an offer converts the owner's listing into a reservation and
 * declining one cancels it. A stale sell tab showing a listing that is now
 * promised to somebody is the bug this avoids.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  acceptUsernameOffer,
  createUsernameOffer,
  declineUsernameOffer,
  getMyUsernameOffers,
  getOffersForUsername,
  withdrawUsernameOffer,
  type MyUsernameOffers,
  type UsernameOffer,
} from '@/lib/api/dehub/username-offers';

/**
 * Write the server's answer into the list straight away, so the row flips
 * (Accept → Withdraw acceptance) the moment the call returns instead of after
 * the refetch. Without it a second tap on a still-visible Accept was possible.
 */
function applyOffer(qc: ReturnType<typeof useQueryClient>, offer: UsernameOffer) {
  qc.setQueryData<MyUsernameOffers>(['username-offers-mine'], prev =>
    prev
      ? {
          incoming: prev.incoming.map(o => (o.id === offer.id ? { ...o, ...offer } : o)),
          outgoing: prev.outgoing.map(o => (o.id === offer.id ? { ...o, ...offer } : o)),
        }
      : prev,
  );
}

/** Offers touch two surfaces, and answering one changes both. */
function invalidateMarket(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['username-offers-mine'] });
  qc.invalidateQueries({ queryKey: ['username-offers-for'] });
  qc.invalidateQueries({ queryKey: ['username-market-mine'] });
  qc.invalidateQueries({ queryKey: ['username-market-browse'] });
  // An answered offer is a row in the tray, and the badge on it is wrong
  // until this is dropped.
  qc.invalidateQueries({ queryKey: ['notifications'] });
}

export function useMyUsernameOffers() {
  const { isAuthenticated } = useAuth();
  return useQuery<MyUsernameOffers>({
    queryKey: ['username-offers-mine'],
    queryFn: getMyUsernameOffers,
    enabled: isAuthenticated,
    // The other side acts from another device: an owner accepting has to reach
    // the bidder's screen quickly, and a paid offer has to leave it.
    staleTime: 5 * 1000,
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/** Live bids for one handle — what it would take to outbid the room. */
export function useOffersForUsername(username: string | null | undefined) {
  return useQuery({
    queryKey: ['username-offers-for', username || ''],
    queryFn: () => getOffersForUsername(username as string),
    enabled: !!username,
    staleTime: 30 * 1000,
  });
}

export function useCreateUsernameOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createUsernameOffer,
    onSuccess: offer => {
      invalidateMarket(qc);
      toast.success(`Offer sent for @${offer.username}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAcceptUsernameOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId, replacementUsername }: { offerId: string; replacementUsername: string }) =>
      acceptUsernameOffer(offerId, { replacementUsername }),
    onSuccess: offer => {
      applyOffer(qc, offer);
      invalidateMarket(qc);
      // Said as a next step rather than as a completion: the owner still holds
      // the handle, and will until the buyer actually pays for it.
      toast.success(`Offer accepted — @${offer.username} is held for them until they pay`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeclineUsernameOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: declineUsernameOffer,
    onSuccess: offer => {
      applyOffer(qc, offer);
      invalidateMarket(qc);
      toast.success('Offer declined');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useWithdrawUsernameOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: withdrawUsernameOffer,
    onSuccess: offer => {
      applyOffer(qc, offer);
      invalidateMarket(qc);
      toast.success('Offer withdrawn');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

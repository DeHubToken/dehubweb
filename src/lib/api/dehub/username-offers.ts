/**
 * Username offers
 * ===============
 * Client for `/api/username_market/offers/*` on the DeHub API.
 *
 * The listings client next door covers handles whose owners put them up for
 * sale. This covers the other direction: naming a price for a handle somebody
 * else is wearing and has not offered to anybody.
 *
 * Two things to know before wiring a button to this:
 *
 * - **Making an offer moves no money and locks none.** It is a stated
 *   intention — nothing is escrowed, and the buyer's balance is not even
 *   checked. Any UI that implies funds are committed is lying.
 * - **Accepting does not transfer a handle either.** It returns an
 *   `accepted` offer carrying `listingId`, and the buyer pays for it through
 *   the ordinary quote → pay → claim path in `username-market.ts`. There is
 *   one code path that moves a username and this is not a second one.
 *
 * Prices are dollars, fixed for the life of the offer, exactly like an asking
 * price. `priceDhb` is what that converts to right now; `offeredDhb` is what
 * it was worth when it was made.
 */

import { apiCall } from './core';

export type UsernameOfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'completed'
  | 'expired';

export interface UsernameOffer {
  id: string;
  username: string;
  ownerAddress: string;
  buyerAddress: string;
  /** The offer. Fixed for its lifetime. */
  priceUsd: number;
  /** What settling it would cost in tokens right now. */
  priceDhb: number;
  /** What it was worth when it was made. */
  offeredDhb: number;
  message: string | null;
  status: UsernameOfferStatus;
  /** Set once accepted: the reserved listing to buy through. */
  listingId: string | null;
  replacementUsername: string | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string | null;
  counterparty: {
    address: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    badgeBalance: number;
  } | null;
}

export interface MyUsernameOffers {
  /** Bids for the handle I am wearing. */
  incoming: UsernameOffer[];
  /** Bids I have made for other people's. */
  outgoing: UsernameOffer[];
}

interface Envelope<T> {
  status: boolean;
  result: T;
}

export async function getMyUsernameOffers(): Promise<MyUsernameOffers> {
  const res = await apiCall<Envelope<MyUsernameOffers>>('/api/username_market/offers', {
    requiresAuth: true,
  });
  return res.result;
}

/** Live bids for one handle. Public, and without the private notes. */
export async function getOffersForUsername(
  username: string,
): Promise<{ username: string; offers: UsernameOffer[] }> {
  const res = await apiCall<Envelope<{ username: string; offers: UsernameOffer[] }>>(
    `/api/username_market/offers/${encodeURIComponent(username)}`,
  );
  return res.result;
}

/**
 * Offer for a handle, or raise an offer already made.
 *
 * Offering again for the same handle updates the existing bid rather than
 * opening a second one, so this is both "make" and "raise".
 */
export async function createUsernameOffer(input: {
  username: string;
  priceUsd: number;
  message?: string;
}): Promise<UsernameOffer> {
  const res = await apiCall<Envelope<UsernameOffer>>('/api/username_market/offers', {
    method: 'POST',
    body: { ...input },
    requiresAuth: true,
  });
  return res.result;
}

/**
 * Say yes.
 *
 * `replacementUsername` is where the owner lands when it sells, and it is
 * validated now rather than at the moment of payment — the same rule listing
 * a handle follows.
 */
export async function acceptUsernameOffer(
  offerId: string,
  input: { replacementUsername: string },
): Promise<UsernameOffer> {
  const res = await apiCall<Envelope<UsernameOffer>>(
    `/api/username_market/offers/${offerId}/accept`,
    { method: 'POST', body: { ...input }, requiresAuth: true },
  );
  return res.result;
}

/** Say no — or take back a yes, any time before the buyer pays. */
export async function declineUsernameOffer(offerId: string): Promise<UsernameOffer> {
  const res = await apiCall<Envelope<UsernameOffer>>(
    `/api/username_market/offers/${offerId}/decline`,
    { method: 'POST', requiresAuth: true },
  );
  return res.result;
}

/** Pull an offer back. Allowed after acceptance too. */
export async function withdrawUsernameOffer(offerId: string): Promise<UsernameOffer> {
  const res = await apiCall<Envelope<UsernameOffer>>(`/api/username_market/offers/${offerId}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
  return res.result;
}

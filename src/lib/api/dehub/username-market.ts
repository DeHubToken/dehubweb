/**
 * Username marketplace
 * ====================
 * Client for `/api/username_market/*` on the DeHub API.
 *
 * Handles are the one genuinely scarce thing on the platform — profiles live
 * at `dehub.io/:username` and there is exactly one of each — so this is the
 * rail for trading them, in DHB and nothing else.
 *
 * Two things to know before touching the buy path:
 *
 * - **The client never prices anything and never writes a sale.** `quote()`
 *   returns the asking price and the seller's address, the wallet sends DHB
 *   straight to the seller, and `claim()` hands the server a hash it verifies
 *   against the chain itself. Everything on screen before that is display.
 * - **`claim` is safe to repeat, and must be.** The payment is already on
 *   chain by the time it is called, so giving up on a dropped response would
 *   strand a real transfer. It answers `pending: true` while the receipt is
 *   still catching up; retry, do not restart.
 *
 * The bare origin is the base here, so every path carries `/api` — see the
 * badges client for the same note, and mobile for the opposite convention.
 */

import { apiCall } from './core';

export interface UsernameMarketConfig {
  minPriceUsd: number;
  maxPriceUsd: number;
  minPriceDhb: number;
  maxPriceDhb: number;
  maxDescriptionLength: number;
  usernameMaxLength: number;
  /** Current USD per token. Listing dollar prices stay fixed. */
  dhbUsdPeg: number;
  chains: { chainId: number; tokenAddress: string }[];
}

export interface UsernameListing {
  id: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  description: string | null;
  length: number;
  isNumeric: boolean;
  seller: {
    address: string;
    displayName: string | null;
    avatarUrl: string | null;
    badgeBalance: number;
  };
  createdAt: string | null;
}

/** What the exact searched-for handle actually is. */
export type HandleState = 'available' | 'listed' | 'taken' | 'reserved';

export interface BrowseUsernamesResult {
  listings: UsernameListing[];
  total: number;
  page: number;
  limit: number;
  exact: { username: string; state: HandleState } | null;
}

/**
 * One username this account owns, whether or not it is wearing it.
 *
 * Ownership stopped being the same thing as `account.username` when buying a
 * handle started keeping the one you had. `active` is the handle the profile
 * actually answers on; the rest are held, and every one of them can be resold.
 */
export interface UsernameHolding {
  username: string;
  length: number;
  isNumeric: boolean;
  active: boolean;
  /**
   * `purchase` — bought here. `retained` — what you were wearing when you
   * bought another one. `original` — the free name you have never paid for;
   * rename away from it and it goes back in the pool. There is at most one, and
   * it is always the active handle.
   */
  acquiredVia: 'purchase' | 'retained' | 'original';
  paidDhb: number | null;
  acquiredAt: string | null;
  /** Filled when this name is already on the market. */
  listing: { id: string; priceUsd: number; priceDhb: number } | null;
}

export interface MyUsernameListing {
  id: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  /** Null on a vault listing — the seller is not moving anywhere. */
  replacementUsername: string | null;
  /** True when the seller is selling a held name rather than the one they wear. */
  fromVault: boolean;
  description: string | null;
  status: 'active' | 'sold' | 'cancelled';
  cancelReason: string | null;
  soldForDhb: number | null;
  soldAt: string | null;
  createdAt: string | null;
  /** False once the seller has renamed away from what they listed. */
  live: boolean;
}

export interface UsernameSale {
  id: string;
  username: string;
  priceDhb: number;
  paidDhb: number;
  priceUsd: number;
  sellerAddress: string;
  buyerAddress: string;
  txHash: string;
  chainId: number;
  status: 'completed' | 'failed';
  failureReason: string | null;
  createdAt: string | null;
}

export interface MyUsernameMarket {
  currentUsername: string | null;
  /** Everything this account owns, active handle first. */
  held: UsernameHolding[];
  listings: MyUsernameListing[];
  sold: UsernameSale[];
  bought: UsernameSale[];
}

export interface UsernameQuote {
  quoteId: string;
  expiresAt: string;
  listingId: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  sellerAddress: string;
  /** What the buyer is giving up. Worth showing before they commit. */
  currentUsername: string | null;
  chains: { chainId: number; tokenAddress: string }[];
}

export type ClaimResult =
  | { pending: true; username: string }
  | {
      pending: false;
      username: string;
      previousUsername: string | null;
      /**
       * What the buyer wears after the sale. Their existing handle — a bought
       * name goes into the vault — unless the account had none. Optional
       * because servers from before that rule do not send it.
       */
      activeUsername?: string;
      /**
       * The handle they were wearing, now held rather than gone. Same string as
       * `previousUsername` — separate so the client can say "you keep @bob"
       * without having to know the retention rule.
       */
      retainedUsername: string | null;
      paidDhb: number;
      txHash: string;
    };

/** Every endpoint answers `{ status, result }`; this unwraps it. */
interface Envelope<T> {
  status: boolean;
  result: T;
}

export async function getUsernameMarketConfig(): Promise<UsernameMarketConfig> {
  const res = await apiCall<Envelope<UsernameMarketConfig>>('/api/username_market/config');
  return res.result;
}

export async function browseUsernames(params: {
  search?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'shortest';
  minPriceUsd?: number;
  maxPriceUsd?: number;
  page?: number;
  limit?: number;
}): Promise<BrowseUsernamesResult> {
  const res = await apiCall<Envelope<BrowseUsernamesResult>>('/api/username_market/listings', {
    params: {
      search: params.search || undefined,
      sort: params.sort,
      minPriceUsd: params.minPriceUsd,
      maxPriceUsd: params.maxPriceUsd,
      page: params.page,
      limit: params.limit,
    },
  });
  return res.result;
}

export async function getMyUsernameMarket(): Promise<MyUsernameMarket> {
  const res = await apiCall<Envelope<MyUsernameMarket>>('/api/username_market/mine', {
    requiresAuth: true,
  });
  return res.result;
}

/** Every username this account owns, active handle first. */
export async function getUsernameHoldings(): Promise<UsernameHolding[]> {
  const res = await apiCall<Envelope<{ held: UsernameHolding[] }>>('/api/username_market/holdings', {
    requiresAuth: true,
  });
  return res.result.held || [];
}

/**
 * Wear one of the names this account owns.
 *
 * Free and reversible — the vault is the same size afterwards. The name being
 * left is kept if it was bought and released if it was the free signup handle,
 * which the server decides and reports back as `releasedUsername`.
 */
export async function activateUsernameHolding(
  username: string,
): Promise<{ username: string; previousUsername: string | null; releasedUsername: string | null }> {
  const res = await apiCall<Envelope<{ username: string; previousUsername: string | null; releasedUsername: string | null }>>(
    '/api/username_market/holdings/activate',
    { method: 'POST', body: { username }, requiresAuth: true },
  );
  return res.result;
}

/** Give a held name back to the pool. Irreversible, and never the active one. */
export async function releaseUsernameHolding(username: string): Promise<void> {
  await apiCall<Envelope<unknown>>(`/api/username_market/holdings/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

/**
 * List a username this account owns.
 *
 * `username` defaults to the handle being worn, which is the only thing this
 * could sell before the vault existed. Naming a held name instead is the resale
 * path, and it needs no `replacementUsername`: the seller is not living in it,
 * so a sale never touches their profile. Selling the worn handle still does,
 * and the replacement is validated now rather than at the moment of sale.
 */
export async function createUsernameListing(input: {
  username?: string;
  priceUsd: number;
  replacementUsername?: string;
  description?: string;
}): Promise<{
  id: string;
  username: string;
  priceUsd: number;
  priceDhb: number;
  replacementUsername: string | null;
  fromVault: boolean;
}> {
  const res = await apiCall<Envelope<{ id: string; username: string; priceUsd: number; priceDhb: number; replacementUsername: string | null; fromVault: boolean }>>(
    '/api/username_market/listings',
    { method: 'POST', body: { ...input }, requiresAuth: true },
  );
  return res.result;
}

export async function updateUsernameListing(
  listingId: string,
  input: { priceUsd?: number; replacementUsername?: string; description?: string },
): Promise<{ id: string; priceUsd: number; priceDhb: number }> {
  const res = await apiCall<Envelope<{ id: string; priceUsd: number; priceDhb: number }>>(
    `/api/username_market/listings/${listingId}`,
    { method: 'PATCH', body: { ...input }, requiresAuth: true },
  );
  return res.result;
}

export async function cancelUsernameListing(listingId: string): Promise<void> {
  await apiCall<Envelope<unknown>>(`/api/username_market/listings/${listingId}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export async function quoteUsername(listingId: string): Promise<UsernameQuote> {
  const res = await apiCall<Envelope<UsernameQuote>>('/api/username_market/quote', {
    method: 'POST',
    body: { listingId },
    requiresAuth: true,
  });
  return res.result;
}

export async function claimUsername(input: {
  listingId: string;
  quoteId: string;
  txHash: string;
  chainId: number;
}): Promise<ClaimResult> {
  const res = await apiCall<Envelope<ClaimResult>>('/api/username_market/claim', {
    method: 'POST',
    body: { ...input },
    requiresAuth: true,
  });
  return res.result;
}

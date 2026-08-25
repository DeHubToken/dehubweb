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
  minPriceDhb: number;
  maxPriceDhb: number;
  maxDescriptionLength: number;
  usernameMaxLength: number;
  /** USD per DHB. Display only — every price here is denominated in DHB. */
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

export interface MyUsernameListing {
  id: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  replacementUsername: string;
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
  listings: MyUsernameListing[];
  sold: UsernameSale[];
  bought: UsernameSale[];
}

export interface UsernameQuote {
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
  minPriceDhb?: number;
  maxPriceDhb?: number;
  page?: number;
  limit?: number;
}): Promise<BrowseUsernamesResult> {
  const res = await apiCall<Envelope<BrowseUsernamesResult>>('/api/username_market/listings', {
    params: {
      search: params.search || undefined,
      sort: params.sort,
      minPriceDhb: params.minPriceDhb,
      maxPriceDhb: params.maxPriceDhb,
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

/**
 * List the handle this account is currently wearing.
 *
 * There is no `username` field on purpose: you can only sell what you hold, so
 * the server reads it off the account. `replacementUsername` is where you land
 * when it sells, and it is validated now rather than at the moment of sale.
 */
export async function createUsernameListing(input: {
  priceDhb: number;
  replacementUsername: string;
  description?: string;
}): Promise<{ id: string; username: string; priceDhb: number; replacementUsername: string }> {
  const res = await apiCall<Envelope<{ id: string; username: string; priceDhb: number; replacementUsername: string }>>(
    '/api/username_market/listings',
    { method: 'POST', body: { ...input }, requiresAuth: true },
  );
  return res.result;
}

export async function updateUsernameListing(
  listingId: string,
  input: { priceDhb?: number; replacementUsername?: string; description?: string },
): Promise<{ id: string; priceDhb: number }> {
  const res = await apiCall<Envelope<{ id: string; priceDhb: number }>>(
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

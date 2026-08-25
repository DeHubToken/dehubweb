/**
 * Account marketplace
 * ===================
 * Client for `/api/account_market/*` on the DeHub API.
 *
 * Where the username market trades the handle alone, this trades the whole
 * account — handle, posts, followers, tips history, badge entitlements. The
 * seller's wallet and everything in it stays theirs; after the sale that
 * wallet signs into a brand-new blank account.
 *
 * Three things to know before touching the buy path:
 *
 * - **The client never prices anything and never writes a sale.** `quote()`
 *   returns the asking price and the seller's address, the wallet sends DHB
 *   straight to the seller, and `claim()` hands the server a hash it verifies
 *   against the chain itself.
 * - **Delivery is to a wallet, not to the payer.** The account lands on a
 *   vacant wallet the buyer names (`receiveAddress`), validated up front via
 *   `checkReceive` so nobody pays into an address that cannot take delivery.
 * - **`claim` is safe to repeat, and must be.** It answers `pending: true`
 *   while the receipt is catching up. A 409 is not final either — it means
 *   "paid, transfer interrupted; retry the claim to resume", so the loop keeps
 *   going through it instead of surfacing it as a failure.
 *
 * The bare origin is the base here, so every path carries `/api` — see the
 * username-market client for the same note.
 */

import { apiCall } from './core';

export interface AccountMarketConfig {
  minPriceDhb: number;
  maxPriceDhb: number;
  maxDescriptionLength: number;
  /** USD per DHB. Display only — every price here is denominated in DHB. */
  dhbUsdPeg: number;
  chains: { chainId: number; tokenAddress: string }[];
}

export interface AccountListing {
  id: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  description: string | null;
  seller: {
    address: string;
    displayName: string | null;
    avatarUrl: string | null;
    badgeBalance: number;
    followers: number;
    uploads: number;
    accountCreatedAt: string | null;
  };
  createdAt: string | null;
}

export interface BrowseAccountsResult {
  listings: AccountListing[];
  total: number;
  page: number;
  limit: number;
}

export interface MyAccountListing {
  id: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  description: string | null;
  status: 'active' | 'sold' | 'cancelled';
  cancelReason: string | null;
  soldForDhb: number | null;
  soldAt: string | null;
  createdAt: string | null;
}

export interface AccountSale {
  id: string;
  username: string;
  priceDhb: number;
  paidDhb: number;
  sellerAddress: string;
  buyerAddress: string;
  receiveAddress: string;
  txHash: string;
  chainId: number;
  status: 'transferring' | 'completed' | 'failed';
  failureReason: string | null;
  createdAt: string | null;
}

export interface MyAccountMarket {
  listings: MyAccountListing[];
  sold: AccountSale[];
  bought: AccountSale[];
}

export interface AccountQuote {
  listingId: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  sellerAddress: string;
  /**
   * Whether the wallet asking for the quote could also take delivery — true
   * only for a fresh, vacant wallet. Usually false: the payer already has an
   * account, so the drawer asks for a separate receive address.
   */
  selfReceivable: boolean;
  chains: { chainId: number; tokenAddress: string }[];
}

export interface ReceiveCheck {
  receiveAddress: string;
  ok: boolean;
  problem: string | null;
}

export type AccountClaimResult =
  | { pending: true }
  | {
      pending: false;
      username: string;
      receiveAddress: string;
      paidDhb: number;
      txHash: string;
    };

/** Every endpoint answers `{ status, result }`; this unwraps it. */
interface Envelope<T> {
  status: boolean;
  result: T;
}

export async function getAccountMarketConfig(): Promise<AccountMarketConfig> {
  const res = await apiCall<Envelope<AccountMarketConfig>>('/api/account_market/config');
  return res.result;
}

export async function browseAccounts(params: {
  search?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'followers' | 'uploads';
  minPriceDhb?: number;
  maxPriceDhb?: number;
  page?: number;
  limit?: number;
}): Promise<BrowseAccountsResult> {
  const res = await apiCall<Envelope<BrowseAccountsResult>>('/api/account_market/listings', {
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

export async function getMyAccountMarket(): Promise<MyAccountMarket> {
  const res = await apiCall<Envelope<MyAccountMarket>>('/api/account_market/mine', {
    requiresAuth: true,
  });
  return res.result;
}

/**
 * List the CALLER's whole account. There is no `username` field on purpose:
 * you can only sell the account you are signed into, so the server reads it
 * off the session — and it requires the account to actually have a handle.
 * A new listing replaces any live one.
 */
export async function createAccountListing(input: {
  priceDhb: number;
  description?: string;
}): Promise<{ id: string; username: string; priceDhb: number }> {
  const res = await apiCall<Envelope<{ id: string; username: string; priceDhb: number }>>(
    '/api/account_market/listings',
    { method: 'POST', body: { ...input }, requiresAuth: true },
  );
  return res.result;
}

export async function updateAccountListing(
  listingId: string,
  input: { priceDhb?: number; description?: string },
): Promise<{ id: string; priceDhb: number }> {
  const res = await apiCall<Envelope<{ id: string; priceDhb: number }>>(
    `/api/account_market/listings/${listingId}`,
    { method: 'PATCH', body: { ...input }, requiresAuth: true },
  );
  return res.result;
}

export async function cancelAccountListing(listingId: string): Promise<void> {
  await apiCall<Envelope<unknown>>(`/api/account_market/listings/${listingId}`, {
    method: 'DELETE',
    requiresAuth: true,
  });
}

export async function quoteAccount(listingId: string): Promise<AccountQuote> {
  const res = await apiCall<Envelope<AccountQuote>>('/api/account_market/quote', {
    method: 'POST',
    body: { listingId },
    requiresAuth: true,
  });
  return res.result;
}

/** Validate a delivery wallet BEFORE any money moves. */
export async function checkReceiveAddress(input: {
  listingId: string;
  receiveAddress: string;
}): Promise<ReceiveCheck> {
  const res = await apiCall<Envelope<ReceiveCheck>>('/api/account_market/check_receive', {
    method: 'POST',
    body: { ...input },
    requiresAuth: true,
  });
  return res.result;
}

export async function claimAccount(input: {
  listingId: string;
  txHash: string;
  chainId: number;
  receiveAddress?: string;
}): Promise<AccountClaimResult> {
  const res = await apiCall<Envelope<AccountClaimResult>>('/api/account_market/claim', {
    method: 'POST',
    body: { ...input },
    requiresAuth: true,
  });
  return res.result;
}

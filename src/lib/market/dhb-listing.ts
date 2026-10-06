/**
 * $DHB listing-soon
 * =================
 * $DHB is not trading yet, so a search for it has no market to show: the price
 * is a pinned stub and the chart is flat. Every DHB card in the app (feed
 * ticker cards, Top Assets, trending tickers) lands on the explore search for
 * `$DHB`, and that search shows the listing-soon card with a "Notify me"
 * signup instead of an empty market.
 *
 * Signups go through `join_token_listing_waitlist` (see
 * supabase/migrations/20261006180000_token_listing_waitlist.sql). The browser
 * can write to the list but never read it.
 */

import { supabase } from '@/integrations/supabase/client';
import { CHAIN_CONFIGS } from '@/lib/contracts/dhb-token';
import { isDhbSymbol } from '@/lib/market/dhb-market-cap';

const DHB_ADDRESSES = new Set(
  Object.values(CHAIN_CONFIGS)
    .map((c) => c.dhbToken?.toLowerCase())
    .filter((a): a is string => !!a),
);

/**
 * Whether an explore query is asking about $DHB: the cashtag (`$DHB`,
 * `$DEHUB`), the bare ticker `DHB`, or a DHB contract address. Bare "dehub"
 * stays a brand search for the @d account.
 */
export function isDhbListingQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (DHB_ADDRESSES.has(q.toLowerCase())) return true;
  if (q.startsWith('$')) return isDhbSymbol(q);
  return q.toUpperCase() === 'DHB';
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidListingEmail(email: string): boolean {
  const e = email.trim();
  return e.length <= 254 && EMAIL_RE.test(e) && !e.toLowerCase().endsWith('.dehub.internal');
}

/**
 * The email the signed-in person logs in with, when it is a real address.
 * Phone and Telegram accounts carry a synthetic `*.dehub.internal` address and
 * wallet-first accounts carry none; both come back null so the card asks.
 */
export async function getSignInEmail(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const u = data?.user;
    if (!u) return null;
    const md = (u.user_metadata ?? {}) as Record<string, unknown>;
    const candidates = [u.email, typeof md.email === 'string' ? md.email : undefined];
    return candidates.find((e): e is string => !!e && isValidListingEmail(e)) ?? null;
  } catch {
    return null;
  }
}

export interface ListingSignup {
  email: string;
  walletAddress?: string | null;
  username?: string | null;
  source?: string;
}

export async function joinDhbListingWaitlist(signup: ListingSignup): Promise<{ alreadyJoined: boolean }> {
  const { data, error } = await supabase.rpc('join_token_listing_waitlist' as never, {
    p_token: 'DHB',
    p_email: signup.email.trim(),
    p_wallet_address: signup.walletAddress ?? null,
    p_username: signup.username ?? null,
    p_source: signup.source ?? null,
  } as never);
  if (error) throw error;
  const result = (data ?? {}) as { alreadyJoined?: boolean };
  return { alreadyJoined: result.alreadyJoined === true };
}

const JOINED_KEY = 'dhb-listing-notify:v1';

/** The address this browser signed up with, so a revisit shows "on the list". */
export function readJoinedEmail(): string | null {
  try {
    return localStorage.getItem(JOINED_KEY);
  } catch {
    return null;
  }
}

export function rememberJoinedEmail(email: string): void {
  try {
    localStorage.setItem(JOINED_KEY, email.trim().toLowerCase());
  } catch {
    /* private mode / blocked storage: the signup itself already landed */
  }
}

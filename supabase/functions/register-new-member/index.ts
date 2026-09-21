// register-new-member
// ====================
// Keeps `public.new_members` — the roster the app scrolls newest-joined first —
// and fills it in from accounts the platform can already see.
//
// Called once per session by both clients right after sign-in. It is the ONLY
// writer of that table: clients have no INSERT grant, and the one column they
// can change on their own row is `opted_out`.
//
// Why a function instead of letting the client upsert its own row: `joined_at`
// decides who wears the NEW badge and who sits at the top of a list the whole
// platform can see. Taken from the caller it is a claim; taken from
// api.dehub.io it is a fact. So nothing here comes from the request body —
// there isn't one, and there is no address parameter either.
//
// DISCOVERY is the other half, and the reason the roster is not empty. Sign-in
// registration alone only ever learns about people who came back after this
// shipped, which left every surface reading "Nobody new this month — yet" while
// a month of real joiners sat there invisible. So each call also spends a
// little of its time looking outward: the caller's own followers and followings
// (already in the account record it just fetched, so free) and the authors of
// the latest feed. Every address found is verified against
// api.dehub.io/api/account_info before it is written, so the roster is still
// made of facts — the discovery only decides who to ask about.
//
// There is no 30-day window on what gets written. The window decides what is
// called NEW; the list itself is chronological and endless, so an account is
// worth rostering whenever we learn of it.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkRateLimit,
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
} from "../_shared/auth.ts";

const DEHUB_API = "https://api.dehub.io";

/** How long an account counts as new. Mirrors NEW_MEMBER_WINDOW_DAYS on the clients. */
const WINDOW_DAYS = 30;

/** Unknown addresses looked up per discovery run. Each one costs an API call. */
const LOOKUP_LIMIT = 60;

/** Feed pages read per run to find recent authors. */
const FEED_PAGES = 3;
const FEED_PAGE_SIZE = 50;

/** Already-rostered rows refreshed per discovery run. Each one costs an API call. */
const REFRESH_LIMIT = 5;

/** How long a discovered member's row may go without a refresh opportunity. */
const STALE_REFRESH_MS = 24 * 60 * 60 * 1000;

/**
 * Discovery runs allowed per wallet per hour.
 *
 * One per login is the intent; the cap is what stops a client that re-registers
 * in a loop turning into a lookup storm against api.dehub.io. Members who
 * cannot discover anything new cost a single cheap query.
 */
const DISCOVERY_RATE = { limit: 2, windowMs: 60 * 60 * 1000 };

const ADDRESS_RE = /^0x[a-f0-9]{40}$/;

interface MemberRow {
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  badge_balance: number | null;
  joined_at: string;
  updated_at: string;
}

type Account = Record<string, unknown>;

function serviceRole(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** The account record api.dehub.io holds for an address, or null. */
async function fetchAccount(address: string): Promise<Account | null> {
  try {
    const res = await fetch(`${DEHUB_API}/api/account_info/${address}`);
    if (!res.ok) return null;
    const body = await res.json();
    return (body?.result ?? body) ?? null;
  } catch {
    return null;
  }
}

/** The creation date on an account record, or null when it has none we trust. */
function joinedAtOf(account: Account | null): Date | null {
  const raw = (account?.createdAt ?? account?.created_at) as string | undefined;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Everything the roster stores about a member, all of it from the API record. */
function toRow(address: string, account: Account, joinedAt: Date): MemberRow {
  return {
    wallet_address: address,
    username: (account?.username as string) ?? null,
    display_name: (account?.displayName as string) ?? (account?.display_name as string) ??
      (account?.username as string) ?? null,
    avatar_url: (account?.avatarImageUrl as string) ?? (account?.avatarUrl as string) ?? null,
    badge_balance: typeof account?.badgeBalance === "number" ? account.badgeBalance : null,
    joined_at: joinedAt.toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Addresses out of a follower/following list, which may hold strings or objects. */
function addressesFrom(value: unknown, into: Set<string>) {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    const raw = typeof entry === "string"
      ? entry
      : (entry as { address?: string; wallet?: string })?.address ??
        (entry as { wallet?: string })?.wallet;
    if (typeof raw !== "string") continue;
    const address = raw.toLowerCase();
    if (ADDRESS_RE.test(address)) into.add(address);
  }
}

/** The authors of the latest posts — the people currently active on the platform. */
async function feedAuthors(into: Set<string>) {
  for (let page = 1; page <= FEED_PAGES; page++) {
    try {
      const res = await fetch(
        `${DEHUB_API}/api/feed?limit=${FEED_PAGE_SIZE}&page=${page}&sort=latest`,
      );
      if (!res.ok) return;
      const body = await res.json();
      const items = body?.result ?? body?.items ?? body;
      if (!Array.isArray(items)) return;
      for (const item of items) {
        const minter = (item as { minter?: string })?.minter;
        if (typeof minter !== "string") continue;
        const address = minter.toLowerCase();
        if (ADDRESS_RE.test(address)) into.add(address);
      }
    } catch {
      return;
    }
  }
}

/**
 * Look up whoever we have not seen before and add them to the roster.
 *
 * Addresses already rostered are skipped for the *discovery* part — re-adding
 * them tells us nothing new — but a handful of the stalest known rows are
 * refreshed instead of just dropped. A row is only ever written by the
 * member's own login or by whichever stranger's session happened to discover
 * them first; if that stranger discovers them again next month, the roster
 * still shows the placeholder name from the day they signed up, and a click
 * lands on their current, real profile — a name on the card that does not
 * match the name on the page it opens. Refreshing here is what an idle
 * account's own next login would have done anyway, just sooner.
 */
async function discover(supabase: SupabaseClient, caller: Account, self: string): Promise<number> {
  const candidates = new Set<string>();
  addressesFrom(caller?.followersList, candidates);
  addressesFrom(caller?.followingsList, candidates);
  await feedAuthors(candidates);
  candidates.delete(self);
  if (candidates.size === 0) return 0;

  const all = [...candidates];
  const { data: known } = await supabase
    .from("new_members")
    .select("wallet_address, updated_at, opted_out")
    .in("wallet_address", all);

  const knownRows = known ?? [];
  const rostered = new Set(knownRows.map((r: { wallet_address: string }) => r.wallet_address));
  const unknown = all.filter((a) => !rostered.has(a)).slice(0, LOOKUP_LIMIT);

  // Known rows this run also happened to touch, oldest-refreshed first,
  // capped small: this is a courtesy top-up piggybacking on someone else's
  // login, not the write path, and must not turn into a lookup storm against
  // api.dehub.io every time a popular account shows up in a feed page.
  const staleCutoff = Date.now() - STALE_REFRESH_MS;
  const stale = knownRows
    .filter((r: { updated_at: string }) => new Date(r.updated_at).getTime() < staleCutoff)
    .slice(0, REFRESH_LIMIT);

  const newRows = (await Promise.all(
    unknown.map(async (address) => {
      const account = await fetchAccount(address);
      const joinedAt = joinedAtOf(account);
      if (!account || !joinedAt) return null;
      return toRow(address, account, joinedAt);
    }),
  )).filter((row): row is MemberRow => row !== null);

  const refreshRows = (await Promise.all(
    stale.map(async (r: { wallet_address: string; opted_out: boolean }) => {
      const account = await fetchAccount(r.wallet_address);
      const joinedAt = joinedAtOf(account);
      if (!account || !joinedAt) return null;
      // Carries its own opted_out through: this row already belongs to
      // someone, and a refresh must never touch the one field they control.
      return { ...toRow(r.wallet_address, account, joinedAt), opted_out: r.opted_out };
    }),
  )).filter((row): row is MemberRow & { opted_out: boolean } => row !== null);

  let written = 0;

  if (newRows.length > 0) {
    // ignoreDuplicates: a member who signed in between the read above and
    // this write owns their row, including the opt-out this must never
    // overwrite.
    const { error } = await supabase
      .from("new_members")
      .upsert(newRows, { onConflict: "wallet_address", ignoreDuplicates: true });
    if (error) throw new Error(`Discovery upsert failed: ${error.message}`);
    written += newRows.length;
  }

  if (refreshRows.length > 0) {
    const { error } = await supabase
      .from("new_members")
      .upsert(refreshRows, { onConflict: "wallet_address" });
    if (error) throw new Error(`Discovery refresh failed: ${error.message}`);
    written += refreshRows.length;
  }

  return written;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    // The wallet is the token's, not the header's — see _shared/auth.ts.
    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;
    const wallet = auth.wallet;

    const supabase = serviceRole();

    const account = await fetchAccount(wallet);
    if (!account) return jsonResponse({ error: "Account lookup failed" }, 502);

    const joinedAt = joinedAtOf(account);
    if (!joinedAt) {
      // No creation date means we cannot say when they joined, and guessing
      // "now" would put every account on the platform at the top of the list.
      return jsonResponse({ isListed: false, isNew: false, reason: "no-created-at" });
    }

    // Read before write: an upsert would reset `opted_out` to its default on
    // every login, quietly undoing the setting a few hours after it was
    // changed. Only the display fields are refreshed for someone already here.
    const { data: existing } = await supabase
      .from("new_members")
      .select("opted_out")
      .eq("wallet_address", wallet)
      .maybeSingle();

    const row = { ...toRow(wallet, account, joinedAt), opted_out: existing?.opted_out ?? false };

    const { error } = await supabase
      .from("new_members")
      .upsert(row, { onConflict: "wallet_address" });

    if (error) throw new Error(`Upsert failed: ${error.message}`);

    // Discovery is best-effort and must never fail a registration: the caller
    // is already on the roster by this point, which is the part that matters.
    let added = 0;
    const rl = await checkRateLimit(supabase, wallet, "new-member-discovery", DISCOVERY_RATE);
    if (rl.allowed) {
      try {
        added = await discover(supabase, account, wallet);
      } catch (err) {
        console.error("[register-new-member] discovery", err);
      }
    }

    return jsonResponse({
      isListed: !row.opted_out,
      isNew: Date.now() - joinedAt.getTime() < WINDOW_DAYS * 24 * 60 * 60 * 1000,
      joinedAt: joinedAt.toISOString(),
      optedOut: row.opted_out,
      firstRegistration: !existing,
      added,
    });
  } catch (error) {
    console.error("[register-new-member]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

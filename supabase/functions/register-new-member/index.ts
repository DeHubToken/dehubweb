// register-new-member
// ====================
// Puts the caller on the new-members roster — or takes them off it once they
// are no longer new. Also fills the roster in from accounts the app is already
// showing, so it is not empty until everybody happens to sign in again.
//
// Called once per session by both clients right after sign-in. It is the ONLY
// writer of `public.new_members`: clients have no INSERT grant on that table,
// and the one column they can change on their own row is `opted_out`.
//
// Why a function instead of letting the client upsert its own row: `joined_at`
// decides who wears the NEW badge and who sits at the top of a rail the whole
// platform can see. Taken from the caller it is a claim; taken from
// api.dehub.io it is a fact.
//
// SEED MODE (`{ candidates: [...] }`) exists because sign-in alone fills the
// roster far too slowly: it only ever knows about people who came back after
// the feature shipped, so a month of real joiners stays invisible while the
// rail says "nobody new this month". A client may therefore point at addresses
// it is already rendering — feed authors, follow suggestions — and say "check
// these". Nothing about them is taken from the caller: the address is only a
// question, and `joined_at`, the name, the avatar and the badge balance all
// still come from api.dehub.io. The worst a caller can do is get a genuinely
// new member listed a few days earlier than their next login, which is the
// feature working, and which that member can still opt out of.

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

/** Addresses checked per seed call. One page of feed authors, near enough. */
const SEED_LIMIT = 25;

/**
 * Seed calls allowed per wallet per hour.
 *
 * Every unknown candidate costs one api.dehub.io lookup, and most candidates
 * are old accounts that will never be rostered — so the cap is what stops a
 * busy feed turning into a lookup loop. Clients also remember what they have
 * already submitted, which keeps ordinary use far under this.
 */
const SEED_RATE = { limit: 8, windowMs: 60 * 60 * 1000 };

interface MemberRow {
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  badge_balance: number | null;
  joined_at: string;
  updated_at: string;
}

function serviceRole(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** The account record api.dehub.io holds for an address, or null. */
async function fetchAccount(address: string): Promise<Record<string, unknown> | null> {
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
function joinedAtOf(account: Record<string, unknown> | null): Date | null {
  const raw = (account?.createdAt ?? account?.created_at) as string | undefined;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Everything the roster stores about a member, all of it from the API record. */
function toRow(address: string, account: Record<string, unknown>, joinedAt: Date): MemberRow {
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

/** Valid, deduplicated, capped. Anything else in the body is ignored. */
async function readCandidates(req: Request): Promise<string[]> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return [];
  }
  const raw = (body as { candidates?: unknown })?.candidates;
  if (!Array.isArray(raw)) return [];

  const out = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const address = entry.toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) continue;
    out.add(address);
    if (out.size >= SEED_LIMIT) break;
  }
  return [...out];
}

/**
 * Check a batch of addresses and roster the ones that turn out to be new.
 *
 * Addresses already on the roster are dropped before any lookup: re-reading
 * them would cost a request to tell us what we know, and an upsert over an
 * existing row risks resetting the one field its owner controls.
 */
async function seedCandidates(
  supabase: SupabaseClient,
  wallet: string,
  candidates: string[],
): Promise<Response> {
  const rl = await checkRateLimit(supabase, wallet, "new-member-seed", SEED_RATE);
  if (!rl.allowed) return jsonResponse({ added: 0, checked: 0, reason: "rate-limited" });

  const { data: known } = await supabase
    .from("new_members")
    .select("wallet_address")
    .in("wallet_address", candidates);

  const rostered = new Set((known ?? []).map((r: { wallet_address: string }) => r.wallet_address));
  const unknown = candidates.filter((a) => !rostered.has(a));
  if (unknown.length === 0) return jsonResponse({ added: 0, checked: 0 });

  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const rows = (await Promise.all(
    unknown.map(async (address) => {
      const account = await fetchAccount(address);
      const joinedAt = joinedAtOf(account);
      if (!account || !joinedAt || joinedAt.getTime() < cutoff) return null;
      return toRow(address, account, joinedAt);
    }),
  )).filter((row): row is MemberRow => row !== null);

  if (rows.length > 0) {
    // ignoreDuplicates: a member who signed in between the read above and this
    // write owns their row, including the opt-out this must never overwrite.
    const { error } = await supabase
      .from("new_members")
      .upsert(rows, { onConflict: "wallet_address", ignoreDuplicates: true });
    if (error) throw new Error(`Seed upsert failed: ${error.message}`);
  }

  return jsonResponse({ added: rows.length, checked: unknown.length });
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

    const candidates = await readCandidates(req);
    if (candidates.length > 0) return await seedCandidates(supabase, wallet, candidates);

    const account = await fetchAccount(wallet);
    if (!account) return jsonResponse({ error: "Account lookup failed" }, 502);

    const joinedAt = joinedAtOf(account);
    if (!joinedAt) {
      // No creation date means we cannot say how new they are, and guessing
      // "now" would hand a NEW badge to every account on the platform.
      return jsonResponse({ isNew: false, reason: "no-created-at" });
    }

    const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;

    if (joinedAt.getTime() < cutoff) {
      // Aged out. Drop the row so the table stays roughly the size of the
      // window rather than growing forever — but only if they were visible.
      // Deleting an opted-out row would silently re-expose that person the
      // next time they signed in, which is the one outcome this feature must
      // never produce.
      await supabase
        .from("new_members")
        .delete()
        .eq("wallet_address", wallet)
        .eq("opted_out", false);
      return jsonResponse({ isNew: false, joinedAt: joinedAt.toISOString() });
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

    return jsonResponse({
      isNew: true,
      joinedAt: joinedAt.toISOString(),
      optedOut: row.opted_out,
      firstRegistration: !existing,
    });
  } catch (error) {
    console.error("[register-new-member]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

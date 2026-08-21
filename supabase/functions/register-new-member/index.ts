// register-new-member
// ====================
// Puts the caller on the new-members roster — or takes them off it once they
// are no longer new.
//
// Called once per session by both clients right after sign-in. It is the ONLY
// writer of `public.new_members`: clients have no INSERT grant on that table,
// and the one column they can change on their own row is `opted_out`.
//
// Why a function instead of letting the client upsert its own row: `joined_at`
// decides who wears the NEW badge and who sits at the top of a rail the whole
// platform can see. Taken from the caller it is a claim; taken from
// api.dehub.io it is a fact. So nothing here comes from the request body —
// there isn't one. The wallet comes off the verified DeHub token, and
// everything else off that wallet's account record.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
} from "../_shared/auth.ts";

const DEHUB_API = "https://api.dehub.io";

/** How long an account counts as new. Mirrors NEW_MEMBER_WINDOW_DAYS on the clients. */
const WINDOW_DAYS = 30;

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    // The wallet is the token's, not the header's — see _shared/auth.ts.
    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;
    const wallet = auth.wallet;

    const accountRes = await fetch(`${DEHUB_API}/api/account_info/${wallet}`);
    if (!accountRes.ok) {
      return jsonResponse({ error: `Account lookup returned ${accountRes.status}` }, 502);
    }
    const accountBody = await accountRes.json();
    const account = accountBody?.result ?? accountBody;

    const createdAt = account?.createdAt ?? account?.created_at;
    const joinedAt = createdAt ? new Date(createdAt) : null;
    if (!joinedAt || Number.isNaN(joinedAt.getTime())) {
      // No creation date means we cannot say how new they are, and guessing
      // "now" would hand a NEW badge to every account on the platform.
      return jsonResponse({ isNew: false, reason: "no-created-at" });
    }

    const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    const row = {
      wallet_address: wallet,
      username: account?.username ?? null,
      display_name: account?.displayName ?? account?.display_name ?? account?.username ?? null,
      avatar_url: account?.avatarImageUrl ?? account?.avatarUrl ?? null,
      badge_balance: typeof account?.badgeBalance === "number" ? account.badgeBalance : null,
      joined_at: joinedAt.toISOString(),
      opted_out: existing?.opted_out ?? false,
      updated_at: new Date().toISOString(),
    };

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

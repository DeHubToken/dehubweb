// Crowdsourced skippable sections of a post video — sponsor reads, intros,
// outros, self-promo, interaction breaks, filler.
//
// Reads are public and go straight through: the player needs them for
// signed-out viewers too, and a segment list is not private data. Writes
// authenticate with requireDeHubAuth and take the wallet from the VERIFIED
// token, never from the x-wallet-address header.
//
// Neither table has an INSERT/UPDATE/DELETE policy; this function writes as
// the service role. There is no RLS expression that can authenticate a DeHub
// wallet, because Postgres has no way to check a DeHub token.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from "../_shared/auth.ts";

const CATEGORIES = new Set([
  "sponsor",
  "intro",
  "outro",
  "selfpromo",
  "interaction",
  "filler",
]);

/** Matches the CHECK constraint — rejected here so the error is readable. */
const MAX_SEGMENT_SECONDS = 900;
/** A segment shorter than this is a mis-tap, not a sponsor read. */
const MIN_SEGMENT_SECONDS = 1;
/** Per person per video. Enough to mark a long video honestly, not enough to carpet it. */
const MAX_PER_PERSON = 10;

const SELECT_COLUMNS =
  "id, token_id, category, start_seconds, end_seconds, address, votes_up, votes_down, created_at";

function parseTokenId(raw: string | null): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const url = new URL(req.url);
    const db = serviceClient();

    // ── Read ────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const tokenId = parseTokenId(url.searchParams.get("token_id"));
      if (tokenId === null) return jsonResponse({ error: "token_id is required." }, 400);

      const { data, error } = await db
        .from("video_segments")
        .select(SELECT_COLUMNS)
        .eq("token_id", tokenId)
        .eq("status", "active")
        .order("start_seconds", { ascending: true })
        .limit(200);

      if (error) {
        console.error("[video-segments] read", error);
        return jsonResponse({ error: "Could not load segments." }, 500);
      }

      return new Response(JSON.stringify({ segments: data ?? [] }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          // Short: a segment submitted while someone is watching should reach
          // the next viewer quickly, and the list is tiny.
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    // ── Write ───────────────────────────────────────────────────────────────
    // Everything that writes is a POST, including removal. The shared CORS
    // headers allow GET, POST and OPTIONS only, so a DELETE would never make
    // it past the preflight — it fails in the browser and works in curl, which
    // is the worst way for a bug to present.
    if (req.method === "POST") {
      const auth = await requireDeHubAuth(req);
      if (!auth.ok) return auth.response;

      const payload = await req.json().catch(() => null);
      if (!payload) return jsonResponse({ error: "Invalid JSON body." }, 400);

      // ── Withdraw your own ─────────────────────────────────────────────────
      if (payload.remove_segment_id) {
        // Scoped to the caller's own rows: a mistake is yours to withdraw, and
        // somebody else's is a downvote, not a delete.
        const { error } = await db
          .from("video_segments")
          .delete()
          .eq("id", payload.remove_segment_id)
          .eq("address", auth.wallet);

        if (error) {
          console.error("[video-segments] delete", error);
          return jsonResponse({ error: "Could not remove that segment." }, 500);
        }
        return jsonResponse({ ok: true });
      }

      // ── Vote ──────────────────────────────────────────────────────────────
      if (payload.segment_id) {
        const vote = Number(payload.vote);
        if (vote !== 1 && vote !== -1 && vote !== 0) {
          return jsonResponse({ error: "vote must be 1, -1 or 0 to clear." }, 400);
        }

        if (vote === 0) {
          const { error } = await db
            .from("video_segment_votes")
            .delete()
            .eq("segment_id", payload.segment_id)
            .eq("address", auth.wallet);
          if (error) {
            console.error("[video-segments] unvote", error);
            return jsonResponse({ error: "Could not clear your vote." }, 500);
          }
          return jsonResponse({ ok: true });
        }

        const { error } = await db
          .from("video_segment_votes")
          .upsert(
            { segment_id: payload.segment_id, address: auth.wallet, vote },
            { onConflict: "segment_id,address" },
          );

        if (error) {
          console.error("[video-segments] vote", error);
          return jsonResponse({ error: "Could not record your vote." }, 500);
        }
        return jsonResponse({ ok: true });
      }

      // ── Submit ────────────────────────────────────────────────────────────
      const tokenId = parseTokenId(String(payload.token_id ?? ""));
      if (tokenId === null) return jsonResponse({ error: "token_id is required." }, 400);

      const category = String(payload.category ?? "");
      if (!CATEGORIES.has(category)) {
        return jsonResponse({ error: "Unknown category." }, 400);
      }

      const start = Number(payload.start_seconds);
      const end = Number(payload.end_seconds);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
        return jsonResponse({ error: "start_seconds and end_seconds must describe a range." }, 400);
      }
      const length = end - start;
      if (length < MIN_SEGMENT_SECONDS) {
        return jsonResponse({ error: "That segment is too short to be real." }, 400);
      }
      if (length > MAX_SEGMENT_SECONDS) {
        return jsonResponse({ error: "That segment is too long — mark the sponsor read, not the video." }, 400);
      }

      const { count, error: countError } = await db
        .from("video_segments")
        .select("id", { count: "exact", head: true })
        .eq("token_id", tokenId)
        .eq("address", auth.wallet);

      if (countError) {
        console.error("[video-segments] count", countError);
        return jsonResponse({ error: "Could not save that segment." }, 500);
      }
      if ((count ?? 0) >= MAX_PER_PERSON) {
        return jsonResponse({ error: `You have already marked ${MAX_PER_PERSON} sections on this video.` }, 429);
      }

      const { data, error } = await db
        .from("video_segments")
        .upsert(
          {
            token_id: tokenId,
            category,
            start_seconds: Math.round(start * 1000) / 1000,
            end_seconds: Math.round(end * 1000) / 1000,
            address: auth.wallet,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "token_id,address,start_seconds" },
        )
        .select(SELECT_COLUMNS)
        .single();

      if (error) {
        console.error("[video-segments] insert", error);
        return jsonResponse({ error: "Could not save that segment." }, 500);
      }

      // The submitter counts as its first upvote — otherwise a brand-new
      // segment sits at zero and the burial rule treats one downvote as a
      // majority.
      await db
        .from("video_segment_votes")
        .upsert({ segment_id: data.id, address: auth.wallet, vote: 1 }, { onConflict: "segment_id,address" });

      return jsonResponse({ segment: data });
    }

    return jsonResponse({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("[video-segments]", error);
    return jsonResponse({ error: "Unexpected error." }, 500);
  }
});

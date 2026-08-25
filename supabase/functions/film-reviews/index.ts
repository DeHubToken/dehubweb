// Ratings and reviews for /cinema titles.
//
// Reads are public and go straight through. Writes authenticate with
// requireDeHubAuth and take the wallet from the VERIFIED token, never from the
// x-wallet-address header — the header is client-controlled, and trusting it is
// what once let one account spend another's credits.
//
// The table has no INSERT/UPDATE/DELETE policy at all; this function writes as
// the service role. That is the point: there is no RLS expression that can
// authenticate a wallet, because Postgres has no way to check a DeHub token.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from "../_shared/auth.ts";

const OBJECT_TYPES = new Set(["movie", "show"]);
const MAX_BODY = 4000;
const PAGE_SIZE = 50;

interface ReviewRow {
  id: string;
  address: string;
  rating: number;
  body: string | null;
  created_at: string;
  updated_at: string;
}

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const url = new URL(req.url);
    const justwatchId = (url.searchParams.get("justwatch_id") ?? "").trim();
    const objectType = url.searchParams.get("object_type") ?? "movie";

    if (!justwatchId) return jsonResponse({ error: "justwatch_id is required." }, 400);
    if (!OBJECT_TYPES.has(objectType)) return jsonResponse({ error: "Invalid object_type." }, 400);

    const db = serviceClient();

    // ── Read ────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const { data, error } = await db
        .from("film_reviews")
        .select("id, address, rating, body, created_at, updated_at")
        .eq("justwatch_id", justwatchId)
        .eq("object_type", objectType)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (error) {
        console.error("[film-reviews] read", error);
        return jsonResponse({ error: "Could not load reviews." }, 500);
      }

      const rows = (data ?? []) as ReviewRow[];

      // Averaged here rather than in SQL: the page needs the rows anyway, and
      // a second aggregate query would double the round trips for a number
      // derived from at most PAGE_SIZE values.
      const count = rows.length;
      const average = count
        ? Math.round((rows.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10
        : null;

      const distribution = [1, 2, 3, 4, 5].map(
        (star) => rows.filter((r) => r.rating === star).length,
      );

      return new Response(
        JSON.stringify({ reviews: rows, summary: { average, count, distribution } }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            // Short: a review posted should show up on the next look, but a
            // popular title should not hit the table on every render.
            "Cache-Control": "public, max-age=30",
          },
        },
      );
    }

    // ── Write ───────────────────────────────────────────────────────────────
    if (req.method === "POST" || req.method === "DELETE") {
      const auth = await requireDeHubAuth(req);
      if (!auth.ok) return auth.response;

      if (req.method === "DELETE") {
        const { error } = await db
          .from("film_reviews")
          .delete()
          .eq("justwatch_id", justwatchId)
          .eq("object_type", objectType)
          .eq("address", auth.wallet);

        if (error) {
          console.error("[film-reviews] delete", error);
          return jsonResponse({ error: "Could not remove your review." }, 500);
        }
        return jsonResponse({ ok: true });
      }

      const payload = await req.json().catch(() => null);
      if (!payload) return jsonResponse({ error: "Invalid JSON body." }, 400);

      const rating = Number(payload.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return jsonResponse({ error: "rating must be a whole number from 1 to 5." }, 400);
      }

      const body = typeof payload.body === "string" ? payload.body.trim() : "";
      if (body.length > MAX_BODY) {
        return jsonResponse({ error: `Review is too long (max ${MAX_BODY} characters).` }, 400);
      }

      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      if (!title) {
        // The snapshot is what lets a review render without a catalogue call.
        // Refusing here keeps rows that can never be displayed out of the table.
        return jsonResponse({ error: "title is required." }, 400);
      }

      const year = Number.isInteger(Number(payload.year)) ? Number(payload.year) : null;

      const { data, error } = await db
        .from("film_reviews")
        .upsert(
          {
            justwatch_id: justwatchId,
            object_type: objectType,
            title,
            poster: typeof payload.poster === "string" ? payload.poster : null,
            year,
            address: auth.wallet,
            rating,
            body: body || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "justwatch_id,object_type,address" },
        )
        .select("id, address, rating, body, created_at, updated_at")
        .single();

      if (error) {
        console.error("[film-reviews] upsert", error);
        return jsonResponse({ error: "Could not save your review." }, 500);
      }

      return jsonResponse({ review: data });
    }

    return jsonResponse({ error: `Method ${req.method} not allowed.` }, 405);
  } catch (err) {
    console.error("[film-reviews] unhandled", err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});

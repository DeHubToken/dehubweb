// Viewer-submitted fixes to auto-caption lines.
//
// Reads are public: captions are read by signed-out viewers, and a suggestion
// under a line is part of reading the transcript. Writes authenticate with
// requireDeHubAuth and take the wallet from the VERIFIED token.
//
// Every write is a POST, removal included — the shared CORS headers allow GET,
// POST and OPTIONS, so a DELETE would die at the preflight in a browser while
// working perfectly in curl.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from "../_shared/auth.ts";

const MAX_TEXT = 500;
/** Per person per transcript. A viewer fixing a caption is fixing lines, not rewriting it. */
const MAX_PER_PERSON = 40;

const SELECT_COLUMNS =
  "id, transcript_id, segment_index, text, address, votes_up, votes_down, status, created_at";

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const url = new URL(req.url);
    const db = serviceClient();

    // ── Read ────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const transcriptId = (url.searchParams.get("transcript_id") ?? "").trim();
      if (!transcriptId) return jsonResponse({ error: "transcript_id is required." }, 400);

      const { data, error } = await db
        .from("transcript_corrections")
        .select(SELECT_COLUMNS)
        .eq("transcript_id", transcriptId)
        .neq("status", "rejected")
        .order("segment_index", { ascending: true })
        .limit(500);

      if (error) {
        console.error("[transcript-corrections] read", error);
        return jsonResponse({ error: "Could not load corrections." }, 500);
      }

      return new Response(JSON.stringify({ corrections: data ?? [] }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    // ── Write ───────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      const auth = await requireDeHubAuth(req);
      if (!auth.ok) return auth.response;

      const payload = await req.json().catch(() => null);
      if (!payload) return jsonResponse({ error: "Invalid JSON body." }, 400);

      // Withdraw your own
      if (payload.remove_correction_id) {
        const { error } = await db
          .from("transcript_corrections")
          .delete()
          .eq("id", payload.remove_correction_id)
          .eq("address", auth.wallet);

        if (error) {
          console.error("[transcript-corrections] delete", error);
          return jsonResponse({ error: "Could not remove that correction." }, 500);
        }
        return jsonResponse({ ok: true });
      }

      // Vote on someone else's
      if (payload.correction_id) {
        const vote = Number(payload.vote);
        if (vote !== 1 && vote !== -1 && vote !== 0) {
          return jsonResponse({ error: "vote must be 1, -1 or 0 to clear." }, 400);
        }

        if (vote === 0) {
          const { error } = await db
            .from("transcript_correction_votes")
            .delete()
            .eq("correction_id", payload.correction_id)
            .eq("address", auth.wallet);
          if (error) {
            console.error("[transcript-corrections] unvote", error);
            return jsonResponse({ error: "Could not clear your vote." }, 500);
          }
          return jsonResponse({ ok: true });
        }

        const { error } = await db
          .from("transcript_correction_votes")
          .upsert(
            { correction_id: payload.correction_id, address: auth.wallet, vote },
            { onConflict: "correction_id,address" },
          );

        if (error) {
          console.error("[transcript-corrections] vote", error);
          return jsonResponse({ error: "Could not record your vote." }, 500);
        }
        return jsonResponse({ ok: true });
      }

      // Submit a fix
      const transcriptId = String(payload.transcript_id ?? "").trim();
      const segmentIndex = Number(payload.segment_index);
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      const originalText = typeof payload.original_text === "string" ? payload.original_text : "";

      if (!transcriptId) return jsonResponse({ error: "transcript_id is required." }, 400);
      if (!Number.isInteger(segmentIndex) || segmentIndex < 0) {
        return jsonResponse({ error: "segment_index must be a line number." }, 400);
      }
      if (!text) return jsonResponse({ error: "The corrected line cannot be empty." }, 400);
      if (text.length > MAX_TEXT) {
        return jsonResponse({ error: `That is longer than a caption line (max ${MAX_TEXT}).` }, 400);
      }
      if (text === originalText.trim()) {
        return jsonResponse({ error: "That is what the line already says." }, 400);
      }

      const { count, error: countError } = await db
        .from("transcript_corrections")
        .select("id", { count: "exact", head: true })
        .eq("transcript_id", transcriptId)
        .eq("address", auth.wallet);

      if (countError) {
        console.error("[transcript-corrections] count", countError);
        return jsonResponse({ error: "Could not save that correction." }, 500);
      }
      if ((count ?? 0) >= MAX_PER_PERSON) {
        return jsonResponse(
          { error: `You have already corrected ${MAX_PER_PERSON} lines here.` },
          429,
        );
      }

      const { data, error } = await db
        .from("transcript_corrections")
        .upsert(
          {
            transcript_id: transcriptId,
            segment_index: segmentIndex,
            original_text: originalText,
            text,
            address: auth.wallet,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "transcript_id,segment_index,address" },
        )
        .select(SELECT_COLUMNS)
        .single();

      if (error) {
        console.error("[transcript-corrections] insert", error);
        return jsonResponse({ error: "Could not save that correction." }, 500);
      }

      // The author counts as its first vote, so a single disagreement does not
      // read as a majority against.
      await db
        .from("transcript_correction_votes")
        .upsert(
          { correction_id: data.id, address: auth.wallet, vote: 1 },
          { onConflict: "correction_id,address" },
        );

      return jsonResponse({ correction: data });
    }

    return jsonResponse({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("[transcript-corrections]", error);
    return jsonResponse({ error: "Unexpected error." }, 500);
  }
});

// santa-score
// ===========
// The only writer to `public.santa_snake_scores`. The table used to accept
// inserts and updates from anyone with the anon key, which meant any wallet
// could be handed any score. Writes now go through here: the wallet is the
// one the DeHub token verifies to, and a run only lands if it beats that
// wallet's own best. Reads stay direct — the board is public.

import {
  checkRateLimit,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
} from "../_shared/auth.ts";

/** A snake run cannot plausibly score past this; anything larger is a script. */
const MAX_SCORE = 1_000_000;
const MAX_USERNAME = 40;
const SUBMIT_LIMIT = { limit: 30, windowMs: 60 * 1000 };

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;
    const wallet = auth.wallet;

    const supabase = serviceClient();
    const rl = await checkRateLimit(supabase, wallet, "santa-score", SUBMIT_LIMIT);
    if (!rl.allowed) {
      return jsonResponse({ error: `Too many submissions. Try again after ${rl.resetAt.toISOString()}.` }, 429);
    }

    let body: { score?: unknown; username?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const score = typeof body.score === "number" ? Math.round(body.score) : NaN;
    if (!Number.isInteger(score) || score <= 0 || score > MAX_SCORE) {
      return jsonResponse({ error: "score must be a positive integer" }, 400);
    }
    const username = typeof body.username === "string"
      ? body.username.trim().slice(0, MAX_USERNAME) || null
      : null;

    const { data: existing, error: readErr } = await supabase
      .from("santa_snake_scores")
      .select("score")
      .eq("wallet_address", wallet)
      .maybeSingle();
    if (readErr) {
      console.error("[santa-score] read failed:", readErr);
      return jsonResponse({ error: "Could not read the board" }, 500);
    }

    const best = typeof existing?.score === "number" ? existing.score : 0;
    if (existing && best >= score) {
      return jsonResponse({ ok: true, improved: false, best });
    }

    const { error: writeErr } = await supabase
      .from("santa_snake_scores")
      .upsert(
        { wallet_address: wallet, username, score, updated_at: new Date().toISOString() },
        { onConflict: "wallet_address" },
      );
    if (writeErr) {
      console.error("[santa-score] write failed:", writeErr);
      return jsonResponse({ error: "Could not save the score" }, 500);
    }

    return jsonResponse({ ok: true, improved: true, best: score });
  } catch (err) {
    console.error("[santa-score] error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

/**
 * @assistant on the feature-request board.
 * ========================================
 *
 * Somebody tags @assistant in a thread at dehub.io/features and this writes
 * the reply. The board is where DeHub talks to the people who took the time to
 * report something — a request gets marked shipped, the reporter comes back
 * with "still broken on Android" or "thanks, does it do X too", and until now
 * nobody answered until a human happened to scroll past. That reply is the
 * whole relationship with the reporter, so it gets the strong model and the
 * team's voice.
 *
 * Shape of the thing:
 *
 * - The client calls this straight after posting a comment that mentions the
 *   assistant, with that comment's id. The caller proves who they are with
 *   their DeHub token, which is also what the per-wallet rate limit counts.
 * - Everything the reply is based on — the mention, the request, the thread —
 *   is read back out of Postgres here rather than trusted from the body. A
 *   caller can name a comment; it cannot describe one.
 * - The answer comes from `general-ai-chat` on the **chat** surface, which is
 *   the scope that withholds every `self` tool. A board thread is public, and
 *   an assistant-surface answer would happily read the asker's wallet into it.
 *   The service secret is what unlocks the board voice (`threadContext`) and
 *   nothing else.
 * - The reply is written as an ordinary row owned by the assistant account, so
 *   the existing notification triggers tell the reporter exactly as they would
 *   for a human reply, and the thread renders it with no client change.
 *
 * Idempotent: a second call for the same mention finds the reply already there
 * and does nothing. That matters because the client may retry, and because the
 * board has no realtime channel to tell it the first one landed.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  serviceClient,
  checkRateLimit,
} from "../_shared/auth.ts";

/**
 * The assistant's real account. Not a placeholder — @assistant is a live
 * DeHub account with its own display name and avatar, and writing a different
 * address here creates a second, nameless one.
 */
const ASSISTANT_WALLET = (
  Deno.env.get("ASSISTANT_WALLET_ADDRESS") || "0xea0fe14398b96f3ae97f222a6cf0f933c1ccf61c"
).toLowerCase();

const DEHUB_API_BASE = "https://api.dehub.io";

/**
 * The same trigger the chat and feed bot use, kept deliberately narrow.
 *
 * `@dehub` is NOT in here. It is a real user's handle, and an earlier version
 * of the chat regex matched it — so every time somebody said @dehub the bot
 * answered on that person's behalf. `@assistant` only, word-bounded so
 * `@assistantx` is somebody else.
 */
const MENTION_RE = /(^|[^a-zA-Z0-9_])@assistant(?![a-zA-Z0-9_])/i;

/** How much of the thread the model gets to read. */
const THREAD_WINDOW = 20;

interface CommentRow {
  id: string;
  feature_request_id: string;
  wallet_address: string;
  username: string | null;
  content: string;
  parent_id: string | null;
  created_at: string;
}

/**
 * The avatar path for the assistant account, as the board stores it: a path
 * the client expands, never an absolute URL.
 *
 * Best effort. A reply with no avatar is still a reply, and the account lookup
 * is not worth failing the whole thing over.
 */
async function assistantAvatar(): Promise<string | null> {
  try {
    const res = await fetch(`${DEHUB_API_BASE}/api/account_info/${ASSISTANT_WALLET}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const account = body?.result ?? body?.data ?? body;
    return (
      account?.avatarImageUrl || account?.avatarUrl || account?.avatar_url || null
    );
  } catch {
    return null;
  }
}

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    // Identity is the DeHub token, same as every other write path. This is not
    // about protecting the assistant's words — it is that an unauthenticated
    // endpoint which spends model time is an endpoint somebody will spend for
    // us.
    const auth = await requireDeHubAuth(req);
    if (!auth.ok) return auth.response;

    const sb = serviceClient();
    const limited = await checkRateLimit(sb, `wallet:${auth.wallet}`, "feature-request-assistant", {
      limit: 12,
      windowMs: 60 * 60 * 1000,
    });
    if (!limited.allowed) {
      return jsonResponse(
        { error: `Too many assistant mentions. Try again after ${limited.resetAt.toISOString()}.` },
        429,
      );
    }

    const { commentId } = (await req.json()) as { commentId?: string };
    if (!commentId) return jsonResponse({ error: "commentId is required" }, 400);

    const { data: mentionRow, error: mentionError } = await sb
      .from("feature_request_comments")
      .select("id, feature_request_id, wallet_address, username, content, parent_id, created_at")
      .eq("id", commentId)
      .maybeSingle();
    if (mentionError) throw mentionError;
    const mention = mentionRow as CommentRow | null;
    if (!mention) return jsonResponse({ error: "Comment not found" }, 404);

    // Read the trigger off the stored row, not off the request. Also stops the
    // assistant answering itself, which a thread of two bots would do forever.
    if (!MENTION_RE.test(mention.content)) {
      return jsonResponse({ skipped: "no assistant mention" });
    }
    if (mention.wallet_address.toLowerCase() === ASSISTANT_WALLET) {
      return jsonResponse({ skipped: "assistant mentioned itself" });
    }

    // The board shows one visible level of replies, so a reply to a reply hangs
    // off the same root the UI is already rendering.
    const rootId = mention.parent_id ?? mention.id;

    const { data: existing } = await sb
      .from("feature_request_comments")
      .select("id")
      .eq("feature_request_id", mention.feature_request_id)
      .eq("parent_id", rootId)
      .eq("wallet_address", ASSISTANT_WALLET)
      .gte("created_at", mention.created_at)
      .limit(1);
    if (existing && existing.length > 0) {
      return jsonResponse({ skipped: "already answered", commentId: existing[0].id });
    }

    const [{ data: request }, { data: threadRows }] = await Promise.all([
      sb
        .from("feature_requests")
        .select("id, title, description, status, category, shipped_url")
        .eq("id", mention.feature_request_id)
        .maybeSingle(),
      sb
        .from("feature_request_comments")
        .select("wallet_address, username, content, created_at")
        .eq("feature_request_id", mention.feature_request_id)
        .order("created_at", { ascending: false })
        .limit(THREAD_WINDOW),
    ]);

    const thread = ((threadRows ?? []) as Array<{
      wallet_address: string;
      username: string | null;
      content: string;
    }>)
      .slice()
      .reverse()
      .map((row) => ({
        author: row.username ? `@${row.username}` : row.wallet_address.slice(0, 8),
        content: row.content.slice(0, 600),
        isTeam: row.wallet_address.toLowerCase() === ASSISTANT_WALLET,
      }));

    const serviceSecret = Deno.env.get("ASSISTANT_SERVICE_SECRET");
    if (!serviceSecret) {
      // Without it the brain would answer in the public-chat-room voice, which
      // reads as a stranger wandering into somebody's bug report. Better to say
      // nothing than to say it in the wrong voice.
      console.error("[feature-request-assistant] ASSISTANT_SERVICE_SECRET is not set");
      return jsonResponse({ error: "Assistant is not configured" }, 503);
    }

    const brainUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/general-ai-chat`;
    const brainRes = await fetch(brainUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-assistant-secret": serviceSecret,
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        surface: "chat",
        maxReplyChars: 700,
        callerAddress: mention.wallet_address,
        threadContext: {
          kind: "feature_request",
          title: request?.title ?? null,
          status: request?.status ?? null,
          category: request?.category ?? null,
          body: request?.description ? String(request.description).slice(0, 1200) : null,
          shippedUrl: request?.shipped_url ?? null,
          thread,
        },
        messages: [
          {
            role: "user",
            content: `${mention.username ? `@${mention.username}` : "Someone"} tagged you in this thread:\n\n${mention.content.slice(0, 1500)}`,
          },
        ],
      }),
    });

    if (!brainRes.ok) {
      const detail = await brainRes.text().catch(() => "");
      console.error(`[feature-request-assistant] brain ${brainRes.status}: ${detail.slice(0, 300)}`);
      return jsonResponse({ error: "Assistant could not answer right now" }, 502);
    }

    const brain = await brainRes.json();
    const reply = String(brain?.response ?? "").trim();
    if (!reply) return jsonResponse({ error: "Assistant returned nothing" }, 502);

    const { data: inserted, error: insertError } = await sb
      .from("feature_request_comments")
      .insert({
        feature_request_id: mention.feature_request_id,
        wallet_address: ASSISTANT_WALLET,
        username: "assistant",
        avatar: await assistantAvatar(),
        // Threads on this platform carry the "@name " prefix, which is also
        // what tells the person who tagged us that this is aimed at them.
        content: mention.username ? `@${mention.username} ${reply}` : reply,
        parent_id: rootId,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    return jsonResponse({ ok: true, commentId: inserted.id });
  } catch (error) {
    console.error("[feature-request-assistant] failed:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

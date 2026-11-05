/**
 * notification-relay
 * ==================
 * Hands the Riftn API the notifications written on this side, so it can push
 * (and, for replies and verdicts, email) them. The Requests board, governance
 * polls, the DAO, bounties, stages, communities and mini apps all write their
 * rows into `custom_notifications` from database triggers. Those rows showed
 * in the bell and the app list, but no phone or browser was ever told.
 *
 * GET ?after=<created_at>&afterId=<uuid>&limit=<n>
 *   → { rows: [...] } oldest first, strictly after the (created_at, id) cursor.
 *     With no cursor, returns { rows: [], cursor } pointing at the newest row,
 *     so a first run starts from now instead of replaying the whole table.
 *
 * Called by the Riftn API only: x-internal-secret = INTERNAL_SERVICE_SECRET.
 */
import { jsonResponse, serviceClient } from "../_shared/auth.ts";

function allowed(req: Request): boolean {
  const secret = Deno.env.get("INTERNAL_SERVICE_SECRET");
  const got = req.headers.get("x-internal-secret") ?? "";
  if (!secret || got.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS =
  "id, recipient_address, actor_address, actor_username, actor_avatar, type, content, reference_id, reference_title, reference_comment_id, read, created_at";

Deno.serve(async (req) => {
  if (!allowed(req)) return jsonResponse({ error: "unauthorized" }, 401);
  if (req.method !== "GET") return jsonResponse({ error: "GET only" }, 405);
  const db = serviceClient();
  const url = new URL(req.url);
  const after = url.searchParams.get("after") ?? "";
  const afterId = url.searchParams.get("afterId") ?? "";
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));

  try {
    if (!/^[0-9T:.+\- Z]{10,40}$/.test(after) || Number.isNaN(Date.parse(after)) || !UUID.test(afterId)) {
      const { data, error } = await db
        .from("custom_notifications")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1);
      if (error) throw error;
      const newest = data?.[0];
      return jsonResponse({ rows: [], cursor: newest ? { after: newest.created_at, afterId: newest.id } : null });
    }

    const { data, error } = await db
      .from("custom_notifications")
      .select(COLUMNS)
      .or(`created_at.gt."${after}",and(created_at.eq."${after}",id.gt.${afterId})`)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return jsonResponse({ rows: data ?? [] });
  } catch (e) {
    console.error("[notification-relay]", e);
    return jsonResponse({ error: "failed" }, 500);
  }
});

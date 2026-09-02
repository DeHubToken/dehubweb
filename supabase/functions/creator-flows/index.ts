// Creator Flow API — persistence and sharing for the node canvas on /creator/flow.
//
// Ported from HeliosGen's spaces / publish / folders API routes
// (github.com/segfault42/heliosgen, MIT) onto DeHub's stack: one edge function,
// wallet-native auth (x-wallet-address + x-dehub-token, verified against
// api.dehub.io) and Postgres via the service role, the same shape as
// builder-api. The public read is the one unauthenticated action.
import {
  handleCorsPreflight,
  jsonResponse,
  requireDeHubAuth,
  checkRateLimit,
  rateLimitByIp,
  serviceClient,
} from "../_shared/auth.ts";

type Db = ReturnType<typeof serviceClient>;

/** One flow as the client stores it. Mirrors `Space` in creatorFlowStore. */
interface FlowPayload {
  id: string;
  name: string;
  isPublic?: boolean;
  data: {
    nodes?: Array<{ type?: string; data?: Record<string, unknown> }>;
    edges?: unknown[];
    nodeCounters?: Record<string, number>;
    viewport?: { x: number; y: number; zoom: number };
    createdAt?: number;
    updatedAt?: number;
  };
}

const FLOW_ID = /^[a-z0-9]{6,32}$/;
const MAX_FLOW_BYTES = 1_500_000;
const MAX_FLOWS = 100;

/**
 * First finished still in the graph, for the share card. Reference images
 * count too — a flow that has not been run yet is still worth a picture.
 */
function coverFrom(data: FlowPayload["data"]): string | null {
  const nodes = data.nodes ?? [];
  const pick = (type: string, key: string) => {
    for (const n of nodes) {
      if (n.type !== type) continue;
      const url = n.data?.[key];
      if (typeof url === "string" && url.startsWith("http")) return url;
    }
    return null;
  };
  return pick("imageGenNode", "imageUrl") ?? pick("imageInputNode", "imageUrl") ?? null;
}

/** Inline base64 never goes to the database; the durable URL does. */
function stripInline(data: FlowPayload["data"]): FlowPayload["data"] {
  return {
    ...data,
    nodes: (data.nodes ?? []).map((n) => {
      if (!n.data) return n;
      const { inputImage: _inline, ...rest } = n.data as Record<string, unknown> & { inputImage?: unknown };
      return { ...n, data: rest };
    }),
  };
}

function publicRow(row: Record<string, unknown>) {
  const data = (row.data ?? {}) as FlowPayload["data"];
  return {
    id: row.id,
    name: row.name,
    nodes: data.nodes ?? [],
    edges: data.edges ?? [],
    viewport: data.viewport ?? null,
    coverUrl: row.cover_url ?? null,
    updatedAt: row.updated_at,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  let body: {
    action?: string;
    id?: string;
    isPublic?: boolean;
    flows?: FlowPayload[];
    deleteMissing?: boolean;
    name?: string;
    parentId?: string | null;
    orderIndex?: number;
    folderId?: string;
    itemIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const db = serviceClient();

  // ── Public read: no wallet needed, IP-limited ─────────────────────────────
  if (body.action === "public") {
    const ipLimited = await rateLimitByIp(req, "creator_flow_public", { limit: 120, windowMs: 60_000 });
    if (ipLimited) return ipLimited;
    const id = String(body.id ?? "");
    if (!FLOW_ID.test(id)) return jsonResponse({ error: "Flow not found" }, 404);
    const { data: row } = await db
      .from("creator_flows")
      .select("id, name, data, cover_url, is_public, updated_at")
      .eq("id", id)
      .eq("is_public", true)
      .maybeSingle();
    if (!row) return jsonResponse({ error: "Flow not found or not public" }, 404);
    return jsonResponse({ flow: publicRow(row) });
  }

  const auth = await requireDeHubAuth(req);
  if (!auth.ok) return auth.response;
  const { wallet } = auth;

  const rl = await checkRateLimit(db, wallet, "creator_flows", { limit: 240, windowMs: 60_000 });
  if (!rl.allowed) return jsonResponse({ error: "Rate limit exceeded — slow down." }, 429);

  try {
    switch (body.action) {
      // ── Flows ─────────────────────────────────────────────────────────────
      case "list": {
        const { data } = await db
          .from("creator_flows")
          .select("id, name, data, is_public, cover_url, created_at, updated_at")
          .eq("wallet", wallet)
          .order("created_at", { ascending: true })
          .limit(MAX_FLOWS);
        return jsonResponse({
          flows: (data ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            isPublic: row.is_public,
            coverUrl: row.cover_url,
            data: row.data ?? {},
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          })),
        });
      }

      case "save": {
        const flows = Array.isArray(body.flows) ? body.flows : [];
        if (flows.length > MAX_FLOWS) return jsonResponse({ error: `At most ${MAX_FLOWS} flows.` }, 400);
        const rows = [];
        for (const f of flows) {
          if (!f || !FLOW_ID.test(String(f.id ?? ""))) return jsonResponse({ error: "Bad flow id" }, 400);
          const data = stripInline(f.data ?? {});
          const encoded = JSON.stringify(data);
          if (encoded.length > MAX_FLOW_BYTES) {
            return jsonResponse({ error: `Flow "${f.name}" is too large to save (${Math.round(encoded.length / 1024)} KB).` }, 413);
          }
          rows.push({
            id: f.id,
            wallet,
            name: String(f.name ?? "Flow").slice(0, 120) || "Flow",
            data,
            node_count: (data.nodes ?? []).length,
            cover_url: coverFrom(data),
            updated_at: new Date().toISOString(),
          });
        }
        if (rows.length > 0) {
          // is_public is deliberately not in the upsert: it is set by `publish`
          // and the row is the authority for it, so a stale client cannot
          // un-share a flow by saving.
          const { error } = await db.from("creator_flows").upsert(rows, { onConflict: "id" });
          if (error) throw new Error(error.message);
          // A row that belongs to someone else with the same client id is not
          // ours to overwrite; the upsert above cannot express that, so check.
          const { data: owned } = await db
            .from("creator_flows")
            .select("id, wallet")
            .in("id", rows.map((r) => r.id));
          const foreign = (owned ?? []).filter((r) => r.wallet !== wallet);
          if (foreign.length > 0) {
            return jsonResponse({ error: "A flow id collided with another creator's flow." }, 409);
          }
        }
        if (body.deleteMissing) {
          const keep = rows.map((r) => r.id);
          let q = db.from("creator_flows").delete().eq("wallet", wallet);
          if (keep.length > 0) q = q.not("id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
          const { error } = await q;
          if (error) throw new Error(error.message);
        }
        return jsonResponse({ ok: true, savedAt: new Date().toISOString() });
      }

      case "remove": {
        const id = String(body.id ?? "");
        if (!FLOW_ID.test(id)) return jsonResponse({ error: "Bad flow id" }, 400);
        const { error } = await db.from("creator_flows").delete().eq("id", id).eq("wallet", wallet);
        if (error) throw new Error(error.message);
        return jsonResponse({ ok: true });
      }

      case "publish": {
        const id = String(body.id ?? "");
        if (!FLOW_ID.test(id) || typeof body.isPublic !== "boolean") {
          return jsonResponse({ error: "id and isPublic required" }, 400);
        }
        const { data, error } = await db
          .from("creator_flows")
          .update({ is_public: body.isPublic })
          .eq("id", id)
          .eq("wallet", wallet)
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return jsonResponse({ error: "Save the flow before sharing it." }, 404);
        return jsonResponse({ ok: true, isPublic: body.isPublic });
      }

      // ── Folders ───────────────────────────────────────────────────────────
      case "folders.list": {
        const { data: folders, error: fErr } = await db
          .from("creator_folders")
          .select("id, name, parent_id, order_index, created_at")
          .eq("wallet", wallet)
          .order("order_index", { ascending: true });
        if (fErr) throw new Error(fErr.message);
        const { data: items, error: iErr } = await db
          .from("creator_folder_items")
          .select("folder_id, item_id")
          .eq("wallet", wallet);
        if (iErr) throw new Error(iErr.message);
        return jsonResponse({ folders: folders ?? [], folderItems: items ?? [] });
      }

      case "folders.create": {
        const name = String(body.name ?? "").trim().slice(0, 80);
        if (!name) return jsonResponse({ error: "Folder name required" }, 400);
        const { data, error } = await db
          .from("creator_folders")
          .insert({
            wallet,
            name,
            parent_id: body.parentId ?? null,
            order_index: Number.isFinite(body.orderIndex) ? Number(body.orderIndex) : 0,
          })
          .select("id, name, parent_id, order_index, created_at")
          .single();
        if (error) throw new Error(error.message);
        return jsonResponse({ folder: data });
      }

      case "folders.update": {
        const id = String(body.id ?? "");
        if (!id) return jsonResponse({ error: "id required" }, 400);
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.name !== undefined) updates.name = String(body.name).trim().slice(0, 80);
        if (body.parentId !== undefined) updates.parent_id = body.parentId;
        if (body.orderIndex !== undefined) updates.order_index = Number(body.orderIndex) || 0;
        const { error } = await db.from("creator_folders").update(updates).eq("id", id).eq("wallet", wallet);
        if (error) throw new Error(error.message);
        return jsonResponse({ ok: true });
      }

      case "folders.delete": {
        const id = String(body.id ?? "");
        if (!id) return jsonResponse({ error: "id required" }, 400);
        const { error } = await db.from("creator_folders").delete().eq("id", id).eq("wallet", wallet);
        if (error) throw new Error(error.message);
        return jsonResponse({ ok: true });
      }

      case "items.add": {
        const folderId = String(body.folderId ?? "");
        const itemIds = Array.isArray(body.itemIds) ? body.itemIds.map(String).slice(0, 200) : [];
        if (!folderId || itemIds.length === 0) return jsonResponse({ error: "folderId and itemIds required" }, 400);
        const { data: owned } = await db
          .from("creator_folders")
          .select("id")
          .eq("id", folderId)
          .eq("wallet", wallet)
          .maybeSingle();
        if (!owned) return jsonResponse({ error: "Folder not found" }, 404);
        const { error } = await db
          .from("creator_folder_items")
          .upsert(itemIds.map((item_id) => ({ folder_id: folderId, item_id, wallet })), {
            onConflict: "folder_id,item_id",
          });
        if (error) throw new Error(error.message);
        return jsonResponse({ ok: true });
      }

      case "items.remove": {
        const folderId = String(body.folderId ?? "");
        const itemIds = Array.isArray(body.itemIds) ? body.itemIds.map(String) : [];
        if (!folderId || itemIds.length === 0) return jsonResponse({ error: "folderId and itemIds required" }, 400);
        const { error } = await db
          .from("creator_folder_items")
          .delete()
          .eq("folder_id", folderId)
          .eq("wallet", wallet)
          .in("item_id", itemIds);
        if (error) throw new Error(error.message);
        return jsonResponse({ ok: true });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    console.error("creator-flows error:", err);
    return jsonResponse({ error: errorMessage(err) }, 500);
  }
});

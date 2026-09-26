/**
 * Livepeer stream status, read-only
 * =================================
 * The mobile producer screen polls whether its Livepeer stream is active while
 * going live and while ending. It used to call livepeer.studio directly with a
 * Livepeer API key bundled into the APK, which anyone could pull out of the
 * app. This keeps the key server-side and returns only what the poll reads.
 *
 * POST { streamId } or GET ?streamId=
 * Returns { id, playbackId, isActive, lastSeen, createdAt }, or 404 when
 * Livepeer has no such stream (the client treats that as ended).
 *
 * Never returns streamKey or anything else from the raw stream object: the
 * id alone is not a secret, so this must not become a way to read keys.
 */
import { handleCorsPreflight, jsonResponse, rateLimitByIp } from "../_shared/auth.ts";

const LIVEPEER_BASE = "https://livepeer.studio/api";
const CACHE_TTL_MS = 5_000;
const STREAM_ID = /^[A-Za-z0-9-]{8,64}$/;

type CacheEntry = { at: number; status: number; body: unknown };
const cache = new Map<string, CacheEntry>();

function pruneCache(now: number) {
  if (cache.size < 500) return;
  for (const [k, v] of cache) if (now - v.at > CACHE_TTL_MS) cache.delete(k);
}

async function readStreamId(req: Request): Promise<string> {
  if (req.method === "GET") return new URL(req.url).searchParams.get("streamId") || "";
  try {
    const body = await req.json();
    return typeof body?.streamId === "string" ? body.streamId : "";
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // One producer polls about every 10s for at most a minute per transition;
  // this leaves room for carrier NAT sharing an IP while capping scripted use.
  const limited = await rateLimitByIp(req, "livepeer-stream-status", { limit: 240, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const streamId = (await readStreamId(req)).trim();
  if (!STREAM_ID.test(streamId)) return jsonResponse({ error: "Invalid streamId" }, 400);

  const now = Date.now();
  const hit = cache.get(streamId);
  if (hit && now - hit.at < CACHE_TTL_MS) return jsonResponse(hit.body, hit.status);

  const apiKey = Deno.env.get("LIVEPEER_API_KEY");
  if (!apiKey) {
    console.error("[livepeer-stream-status] LIVEPEER_API_KEY not configured");
    return jsonResponse({ error: "Stream status not available" }, 503);
  }

  try {
    const res = await fetch(`${LIVEPEER_BASE}/stream/${encodeURIComponent(streamId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });

    let entry: CacheEntry;
    if (res.status === 404) {
      entry = { at: now, status: 404, body: { error: "Stream not found" } };
    } else if (!res.ok) {
      console.error(`[livepeer-stream-status] Livepeer ${res.status} for ${streamId}`);
      return jsonResponse({ error: "Upstream error" }, 502);
    } else {
      const s = await res.json();
      entry = {
        at: now,
        status: 200,
        body: {
          id: s?.id ?? streamId,
          playbackId: s?.playbackId ?? null,
          isActive: s?.isActive === true,
          lastSeen: typeof s?.lastSeen === "number" ? s.lastSeen : null,
          createdAt: typeof s?.createdAt === "number" ? s.createdAt : null,
        },
      };
    }

    pruneCache(now);
    cache.set(streamId, entry);
    return jsonResponse(entry.body, entry.status);
  } catch (error) {
    console.error("[livepeer-stream-status] Error:", error);
    return jsonResponse({ error: "Upstream error" }, 502);
  }
});

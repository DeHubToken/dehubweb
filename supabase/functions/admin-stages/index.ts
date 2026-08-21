import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Admin stage moderation
 * ======================
 * The moderation work for Stages (`audio_spaces`) has to happen *here*, and
 * that is not a style choice.
 *
 * `audio_spaces` write policies gate on `get_request_wallet_address()` — the
 * host's wallet. An admin has no wallet, so an anon-key call returns 200 and
 * affects zero rows, which reads as "it worked". Only a service-role key
 * bypasses RLS.
 *
 * The obvious home for that key was the NestJS backend on the droplet, and
 * that is what the first cut did. It cannot work: this Supabase project is
 * managed by Lovable Cloud, which injects SUPABASE_SERVICE_ROLE_KEY into edge
 * functions and never discloses it. There is no dashboard to copy it from and
 * no Secrets row holding it, so no other machine can ever be given it. The key
 * only exists in this process — so the privileged work has to live in this
 * process too.
 *
 * Auth is the caller's *admin* bearer token, checked against the admin API
 * rather than trusted. That keeps the panel's existing login as the single
 * source of truth for who is an admin, and means this function holds no shared
 * secret of its own — nothing to rotate, nothing to leak, and no second place
 * where an admin can be minted. It is the same shape as `requireDeHubAuth`
 * elsewhere in this directory, pointed at the admin API instead.
 *
 * verify_jwt is off (see config.toml): the credential is an admin JWT issued
 * by api.dehub.io, not a Supabase one, so the platform check would reject
 * every legitimate call.
 */

const ADMIN_API_BASE = Deno.env.get("ADMIN_API_BASE") || "https://api.dehub.io";

/** The bucket dehubweb uploads stage recordings to. */
const RECORDINGS_BUCKET = "stage-recordings";

/** api.dehub.io has no timeout of its own; don't inherit an unbounded wait. */
const ADMIN_VERIFY_TIMEOUT_MS = 8_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

/**
 * Roles allowed to *see* the tab versus roles allowed to change something.
 * Mirrors the admin panel's own gating and the livestream force-end it was
 * modelled on — a VIEWER can look, only SUPER_ADMIN and ADMIN can act.
 */
const READ_ROLES = ["SUPER_ADMIN", "ADMIN", "MODERATOR", "VIEWER"];
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

interface Admin {
  id: string;
  email: string;
  role: string;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Verify the bearer token by asking the admin API who it belongs to.
 *
 * Deliberately not a local JWT verification: that would need
 * ADMIN_JWT_SECRET_KEY copied here, which is exactly the "one more place
 * holding a secret" this design exists to avoid. `GET /api/admin/me` already
 * runs the same guard every other admin route runs, so a revoked or expired
 * token stops working here the moment it stops working everywhere else.
 */
async function requireAdmin(req: Request): Promise<Admin> {
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    throw new HttpError(401, "Missing authorization token");
  }

  let response: Response;
  try {
    response = await fetch(`${ADMIN_API_BASE}/api/admin/me`, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(ADMIN_VERIFY_TIMEOUT_MS),
    });
  } catch (e) {
    // The admin API being unreachable is not the caller's fault, and it must
    // not read as "you are not an admin" — that would send the panel to the
    // login screen and lose the operator's session over a blip.
    throw new HttpError(503, `Could not reach the admin API: ${(e as Error).message}`);
  }

  if (response.status === 401 || response.status === 400) {
    throw new HttpError(401, "Authentication required");
  }
  if (!response.ok) {
    throw new HttpError(503, `Admin API rejected the check (${response.status})`);
  }

  const body = await response.json().catch(() => null);
  const admin = body?.admin;
  if (!admin?._id && !admin?.id) throw new HttpError(401, "Authentication required");
  if (admin.isActive === false) throw new HttpError(403, "This admin account is disabled");

  const role = String(admin.role || "").toUpperCase();
  if (!READ_ROLES.includes(role)) throw new HttpError(403, "Not permitted");

  return { id: String(admin._id || admin.id), email: admin.email || "", role };
}

function requireWriteRole(admin: Admin): void {
  if (!WRITE_ROLES.includes(admin.role)) {
    throw new HttpError(403, "Your role cannot change a stage");
  }
}

// ── Transport ────────────────────────────────────────────────────────────────

/**
 * The service-role key bypasses RLS. It is read per-request from the
 * environment and never returned, logged, or echoed into an error body — an
 * error from PostgREST is truncated before it goes back to the caller so a
 * failure cannot become a disclosure.
 */
function credentials(): { url: string; key: string } {
  const url = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) {
    throw new HttpError(503, "Stage moderation is not configured on this deployment");
  }
  return { url, key };
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, key } = credentials();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new HttpError(502, `Stages database rejected the request (${response.status}): ${body.slice(0, 200)}`);
  }
  return response;
}

/** PostgREST quoting: a comma or paren in a search term would split the filter. */
function quote(term: string): string {
  return `"${term.replace(/["\\]/g, "")}"`;
}

// ── Read ─────────────────────────────────────────────────────────────────────

async function listStages(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 20) || 20));
  const from = (page - 1) * limit;

  const params = new URLSearchParams();
  params.set("select", "*");

  const status = url.searchParams.get("status") || "all";
  if (status !== "all") params.set("status", `eq.${status}`);

  const recording = url.searchParams.get("recording") || "all";
  if (recording === "recorded") params.set("recording_url", "not.is.null");
  else if (recording === "unrecorded") params.set("recording_url", "is.null");

  const search = (url.searchParams.get("search") || "").trim().slice(0, 100);
  if (search) {
    const t = quote(`*${search}*`);
    params.set("or", `(title.ilike.${t},host_username.ilike.${t},host_wallet_address.ilike.${t})`);
  }

  // Only allow columns that exist — an arbitrary `order` would be a 400 from
  // PostgREST that surfaces as a broken page rather than an ignored filter.
  const sortable = ["created_at", "started_at", "ended_at", "scheduled_at", "total_listens"];
  const sortBy = sortable.includes(url.searchParams.get("sortBy") || "")
    ? url.searchParams.get("sortBy")
    : "created_at";
  const sortOrder = url.searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
  // nullslast matters: sorting ended stages by ended_at otherwise floats every
  // scheduled row (ended_at null) to the top of a descending list.
  params.set("order", `${sortBy}.${sortOrder}.nullslast`);

  const response = await rest(`/rest/v1/audio_spaces?${params.toString()}`, {
    headers: { Prefer: "count=exact", Range: `${from}-${from + limit - 1}` },
  });

  // `content-range` looks like "0-19/431"; the tail is the unpaged total.
  const total = Number((response.headers.get("content-range") || "").split("/")[1]) || 0;
  const items = await response.json();

  return { page, limit, total, items };
}

/** Accepts either the uuid or the short share id (/stages/7). */
// deno-lint-ignore no-explicit-any
async function findStage(id: string): Promise<any> {
  const column = /^\d+$/.test(id) ? "short_id" : "id";
  const response = await rest(
    `/rest/v1/audio_spaces?select=*&${column}=eq.${encodeURIComponent(id)}&limit=1`,
  );
  const rows = await response.json();
  if (!rows.length) throw new HttpError(404, "Stage not found");
  return rows[0];
}

async function getStage(id: string) {
  const stage = await findStage(id);

  // Attendance is counted from participant rows, not speaker_count /
  // listener_count: those are a *live* headcount and read whatever the room
  // emptied out to once a stage ends, which is normally zero. Participant rows
  // persist — leaving sets left_at.
  const attendedResponse = await rest(
    `/rest/v1/space_participants?select=id&space_id=eq.${encodeURIComponent(stage.id)}`,
    { headers: { Prefer: "count=exact", Range: "0-0" } },
  );
  const attended =
    Number((attendedResponse.headers.get("content-range") || "").split("/")[1]) || 0;

  return { stage, attended };
}

// ── Write ────────────────────────────────────────────────────────────────────

async function forceEndStage(id: string) {
  const stage = await findStage(id);
  if (stage.status === "ended") {
    return { success: true, message: "Stage had already ended", stage };
  }

  const response = await rest(`/rest/v1/audio_spaces?id=eq.${encodeURIComponent(stage.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "ended", ended_at: new Date().toISOString() }),
  });
  const [updated] = await response.json();

  return { success: true, message: "Stage force-ended", stage: updated || stage };
}

/**
 * Best-effort removal of the audio file itself. A recording whose object is
 * already gone (or whose URL predates the current bucket layout) must not
 * block taking the stage down, so a failure here is logged, not thrown.
 */
async function removeRecordingObject(recordingUrl: string): Promise<void> {
  const path = recordingUrl.split(`/${RECORDINGS_BUCKET}/`)[1];
  if (!path) return;
  try {
    await rest(`/storage/v1/object/${RECORDINGS_BUCKET}/${decodeURIComponent(path)}`, {
      method: "DELETE",
    });
  } catch (e) {
    console.warn("[admin-stages] could not remove recording object:", (e as Error).message);
  }
}

/**
 * Drop the recording but keep the stage. The announcement, its chat and its
 * numbers are often fine when only the audio is the problem, and deleting the
 * row would take a post's embed card down with it.
 */
async function deleteRecording(id: string) {
  const stage = await findStage(id);
  if (!stage.recording_url) {
    return { success: true, message: "Stage has no recording", stage };
  }

  await removeRecordingObject(stage.recording_url);

  const response = await rest(`/rest/v1/audio_spaces?id=eq.${encodeURIComponent(stage.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ recording_url: null }),
  });
  const [updated] = await response.json();

  return { success: true, message: "Recording deleted", stage: updated || stage };
}

async function deleteStage(id: string) {
  const stage = await findStage(id);

  // Storage first: the row is what tells us where the file is, so deleting it
  // in the other order strands the recording in the bucket forever.
  if (stage.recording_url) await removeRecordingObject(stage.recording_url);

  await rest(`/rest/v1/audio_spaces?id=eq.${encodeURIComponent(stage.id)}`, { method: "DELETE" });

  return { success: true, message: "Stage deleted" };
}

// ── Routing ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    // Edge functions do their own CORS — the platform adds none. A missing
    // preflight answer here fails in the browser as an opaque network error
    // with nothing in the function logs.
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = await requireAdmin(req);

    const url = new URL(req.url);
    // Path arrives as /admin-stages[/<id>[/end|/recording]].
    const segments = url.pathname.split("/").filter(Boolean);
    const fnIndex = segments.indexOf("admin-stages");
    const [id, action] = fnIndex === -1 ? segments : segments.slice(fnIndex + 1);

    if (req.method === "GET" && !id) {
      return json(await listStages(url));
    }
    if (req.method === "GET" && id && !action) {
      return json(await getStage(id));
    }
    if (req.method === "POST" && id && action === "end") {
      requireWriteRole(admin);
      return json(await forceEndStage(id));
    }
    if (req.method === "DELETE" && id && action === "recording") {
      requireWriteRole(admin);
      return json(await deleteRecording(id));
    }
    if (req.method === "DELETE" && id && !action) {
      requireWriteRole(admin);
      return json(await deleteStage(id));
    }

    return json({ message: "Not found" }, 404);
  } catch (e) {
    if (e instanceof HttpError) {
      return json({ message: e.message }, e.status);
    }
    console.error("[admin-stages] unhandled:", e);
    return json({ message: "Unexpected error" }, 500);
  }
});

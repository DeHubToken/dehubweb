import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Admin transcript access
 * =======================
 * The panel could not see a transcript on any screen. It now can, and it has
 * to happen here rather than in the panel or the backend, for the reason
 * `admin-stages` exists: transcripts live in dehubweb's Supabase, which is
 * Lovable Cloud, which injects SUPABASE_SERVICE_ROLE_KEY into edge functions
 * and discloses it nowhere. No other machine can ever hold that key, so the
 * privileged work lives where the key already is.
 *
 * Auth is the caller's *admin* bearer token, checked against `GET
 * /api/admin/me` rather than trusted. Same shape as `admin-stages`: the
 * panel's existing login stays the single source of truth for who is an admin,
 * and this function holds no secret of its own.
 *
 * verify_jwt is off (see config.toml): the credential is an admin JWT issued
 * by api.dehub.io, not a Supabase one.
 */

const ADMIN_API_BASE = Deno.env.get("ADMIN_API_BASE") || "https://api.dehub.io";
const ADMIN_VERIFY_TIMEOUT_MS = 8_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

/** A transcript is the most complete record of what a post actually says, so
 *  a moderator needs to read it. Changing one is a moderation act. */
const READ_ROLES = ["SUPER_ADMIN", "ADMIN", "MODERATOR", "VIEWER"];
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "MODERATOR"];
/** Deleting the text outright, as opposed to hiding it, is narrower. */
const DELETE_ROLES = ["SUPER_ADMIN", "ADMIN"];

const KINDS = ["video", "stage", "live", "audio"];
const VISIBILITIES = ["public", "members", "private"];

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
    // Unreachable admin API is not the caller's fault and must not read as
    // "you are not an admin" — that sends the panel to the login screen and
    // loses the operator's session over a blip.
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

function requireRole(admin: Admin, roles: string[], what: string): void {
  if (!roles.includes(admin.role)) throw new HttpError(403, `Your role cannot ${what}`);
}

// ── Transport ────────────────────────────────────────────────────────────────

function credentials(): { url: string; key: string } {
  const url = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) {
    throw new HttpError(503, "Transcripts are not configured on this deployment");
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
    // Truncated so a PostgREST failure cannot become a disclosure.
    throw new HttpError(502, `Transcript store rejected the request (${response.status}): ${body.slice(0, 200)}`);
  }
  return response;
}

// ── Read ─────────────────────────────────────────────────────────────────────

const LIST_COLUMNS =
  "id,source_kind,source_ref,status,provider,model,source_lang,duration_seconds," +
  "summary,summary_status,visibility,attempts,error,created_at,updated_at";

/** Enough of the line to see why it matched, without shipping a whole hour of
 *  speech into a table cell. */
function snippet(text: string, term: string, radius = 140): string {
  if (!text) return "";
  const at = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at < 0) return text.slice(0, radius * 2).trim();
  const from = Math.max(0, at - radius);
  const to = Math.min(text.length, at + term.length + radius);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

async function listTranscripts(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 20) || 20));
  const from = (page - 1) * limit;

  const q = (url.searchParams.get("q") || "").trim();
  const params = new URLSearchParams();
  // The full text rides along only when it is being searched, because it is
  // the one column that can be megabytes.
  params.set("select", q ? `${LIST_COLUMNS},full_text` : LIST_COLUMNS);

  const kind = url.searchParams.get("kind") || "all";
  if (kind !== "all") {
    if (!KINDS.includes(kind)) throw new HttpError(400, `Unknown kind '${kind}'`);
    params.set("source_kind", `eq.${kind}`);
  }

  const status = url.searchParams.get("status") || "all";
  if (status !== "all") params.set("status", `eq.${status}`);

  const visibility = url.searchParams.get("visibility") || "all";
  if (visibility !== "all") {
    if (!VISIBILITIES.includes(visibility)) throw new HttpError(400, `Unknown visibility '${visibility}'`);
    params.set("visibility", `eq.${visibility}`);
  }

  // The point of the index. `plfts` is plainto_tsquery, so a phrase typed the
  // way a person types it works without them learning tsquery syntax.
  if (q) params.set("search_tsv", `plfts(simple).${q}`);

  const sortBy = url.searchParams.get("sortBy") || "created_at";
  const allowedSorts = ["created_at", "updated_at", "duration_seconds", "status"];
  const column = allowedSorts.includes(sortBy) ? sortBy : "created_at";
  const direction = url.searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
  params.set("order", `${column}.${direction}`);

  const response = await rest(`/rest/v1/transcripts?${params.toString()}`, {
    headers: { Prefer: "count=exact", Range: `${from}-${from + limit - 1}` },
  });
  // The unpaged total is in the content-range header (`0-19/431`), not the
  // row count.
  const total = Number((response.headers.get("content-range") || "").split("/")[1] || 0);
  const rows = await response.json();

  const items = (rows as any[]).map((r) => {
    const { full_text, ...rest } = r;
    return q ? { ...rest, match: snippet(String(full_text ?? ""), q) } : rest;
  });

  return { page, limit, total, items };
}

async function getTranscript(id: string) {
  const response = await rest(
    `/rest/v1/transcripts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  const [row] = await response.json();
  if (!row) throw new HttpError(404, "Transcript not found");

  const translations = await (await rest(
    `/rest/v1/transcript_translations?transcript_id=eq.${encodeURIComponent(id)}` +
    `&select=language,status,error,updated_at&order=language.asc`,
  )).json();

  return { transcript: row, translations };
}

// ── Write ────────────────────────────────────────────────────────────────────

async function setVisibility(id: string, body: any) {
  const next = String(body?.visibility ?? "");
  if (!VISIBILITIES.includes(next)) {
    throw new HttpError(400, `visibility must be one of ${VISIBILITIES.join(", ")}`);
  }

  const response = await rest(`/rest/v1/transcripts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ visibility: next }),
  });
  const [updated] = await response.json();
  if (!updated) throw new HttpError(404, "Transcript not found");

  return { success: true, message: `Transcript is now ${next}`, transcript: updated };
}

/**
 * Re-run it. `force` is what makes this different from the sweeper's retry:
 * a moderator asking for a re-transcribe means the existing text is wrong, not
 * that it is missing, so the attempt budget must not stand in the way.
 */
async function retranscribe(id: string) {
  const { transcript } = await getTranscript(id);
  const { url, key } = credentials();

  await rest(`/rest/v1/transcripts?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ attempts: 0, error: null }),
  });

  const response = await fetch(`${url}/functions/v1/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: transcript.source_kind,
      ref: transcript.source_ref,
      action: "start",
      force: true,
    }),
  });
  const out = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(502, `Could not start a re-transcribe: ${out?.error ?? response.status}`);
  }

  return { success: true, message: "Re-transcribing", status: out?.status ?? "processing" };
}

/**
 * Delete the text, not the post. The sweeper would write it again on its next
 * pass, which is the right behaviour for a bad transcript and the wrong one
 * for text that must not exist — so a delete also pins the row private first,
 * and leaves a tombstone the sweeper skips.
 */
async function deleteTranscript(id: string, body: any) {
  const permanent = body?.permanent === true;

  if (permanent) {
    await rest(`/rest/v1/transcripts?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "empty",
        visibility: "private",
        segments: [],
        full_text: null,
        vtt: null,
        summary: null,
        summary_status: "skipped",
        chapters: [],
        attempts: 99,
        error: "removed by an administrator",
      }),
    });
    await rest(
      `/rest/v1/transcript_translations?transcript_id=eq.${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    return { success: true, message: "Transcript removed and blocked from regenerating" };
  }

  await rest(`/rest/v1/transcript_translations?transcript_id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await rest(`/rest/v1/transcripts?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  return { success: true, message: "Transcript deleted — the sweeper will write a new one" };
}

// ── Routing ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    // Edge functions do their own CORS — the platform adds none, and a missing
    // preflight answer fails in the browser as an opaque network error with
    // nothing in the function logs.
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = await requireAdmin(req);

    const url = new URL(req.url);
    // Path arrives as /admin-transcripts[/<id>[/retranscribe]].
    const segments = url.pathname.split("/").filter(Boolean);
    const fnIndex = segments.indexOf("admin-transcripts");
    const [id, action] = fnIndex === -1 ? segments : segments.slice(fnIndex + 1);

    if (req.method === "GET" && !id) {
      return json(await listTranscripts(url));
    }
    if (req.method === "GET" && id && !action) {
      return json(await getTranscript(id));
    }
    if (req.method === "POST" && id && action === "retranscribe") {
      requireRole(admin, WRITE_ROLES, "re-transcribe a post");
      return json(await retranscribe(id));
    }
    if (req.method === "PATCH" && id && !action) {
      requireRole(admin, WRITE_ROLES, "change who can read a transcript");
      const body = await req.json().catch(() => null);
      return json(await setVisibility(id, body));
    }
    if (req.method === "DELETE" && id && !action) {
      requireRole(admin, DELETE_ROLES, "delete a transcript");
      const body = await req.json().catch(() => ({}));
      return json(await deleteTranscript(id, body));
    }

    return json({ message: "Not found" }, 404);
  } catch (e) {
    if (e instanceof HttpError) {
      return json({ message: e.message }, e.status);
    }
    console.error("[admin-transcripts] unhandled:", e);
    return json({ message: "Unexpected error" }, 500);
  }
});

// DeHub Builder static host — serves the generated app files publicly.
//
// GET /functions/v1/builder-serve/<projectId>/            → index.html
// GET /functions/v1/builder-serve/<projectId>/<file>      → that file
//
// Files live in builder_files (written by builder-api via the service role).
// Only projects with is_public = true are served. The apps are plain static
// HTML/CSS/JS on the Supabase functions origin — fully isolated from dehub.io.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  webmanifest: "application/manifest+json",
  xml: "application/xml; charset=utf-8",
};

function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "text/plain; charset=utf-8";
}

function notFound(message = "Not found"): Response {
  return new Response(message, {
    status: 404,
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") {
    return new Response("GET only", { status: 405, headers: CORS });
  }

  // pathname: /builder-serve/<projectId>[/<file...>]
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const fnIndex = parts.indexOf("builder-serve");
  const projectId = fnIndex >= 0 ? parts[fnIndex + 1] : undefined;
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
    return notFound("Missing or invalid app id");
  }

  // Root without a trailing slash: redirect so relative asset paths resolve.
  const rest = parts.slice(fnIndex + 2).join("/");
  if (!rest && !url.pathname.endsWith("/")) {
    return new Response(null, {
      status: 301,
      headers: { ...CORS, Location: `${url.pathname}/${url.search}` },
    });
  }

  const filePath = decodeURIComponent(rest || "index.html");
  if (filePath.includes("..")) return notFound();

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: project } = await db
    .from("builder_projects")
    .select("id, is_public, status")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || !project.is_public) return notFound("This app does not exist or is private");

  const { data: file } = await db
    .from("builder_files")
    .select("content")
    .eq("project_id", projectId)
    .eq("path", filePath)
    .maybeSingle();

  if (!file) {
    if (filePath === "index.html") {
      return new Response(
        "<!doctype html><meta charset='utf-8'><title>Building…</title><body style='background:#0a0a0a;color:#e5e5e5;font-family:system-ui;display:grid;place-items:center;min-height:100vh'><div style='text-align:center'><div style='font-size:40px'>🛠️</div><p>This app is still being built — check back in a moment.</p></div>",
        { headers: { ...CORS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
      );
    }
    return notFound();
  }

  return new Response(file.content, {
    headers: {
      ...CORS,
      "Content-Type": contentTypeFor(filePath),
      // Apps change on every edit — always revalidate, never cache stale builds.
      "Cache-Control": "no-cache",
      "X-Robots-Tag": "noindex",
      // Generated apps are untrusted content: keep them sandbox-adjacent.
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
});

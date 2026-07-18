// DeHub Builder public host — the clean front door for a generated app.
//
// GET /functions/v1/builder-serve/<projectId>/            → the app's index.html
// GET /functions/v1/builder-serve/<projectId>/<file>      → that file
//
// The functions origin force-downgrades text/html → text/plain (Supabase
// anti-phishing), so it can't render HTML itself. Instead the real bytes live
// in the public `builder-apps` Storage bucket (written by builder-api), which
// honors each object's content-type. This function checks the project is public
// and that the file exists, then 302-redirects to the Storage object — so the
// app renders correctly here, in the preview iframe, and at its share link,
// while keeping the per-project is_public gate and a brandable URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUILDER_BUCKET = "builder-apps";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function notFound(message = "Not found"): Response {
  return new Response(message, {
    status: 404,
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

function buildingPage(): Response {
  // Served as text/plain by the platform, but the meta-refresh still fires, so
  // the page reloads itself until the first files land.
  return new Response(
    "<!doctype html><meta charset='utf-8'><meta http-equiv='refresh' content='3'><title>Building…</title><body style='background:#0a0a0a;color:#e5e5e5;font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0'><div style='text-align:center'><div style='font-size:40px'>🛠️</div><p>This app is still being built — hang tight.</p></div>",
    { headers: { ...CORS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return new Response("GET only", { status: 405, headers: CORS });

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const fnIndex = parts.indexOf("builder-serve");
  const projectId = fnIndex >= 0 ? parts[fnIndex + 1] : undefined;
  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
    return notFound("Missing or invalid app id");
  }

  const rest = parts.slice(fnIndex + 2).join("/");
  // Root without trailing slash → redirect so relative asset paths resolve.
  if (!rest && !url.pathname.endsWith("/")) {
    return new Response(null, {
      status: 301,
      headers: { ...CORS, Location: `${url.pathname}/${url.search}` },
    });
  }

  const filePath = decodeURIComponent(rest || "index.html");
  if (filePath.includes("..")) return notFound();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: project } = await db
    .from("builder_projects")
    .select("id, is_public")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || !project.is_public) return notFound("This app does not exist or is private");

  // Confirm the file was generated (builder_files is the source of truth).
  const { data: file } = await db
    .from("builder_files")
    .select("path")
    .eq("project_id", projectId)
    .eq("path", filePath)
    .maybeSingle();
  if (!file) {
    return filePath === "index.html" ? buildingPage() : notFound();
  }

  // Hand off to Storage, which renders the object with its real content-type.
  // Forward any ?v= cache-buster so a reloaded iframe fetches the new version.
  const target = `${supabaseUrl}/storage/v1/object/public/${BUILDER_BUCKET}/${projectId}/${encodeURIComponent(
    filePath,
  )}${url.search}`;
  return new Response(null, {
    status: 302,
    headers: { ...CORS, Location: target, "Cache-Control": "no-cache", "X-Robots-Tag": "noindex" },
  });
});

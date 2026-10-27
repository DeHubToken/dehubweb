// DeHub Builder host — the origin behind https://<slug>.dehub.app.
//
// Subdomain mode (what the dehub-builder-apps Worker calls):
//   GET /functions/v1/builder-serve?host=<slug>&path=<file>[&t=<previewToken>]
// Returns the file's raw bytes from builder_files with the real type in
// x-builder-content-type. The functions origin force-downgrades text/html to
// text/plain (Supabase anti-phishing), so the Worker re-emits the body under
// that header on the app's own origin. Public apps need no token; private apps
// need a preview token builder-api signed for their owner.
//
//   GET /functions/v1/builder-serve?host=<slug>&manifest=1
// The app's generated /.well-known/dehub.json (published apps only), so the
// store registry can crawl a Builder app like any other mini app.
//
// Legacy mode (links shared before subdomains existed, older mobile builds):
//   GET /functions/v1/builder-serve/<projectId>/[file]
// 302s to the public Storage mirror. Only public apps keep that mirror.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { appOrigin, contentTypeFor, verifyPreviewToken } from "../_shared/builder-host.ts";

const BUILDER_BUCKET = "builder-apps";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-wallet-address, x-dehub-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-request-id, prefer",
  "Access-Control-Expose-Headers": "x-builder-content-type, x-builder-version, x-builder-private",
};

function notFound(message = "Not found"): Response {
  return new Response(message, {
    status: 404,
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

const BUILDING_HTML =
  "<!doctype html><meta charset='utf-8'><meta http-equiv='refresh' content='3'><title>Building…</title><body style='background:#0a0a0a;color:#e5e5e5;font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0'><div style='text-align:center'><div style='font-size:40px'>🛠️</div><p>This app is still being built — hang tight.</p></div>";

function buildingPage(): Response {
  return new Response(BUILDING_HTML, {
    headers: { ...CORS, "Content-Type": "text/html; charset=utf-8", "x-builder-content-type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// deno-lint-ignore no-explicit-any
type Db = any;

async function serveHost(db: Db, url: URL): Promise<Response> {
  const slug = (url.searchParams.get("host") ?? "").toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return notFound("Unknown app");

  const { data: project } = await db
    .from("builder_projects")
    .select("id, name, emoji, is_public, version, miniapp_app_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!project) return notFound("This app does not exist");

  if (url.searchParams.get("manifest")) {
    if (!project.is_public || !project.miniapp_app_id) return notFound();
    const origin = appOrigin(slug);
    const manifest = {
      name: project.name,
      homeUrl: `${origin}/`,
      iconUrl: `${origin}/icon.svg`,
      description: `${project.name} — built with DeHub Builder.`,
      category: "utility",
    };
    return new Response(JSON.stringify(manifest), {
      headers: { ...CORS, "Content-Type": "application/json", "x-builder-content-type": "application/json; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  if (!project.is_public) {
    const token = url.searchParams.get("t") ?? "";
    if ((await verifyPreviewToken(token)) !== project.id) return notFound("This app is private");
  }

  const filePath = (url.searchParams.get("path") || "index.html").replace(/^\/+/, "");
  if (filePath.includes("..")) return notFound();

  const headers = {
    ...CORS,
    "Cache-Control": "no-cache",
    "x-builder-version": String(project.version ?? 0),
    "x-builder-private": project.is_public ? "0" : "1",
  };

  // Every app gets an icon even though the model never draws one: its emoji.
  if (filePath === "icon.svg") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#111"/><text x="50" y="68" font-size="58" text-anchor="middle">${project.emoji}</text></svg>`;
    return new Response(svg, { headers: { ...headers, "Content-Type": "image/svg+xml", "x-builder-content-type": "image/svg+xml" } });
  }

  const { data: file } = await db
    .from("builder_files")
    .select("content")
    .eq("project_id", project.id)
    .eq("path", filePath)
    .maybeSingle();
  if (!file) return filePath === "index.html" ? buildingPage() : notFound();

  const type = contentTypeFor(filePath);
  return new Response(file.content, { headers: { ...headers, "Content-Type": type, "x-builder-content-type": type } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return new Response("GET only", { status: 405, headers: CORS });

  const url = new URL(req.url);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  if (url.searchParams.has("host")) return serveHost(db, url);

  // GET ?app=<projectId> → where a public app lives, for the dehub.io preview page.
  const appId = url.searchParams.get("app");
  if (appId) {
    if (!/^[0-9a-f-]{36}$/i.test(appId)) return notFound();
    const { data: app } = await db
      .from("builder_projects")
      .select("slug, name, emoji, version, is_public")
      .eq("id", appId)
      .maybeSingle();
    if (!app || !app.is_public) return notFound();
    return new Response(
      JSON.stringify({ slug: app.slug, name: app.name, emoji: app.emoji, version: app.version, url: app.slug ? `${appOrigin(app.slug)}/` : null }),
      { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-cache" } },
    );
  }

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

  const { data: project } = await db
    .from("builder_projects")
    .select("id, is_public")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || !project.is_public) return notFound("This app does not exist or is private");

  const { data: file } = await db
    .from("builder_files")
    .select("path")
    .eq("project_id", projectId)
    .eq("path", filePath)
    .maybeSingle();
  if (!file) {
    return filePath === "index.html" ? buildingPage() : notFound();
  }

  // Encode each segment, not the slashes between them.
  const encoded = filePath.split("/").map(encodeURIComponent).join("/");
  const target = `${supabaseUrl}/storage/v1/object/public/${BUILDER_BUCKET}/${projectId}/${encoded}${url.search}`;
  return new Response(null, {
    status: 302,
    headers: { ...CORS, Location: target, "Cache-Control": "no-cache", "X-Robots-Tag": "noindex" },
  });
});
